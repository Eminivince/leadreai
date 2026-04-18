import { type Request, type Response } from 'express';
import Lead from '../models/Lead.js';
import { ApiError } from '../utils/ApiError.js';

export async function listLeads(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const {
    jobId,
    country,
    industry,
    hasEmail,
    hasPhone,
    isDuplicate = 'false',
    page: pageStr,
    limit: limitStr,
    sortBy = 'rankScore',
    sortOrder = 'desc',
    q,
  } = req.query as Record<string, string | undefined>;

  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
  const limit = Math.min(parseInt(limitStr ?? '20', 10) || 20, 100);
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { workspaceId };
  if (jobId) filter.jobId = jobId;
  if (country) filter['address.country'] = new RegExp(country, 'i');
  if (industry) filter.industry = new RegExp(industry, 'i');
  if (hasEmail === 'true') filter['emails.0'] = { $exists: true };
  if (hasPhone === 'true') filter['phones.0'] = { $exists: true };
  filter.isDuplicate = isDuplicate === 'true';
  if (q) filter.$text = { $search: q };

  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [leads, total] = await Promise.all([
    Lead.find(filter).sort({ [sortBy]: sortDirection }).skip(skip).limit(limit),
    Lead.countDocuments(filter),
  ]);

  res.json({ success: true, data: leads, total, page, limit });
}

export async function getLead(req: Request, res: Response): Promise<void> {
  const { workspaceId, leadId } = req.params;

  const lead = await Lead.findOne({ _id: leadId, workspaceId });
  if (!lead) throw ApiError.notFound('Lead not found');

  res.json({ success: true, data: lead });
}

export async function updateLead(req: Request, res: Response): Promise<void> {
  const { workspaceId, leadId } = req.params;

  const allowed = ['tags', 'notes', 'outreachStatus'];
  const update = Object.fromEntries(
    Object.entries(req.body as Record<string, unknown>).filter(([k]) => allowed.includes(k))
  );

  const lead = await Lead.findOneAndUpdate(
    { _id: leadId, workspaceId },
    { $set: update },
    { new: true }
  );
  if (!lead) throw ApiError.notFound('Lead not found');

  res.json({ success: true, data: lead });
}

export async function deleteLead(req: Request, res: Response): Promise<void> {
  const { workspaceId, leadId } = req.params;

  const lead = await Lead.findOneAndDelete({ _id: leadId, workspaceId });
  if (!lead) throw ApiError.notFound('Lead not found');

  res.json({ success: true });
}

export async function bulkTagLeads(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const { leadIds, tags, action } = req.body as {
    leadIds: string[];
    tags: string[];
    action: 'add' | 'remove';
  };

  const op =
    action === 'add'
      ? { $addToSet: { tags: { $each: tags } } }
      : { $pull: { tags: { $in: tags } } };

  await Lead.updateMany({ _id: { $in: leadIds }, workspaceId }, op);
  res.json({ success: true });
}

export async function bulkDeleteLeads(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const { leadIds } = req.body as { leadIds: string[] };

  await Lead.deleteMany({ _id: { $in: leadIds }, workspaceId });
  res.json({ success: true });
}
