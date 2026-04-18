import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Sequence from '../models/Sequence.js';
import SequenceEnrollment from '../models/SequenceEnrollment.js';
import Lead from '../models/Lead.js';
import { SuppressionEntry } from '../models/SuppressionList.js';
import { ApiError } from '../utils/ApiError.js';
import { logAudit } from '../services/audit.js';

const VALID_SEQUENCE_STATUSES = ['draft', 'active', 'paused', 'archived'] as const;

export async function listSequences(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10) || 20));
  const status = req.query['status'] as string | undefined;

  if (status && !VALID_SEQUENCE_STATUSES.includes(status as typeof VALID_SEQUENCE_STATUSES[number])) {
    throw ApiError.badRequest(`status must be one of: ${VALID_SEQUENCE_STATUSES.join(', ')}`);
  }

  const filter: Record<string, unknown> = { workspaceId };
  if (status) filter['status'] = status;

  const [sequences, total] = await Promise.all([
    Sequence.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Sequence.countDocuments(filter),
  ]);
  res.json({ success: true, data: { data: sequences, total, page, limit } });
}

export async function createSequence(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { workspaceId } = req.params;
  const { name, description, steps, stopRules, tags } = req.body as {
    name?: string;
    description?: string;
    steps?: unknown[];
    stopRules?: unknown[];
    tags?: string[];
  };

  if (!name || typeof name !== 'string' || !name.trim()) throw ApiError.badRequest('name is required');
  if (name.trim().length > 200) throw ApiError.badRequest('name must be 200 characters or fewer');

  const sequence = await Sequence.create({
    workspaceId,
    createdBy: req.user._id,
    name: name.trim(),
    description,
    steps: steps ?? [],
    stopRules: stopRules ?? [
      { trigger: 'any_reply', action: 'stop_sequence' },
      { trigger: 'unsubscribe', action: 'stop_sequence' },
      { trigger: 'bounce', action: 'stop_sequence' },
    ],
    tags: tags ?? [],
  });

  logAudit({ req, workspaceId: workspaceId!, action: 'sequence.create', resourceType: 'sequence', resourceId: sequence._id, metadata: { name: sequence.name } });

  res.status(201).json({ success: true, data: sequence });
}

export async function getSequence(req: Request, res: Response): Promise<void> {
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const sequence = await Sequence.findOne({ _id: sequenceId, workspaceId });
  if (!sequence) throw ApiError.notFound('Sequence not found');
  res.json({ success: true, data: sequence });
}

export async function updateSequence(req: Request, res: Response): Promise<void> {
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const { name, description, steps, stopRules, status, tags } = req.body as {
    name?: string;
    description?: string;
    steps?: unknown[];
    stopRules?: unknown[];
    status?: string;
    tags?: string[];
  };

  const setFields: Record<string, unknown> = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) throw ApiError.badRequest('name must be non-empty');
    setFields['name'] = name.trim();
  }
  if (description !== undefined) setFields['description'] = description;
  if (steps !== undefined) setFields['steps'] = steps;
  if (stopRules !== undefined) setFields['stopRules'] = stopRules;
  if (status !== undefined) {
    if (!VALID_SEQUENCE_STATUSES.includes(status as typeof VALID_SEQUENCE_STATUSES[number])) {
      throw ApiError.badRequest(`status must be one of: ${VALID_SEQUENCE_STATUSES.join(', ')}`);
    }
    setFields['status'] = status;
  }
  if (tags !== undefined) setFields['tags'] = tags;

  if (Object.keys(setFields).length === 0) throw ApiError.badRequest('No valid fields to update');

  const sequence = await Sequence.findOneAndUpdate(
    { _id: sequenceId, workspaceId },
    { $set: setFields },
    { new: true, runValidators: true },
  );
  if (!sequence) throw ApiError.notFound('Sequence not found');
  res.json({ success: true, data: sequence });
}

export async function archiveSequence(req: Request, res: Response): Promise<void> {
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const sequence = await Sequence.findOneAndUpdate(
    { _id: sequenceId, workspaceId },
    { $set: { status: 'archived' } },
    { new: true },
  );
  if (!sequence) throw ApiError.notFound('Sequence not found');

  await SequenceEnrollment.updateMany(
    { sequenceId, status: 'active' },
    { $set: { status: 'paused', stopReason: 'sequence_archived' } },
  );

  logAudit({ req, workspaceId: workspaceId!, action: 'sequence.archive', resourceType: 'sequence', resourceId: sequence._id, metadata: {} });
  res.json({ success: true, data: sequence });
}

