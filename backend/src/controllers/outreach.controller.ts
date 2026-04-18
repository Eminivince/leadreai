import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import Campaign from '../models/Campaign.js';
import Lead from '../models/Lead.js';
import Workspace from '../models/Workspace.js';
import OutreachDraft from '../models/OutreachDraft.js';
import { ApiError } from '../utils/ApiError.js';
import { getOutreachQueue } from '../services/queue/queues.js';
import { generateOutreachDraft } from '../services/ai/outreachDraftService.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// generateSingleDraft  POST /api/v1/workspaces/:workspaceId/outreach/generate
// ---------------------------------------------------------------------------

export async function generateSingleDraft(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();

  const { workspaceId } = req.params;
  const { campaignId, leadId } = req.body as { campaignId?: unknown; leadId?: unknown };

  if (typeof campaignId !== 'string' || !mongoose.Types.ObjectId.isValid(campaignId)) {
    throw ApiError.badRequest('campaignId must be a valid ObjectId');
  }
  if (typeof leadId !== 'string' || !mongoose.Types.ObjectId.isValid(leadId)) {
    throw ApiError.badRequest('leadId must be a valid ObjectId');
  }

  const [workspace, campaign, lead] = await Promise.all([
    Workspace.findById(workspaceId),
    Campaign.findOne({ _id: campaignId, workspaceId }),
    Lead.findOne({ _id: leadId, workspaceId }),
  ]);

  if (!workspace) throw ApiError.notFound('Workspace not found');
  if (!campaign) throw ApiError.notFound('Campaign not found');
  if (!lead) throw ApiError.notFound('Lead not found');

  // For single-draft (quick preview), skip SerpAPI research — pass [] snippets
  const snippets: string[] = [];

  const result = await generateOutreachDraft(
    {
      companyName: lead.companyName,
      companyDomain: lead.companyDomain,
      website: lead.website,
      industry: lead.industry,
      address: lead.address,
      socialProfiles: lead.socialProfiles,
    },
    {
      name: workspace.name,
      settings: { cheapMode: workspace.settings?.cheapMode },
      knowledgeBase: workspace.knowledgeBase?.map((kb) => ({
        title: kb.title,
        content: kb.content,
        type: kb.type,
      })),
    },
    {
      name: campaign.name,
      outreachConfig: {
        tone: campaign.outreachConfig?.tone,
        language: campaign.outreachConfig?.language,
        channel: campaign.outreachConfig?.channel,
      },
    },
    snippets,
  );

  const draft = await OutreachDraft.create({
    workspaceId,
    campaignId,
    leadId,
    createdBy: req.user._id,
    channel: campaign.outreachConfig?.channel ?? 'email',
    firstLine: result.firstLine,
    subject: result.subject,
    body: result.body,
    tone: campaign.outreachConfig?.tone ?? 'professional',
    language: campaign.outreachConfig?.language ?? 'English',
    promptUsed: `single-draft:${campaign._id}`,
    modelResponse: JSON.stringify(result),
    reasoning: result.reasoning,
    status: 'draft',
  });

  res.status(201).json({ success: true, data: draft });
}

// ---------------------------------------------------------------------------
// generateCampaignDrafts  POST /api/v1/workspaces/:workspaceId/campaigns/:campaignId/generate
// ---------------------------------------------------------------------------

export async function generateCampaignDrafts(req: Request, res: Response): Promise<void> {
  const { workspaceId, campaignId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(campaignId!)) {
    throw ApiError.badRequest('Invalid campaignId');
  }

  const body = req.body as { tone?: unknown; language?: unknown };

  const campaign = await Campaign.findOne({ _id: campaignId, workspaceId });
  if (!campaign) throw ApiError.notFound('Campaign not found');

  if (!campaign.leadIds || campaign.leadIds.length === 0) {
    throw ApiError.badRequest('Campaign has no leads');
  }

  // Optionally update outreachConfig tone/language if provided
  const setFields: Record<string, unknown> = {};
  if (typeof body.tone === 'string' && body.tone.trim()) {
    setFields['outreachConfig.tone'] = body.tone.trim();
  }
  if (typeof body.language === 'string' && body.language.trim()) {
    setFields['outreachConfig.language'] = body.language.trim();
  }
  if (Object.keys(setFields).length > 0) {
    await Campaign.updateOne({ _id: campaignId }, { $set: setFields });
  }

  const queue = getOutreachQueue();
  const job = await queue.add(
    'generate-outreach',
    {
      campaignId: campaign._id.toString(),
      workspaceId,
      leadIds: campaign.leadIds.map((id) => id.toString()),
    },
    {
      // jobId = campaignId deduplicates: re-calling this endpoint while a job is queued/active
      // will return the existing job's ID rather than enqueue a duplicate run.
      jobId: campaign._id.toString(),
    },
  );

  res.status(202).json({ success: true, data: { bullmqJobId: job.id } });
}

// ---------------------------------------------------------------------------
// streamCampaignGeneration  GET /api/v1/workspaces/:workspaceId/campaigns/:campaignId/generate/stream
// (SSE — NOT wrapped in asyncHandler, handles its own errors)
// ---------------------------------------------------------------------------

