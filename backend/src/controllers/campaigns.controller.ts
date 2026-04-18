import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Campaign from '../models/Campaign.js';
import OutreachDraft from '../models/OutreachDraft.js';
import Lead from '../models/Lead.js';
import { ApiError } from '../utils/ApiError.js';
import { logAudit } from '../services/audit.js';

export async function listCampaigns(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10) || 20));
  const status = req.query['status'] as string | undefined;

  const VALID_STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'];
  if (status && !VALID_STATUSES.includes(status)) {
    throw ApiError.badRequest(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const filter: Record<string, unknown> = { workspaceId };
  if (status) filter['status'] = status;

  const [campaigns, total] = await Promise.all([
    Campaign.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Campaign.countDocuments(filter),
  ]);

  res.json({ success: true, data: { data: campaigns, total, page, limit } });
}

export async function createCampaign(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { workspaceId } = req.params;
  const body = req.body as {
    name?: string;
    description?: string;
    tone?: string;
    language?: string;
  };

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    throw ApiError.badRequest('name is required');
  }
  if (body.name.trim().length > 200) {
    throw ApiError.badRequest('name must be 200 characters or fewer');
  }

  if (body.tone !== undefined && (typeof body.tone !== 'string' || !body.tone.trim())) {
    throw ApiError.badRequest('tone must be a non-empty string');
  }
  if (body.language !== undefined && (typeof body.language !== 'string' || !body.language.trim())) {
    throw ApiError.badRequest('language must be a non-empty string');
  }

  const campaign = await Campaign.create({
    workspaceId: workspaceId!,
    createdBy: req.user._id,
    name: body.name.trim(),
    description: body.description,
    status: 'draft',
    outreachConfig: {
      channel: 'email',
      tone: body.tone?.trim() ?? 'professional',
      language: body.language?.trim() ?? 'English',
      personalization: [],
    },
  });

  logAudit({
    req,
    workspaceId: workspaceId!,
    action: 'campaign.create',
    resourceType: 'campaign',
    resourceId: campaign._id,
    metadata: { name: campaign.name },
  });

  res.status(201).json({ success: true, data: campaign });
}

export async function getCampaign(req: Request, res: Response): Promise<void> {
  const { workspaceId, campaignId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(campaignId!)) {
    throw ApiError.badRequest('Invalid campaignId');
  }

  const campaign = await Campaign.findOne({ _id: campaignId, workspaceId });
  if (!campaign) throw ApiError.notFound('Campaign not found');

  res.json({ success: true, data: campaign });
}

export async function updateCampaign(req: Request, res: Response): Promise<void> {
  const { workspaceId, campaignId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(campaignId!)) {
    throw ApiError.badRequest('Invalid campaignId');
  }

  const body = req.body as {
    name?: string;
    description?: string;
    tone?: string;
    language?: string;
  };

  const setFields: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw ApiError.badRequest('name must be a non-empty string');
    }
    if (body.name.trim().length > 200) {
      throw ApiError.badRequest('name must be 200 characters or fewer');
    }
    setFields['name'] = body.name.trim();
  }

  if (body.description !== undefined) {
    setFields['description'] = body.description;
  }

  if (body.tone !== undefined) {
    if (typeof body.tone !== 'string' || !body.tone.trim()) {
      throw ApiError.badRequest('tone must be a non-empty string');
    }
    setFields['outreachConfig.tone'] = body.tone.trim();
  }

  if (body.language !== undefined) {
    if (typeof body.language !== 'string' || !body.language.trim()) {
      throw ApiError.badRequest('language must be a non-empty string');
    }
    setFields['outreachConfig.language'] = body.language.trim();
  }

  if (Object.keys(setFields).length === 0) {
    throw ApiError.badRequest('No valid fields to update');
  }

  const campaign = await Campaign.findOneAndUpdate(
    { _id: campaignId, workspaceId },
    { $set: setFields },
    { new: true, runValidators: true }
  );

  if (!campaign) throw ApiError.notFound('Campaign not found');

  res.json({ success: true, data: campaign });
}