export async function enrollLeads(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const { leadIds, contactId } = req.body as { leadIds?: unknown; contactId?: string };

  if (!Array.isArray(leadIds) || leadIds.length === 0) throw ApiError.badRequest('leadIds must be a non-empty array');
  if (leadIds.length > 200) throw ApiError.badRequest('Cannot enroll more than 200 leads at once');
  for (const id of leadIds) {
    if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) throw ApiError.badRequest(`Invalid leadId: ${String(id)}`);
  }

  const sequence = await Sequence.findOne({ _id: sequenceId, workspaceId });
  if (!sequence) throw ApiError.notFound('Sequence not found');
  if (sequence.status === 'archived') throw ApiError.badRequest('Cannot enroll into an archived sequence');
  if (sequence.steps.length === 0) throw ApiError.badRequest('Sequence has no steps');

  const step1 = sequence.steps.find(s => s.stepNumber === 1);
  if (!step1) throw ApiError.badRequest('Sequence must have a step 1');

  const leadObjectIds = leadIds.map((id) => new mongoose.Types.ObjectId(id as string));

  const matchCount = await Lead.countDocuments({ _id: { $in: leadObjectIds }, workspaceId });
  if (matchCount !== leadObjectIds.length) throw ApiError.badRequest('One or more leads do not belong to this workspace');

  const leads = await Lead.find({ _id: { $in: leadObjectIds } }).select('emails');
  const suppressedEmailSet = new Set<string>();
  const allEmails = leads.flatMap(l => l.emails.map(e => e.address.toLowerCase()));
  if (allEmails.length > 0) {
    const suppressedEntries = await SuppressionEntry.find({
      workspaceId,
      $or: [
        { email: { $in: allEmails } },
        { domain: { $in: allEmails.map(e => e.split('@')[1]).filter(Boolean) } },
      ],
    }).select('email domain');

    for (const entry of suppressedEntries) {
      if (entry.email) suppressedEmailSet.add(entry.email);
    }
  }

  const now = new Date();
  const nextStepAt = new Date(now.getTime() + step1.delayDays * 86_400_000);
  const userId = req.user._id;

  let enrolled = 0;
  let skipped = 0;

  for (const leadId of leadObjectIds) {
    const alreadyEnrolled = await SequenceEnrollment.exists({ sequenceId, leadId });
    if (alreadyEnrolled) { skipped++; continue; }

    const lead = leads.find(l => l._id.toString() === leadId.toString());
    const primaryEmail = lead?.emails[0]?.address.toLowerCase();
    if (primaryEmail && suppressedEmailSet.has(primaryEmail)) { skipped++; continue; }

    await SequenceEnrollment.create({
      workspaceId,
      sequenceId,
      leadId,
      contactId: contactId && mongoose.Types.ObjectId.isValid(contactId) ? new mongoose.Types.ObjectId(contactId) : undefined,
      enrolledBy: userId,
      status: 'active',
      currentStep: 1,
      nextStepAt,
    });
    enrolled++;
  }

  await Sequence.updateOne({ _id: sequenceId }, { $inc: { 'stats.totalEnrolled': enrolled, 'stats.active': enrolled } });

  res.json({ success: true, data: { enrolled, skipped } });
}

export async function pauseSequence(req: Request, res: Response): Promise<void> {
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const sequence = await Sequence.findOne({ _id: sequenceId, workspaceId });
  if (!sequence) throw ApiError.notFound('Sequence not found');

  await Sequence.updateOne({ _id: sequenceId }, { $set: { status: 'paused' } });
  await SequenceEnrollment.updateMany({ sequenceId, status: 'active' }, { $set: { status: 'paused' } });

  res.json({ success: true });
}

export async function resumeSequence(req: Request, res: Response): Promise<void> {
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const sequence = await Sequence.findOne({ _id: sequenceId, workspaceId });
  if (!sequence) throw ApiError.notFound('Sequence not found');

  await Sequence.updateOne({ _id: sequenceId }, { $set: { status: 'active' } });
  await SequenceEnrollment.updateMany(
    { sequenceId, status: 'paused' },
    { $set: { status: 'active', nextStepAt: new Date() } },
  );

  res.json({ success: true });
}

export async function getSequenceStats(req: Request, res: Response): Promise<void> {
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const sequence = await Sequence.findOne({ _id: sequenceId, workspaceId }).select('stats steps name');
  if (!sequence) throw ApiError.notFound('Sequence not found');

  const perStep = await SequenceEnrollment.aggregate([
    { $match: { sequenceId: new mongoose.Types.ObjectId(sequenceId) } },
    { $unwind: '$stepHistory' },
    {
      $group: {
        _id: '$stepHistory.stepNumber',
        sent: { $sum: { $cond: [{ $in: ['$stepHistory.status', ['sent', 'delivered', 'opened', 'clicked', 'replied']] }, 1, 0] } },
        opened: { $sum: { $cond: [{ $eq: ['$stepHistory.openedAt', null] }, 0, 1] } },
        replied: { $sum: { $cond: [{ $eq: ['$stepHistory.repliedAt', null] }, 0, 1] } },
        bounced: { $sum: { $cond: [{ $eq: ['$stepHistory.status', 'bounced'] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({ success: true, data: { summary: sequence.stats, perStep } });
}