export async function streamCampaignGeneration(req: Request, res: Response): Promise<void> {
  const { workspaceId, campaignId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(campaignId!)) {
    res.status(400).json({ success: false, error: 'Invalid campaignId' });
    return;
  }

  const campaign = await Campaign.findOne({ _id: campaignId, workspaceId });
  if (!campaign) {
    res.status(404).json({ success: false, error: 'Campaign not found' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send initial connected + bootstrap progress so late-connecting clients know current state
  const doneCount = await OutreachDraft.countDocuments({ campaignId, workspaceId });
  send({ type: 'connected', campaignId });
  send({ type: 'bootstrap', done: doneCount, total: campaign.leadIds?.length ?? 0 });

  // Dedicated Redis connection for pub/sub
  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  subscriber.on('error', (err) => logger.error('SSE outreach subscriber error', { err }));

  const channel = `outreach:progress:${campaignId}`;

  const heartbeat = setInterval(() => {
    send({ type: 'heartbeat' });
  }, 30_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    subscriber.unsubscribe(channel).catch(() => {});
    subscriber.quit().catch(() => {});
  });

  await subscriber.subscribe(channel);
  subscriber.on('message', (_chan: string, message: string) => {
    res.write(`data: ${message}\n\n`);
  });
}

// ---------------------------------------------------------------------------
// listDrafts  GET /api/v1/workspaces/:workspaceId/outreach
// ---------------------------------------------------------------------------

export async function listDrafts(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;

  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10) || 20));

  const filter: Record<string, unknown> = { workspaceId };

  const campaignIdQ = req.query['campaignId'];
  if (typeof campaignIdQ === 'string') {
    if (!mongoose.Types.ObjectId.isValid(campaignIdQ)) {
      throw ApiError.badRequest('Invalid campaignId filter');
    }
    filter['campaignId'] = campaignIdQ;
  }

  const leadIdQ = req.query['leadId'];
  if (typeof leadIdQ === 'string') {
    if (!mongoose.Types.ObjectId.isValid(leadIdQ)) {
      throw ApiError.badRequest('Invalid leadId filter');
    }
    filter['leadId'] = leadIdQ;
  }

  const statusQ = req.query['status'];
  const VALID_DRAFT_STATUSES = ['draft', 'approved', 'sent', 'failed'];
  if (typeof statusQ === 'string') {
    if (!VALID_DRAFT_STATUSES.includes(statusQ)) {
      throw ApiError.badRequest(`status must be one of: ${VALID_DRAFT_STATUSES.join(', ')}`);
    }
    filter['status'] = statusQ;
  }

  const [drafts, total] = await Promise.all([
    OutreachDraft.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    OutreachDraft.countDocuments(filter),
  ]);

  res.json({ success: true, data: { data: drafts, total, page, limit } });
}

// ---------------------------------------------------------------------------
// getDraft  GET /api/v1/workspaces/:workspaceId/outreach/:draftId
// ---------------------------------------------------------------------------

export async function getDraft(req: Request, res: Response): Promise<void> {
  const { workspaceId, draftId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(draftId!)) {
    throw ApiError.badRequest('Invalid draftId');
  }

  const draft = await OutreachDraft.findOne({ _id: draftId, workspaceId });
  if (!draft) throw ApiError.notFound('Draft not found');

  res.json({ success: true, data: draft });
}

// ---------------------------------------------------------------------------
// updateDraft  PATCH /api/v1/workspaces/:workspaceId/outreach/:draftId
// ---------------------------------------------------------------------------

export async function updateDraft(req: Request, res: Response): Promise<void> {
  const { workspaceId, draftId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(draftId!)) {
    throw ApiError.badRequest('Invalid draftId');
  }

  const body = req.body as { subject?: unknown; body?: unknown; firstLine?: unknown };
  const setFields: Record<string, unknown> = {};

  if (body.subject !== undefined) {
    if (typeof body.subject !== 'string') throw ApiError.badRequest('subject must be a string');
    setFields['subject'] = body.subject;
  }
  if (body.body !== undefined) {
    if (typeof body.body !== 'string') throw ApiError.badRequest('body must be a string');
    setFields['body'] = body.body;
  }
  if (body.firstLine !== undefined) {
    if (typeof body.firstLine !== 'string') throw ApiError.badRequest('firstLine must be a string');
    setFields['firstLine'] = body.firstLine;
  }

  if (Object.keys(setFields).length === 0) {
    throw ApiError.badRequest('No valid fields to update');
  }

  const draft = await OutreachDraft.findOneAndUpdate(
    { _id: draftId, workspaceId },
    { $set: setFields },
    { new: true, runValidators: true },
  );

  if (!draft) throw ApiError.notFound('Draft not found');

  res.json({ success: true, data: draft });
}

// ---------------------------------------------------------------------------
// approveDraft  POST /api/v1/workspaces/:workspaceId/outreach/:draftId/approve
// ---------------------------------------------------------------------------

export async function approveDraft(req: Request, res: Response): Promise<void> {
  const { workspaceId, draftId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(draftId!)) {
    throw ApiError.badRequest('Invalid draftId');
  }

  const draft = await OutreachDraft.findOneAndUpdate(
    { _id: draftId, workspaceId },
    { $set: { status: 'approved' } },
    { new: true },
  );

  if (!draft) throw ApiError.notFound('Draft not found');

  res.json({ success: true, data: draft });
}

// ---------------------------------------------------------------------------
// deleteDraft  DELETE /api/v1/workspaces/:workspaceId/outreach/:draftId
// ---------------------------------------------------------------------------

export async function deleteDraft(req: Request, res: Response): Promise<void> {
  const { workspaceId, draftId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(draftId!)) {
    throw ApiError.badRequest('Invalid draftId');
  }

  const draft = await OutreachDraft.findOneAndDelete({ _id: draftId, workspaceId });
  if (!draft) throw ApiError.notFound('Draft not found');

  res.json({ success: true });
}