export async function deleteCampaign(req: Request, res: Response): Promise<void> {
  const { workspaceId, campaignId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(campaignId!)) {
    throw ApiError.badRequest('Invalid campaignId');
  }

  const campaign = await Campaign.findOne({ _id: campaignId, workspaceId });
  if (!campaign) throw ApiError.notFound('Campaign not found');

  // Delete drafts first — orphaned drafts are unrecoverable if campaign is gone first
  await OutreachDraft.deleteMany({ campaignId: new mongoose.Types.ObjectId(campaignId!) });
  await Campaign.deleteOne({ _id: campaignId });

  logAudit({
    req,
    workspaceId: workspaceId!,
    action: 'campaign.delete',
    resourceType: 'campaign',
    resourceId: campaign._id,
    metadata: { name: campaign.name },
  });

  res.json({ success: true });
}

export async function addLeads(req: Request, res: Response): Promise<void> {
  const { workspaceId, campaignId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(campaignId!)) {
    throw ApiError.badRequest('Invalid campaignId');
  }

  const { leadIds } = req.body as { leadIds?: unknown };

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    throw ApiError.badRequest('leadIds must be a non-empty array');
  }
  if (leadIds.length > 100) {
    throw ApiError.badRequest('Cannot add more than 100 leads per call');
  }

  for (const id of leadIds) {
    if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest(`Invalid leadId: ${String(id)}`);
    }
  }

  const objectIds = leadIds.map((id) => new mongoose.Types.ObjectId(id as string));

  // Validate all leads belong to this workspace
  const matchingCount = await Lead.countDocuments({
    _id: { $in: objectIds },
    workspaceId: workspaceId!,
  });

  if (matchingCount !== objectIds.length) {
    throw ApiError.badRequest('One or more leads do not belong to this workspace');
  }

  const campaign = await Campaign.findOneAndUpdate(
    { _id: campaignId, workspaceId },
    { $addToSet: { leadIds: { $each: objectIds } } },
    { new: true }
  );

  if (!campaign) throw ApiError.notFound('Campaign not found');

  res.json({ success: true, data: campaign });
}

export async function removeLeadFromCampaign(req: Request, res: Response): Promise<void> {
  const { workspaceId, campaignId, leadId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(campaignId!)) {
    throw ApiError.badRequest('Invalid campaignId');
  }
  if (!mongoose.Types.ObjectId.isValid(leadId!)) {
    throw ApiError.badRequest('Invalid leadId');
  }

  const leadOid = new mongoose.Types.ObjectId(leadId);
  const result = await Campaign.updateOne(
    { _id: campaignId, workspaceId, leadIds: leadOid },
    { $pull: { leadIds: leadOid } }
  );

  if (result.matchedCount === 0) {
    // Could be campaign not found or lead not in campaign
    const exists = await Campaign.exists({ _id: campaignId, workspaceId });
    throw exists ? ApiError.notFound('Lead not found in campaign') : ApiError.notFound('Campaign not found');
  }

  res.json({ success: true });
}

export async function listCampaignLeads(req: Request, res: Response): Promise<void> {
  const { workspaceId, campaignId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(campaignId!)) {
    throw ApiError.badRequest('Invalid campaignId');
  }

  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10) || 20));

  const campaign = await Campaign.findOne({ _id: campaignId, workspaceId }).select('leadIds');
  if (!campaign) throw ApiError.notFound('Campaign not found');

  if (campaign.leadIds.length === 0) {
    res.json({ success: true, data: { data: [], total: 0, page, limit } });
    return;
  }

  const leadFilter = { _id: { $in: campaign.leadIds }, workspaceId };

  const [leads, total] = await Promise.all([
    Lead.find(leadFilter).skip((page - 1) * limit).limit(limit),
    Lead.countDocuments(leadFilter),
  ]);

  res.json({ success: true, data: { data: leads, total, page, limit } });
}
