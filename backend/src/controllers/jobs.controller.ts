import { type Request, type Response } from 'express';
import ProspectingJob from '../models/ProspectingJob.js';
import { parseQuery } from '../services/ai/queryParser.js';
import { dispatchProspectingJob } from '../services/queue/jobDispatcher.js';
import { getProspectingQueue } from '../services/queue/queues.js';
import { ApiError } from '../utils/ApiError.js';
import { JOB_STATUSES } from '@leadreai/shared';

export async function createJob(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const { rawQuery } = req.body as { rawQuery: string };

  const parsedIntent = await parseQuery(rawQuery);

  const job = await ProspectingJob.create({
    workspaceId,
    createdBy: req.user!._id,
    rawQuery,
    parsedIntent,
    status: 'queued',
  });

  let bullmqJob;
  try {
    bullmqJob = await dispatchProspectingJob(job._id.toString(), workspaceId!);
  } catch (err) {
    await ProspectingJob.deleteOne({ _id: job._id });
    throw err;
  }
  job.bullmqJobId = bullmqJob.id ?? undefined;
  await job.save();

  res.status(201).json({ success: true, data: job });
}

export async function listJobs(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
  const status = req.query.status as string | undefined;

  if (status && !(JOB_STATUSES as readonly string[]).includes(status)) {
    throw ApiError.badRequest('Invalid status value');
  }

  const filter: Record<string, unknown> = { workspaceId, ...(status ? { status } : {}) };
  const skip = (page - 1) * limit;

  const [jobs, total] = await Promise.all([
    ProspectingJob.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ProspectingJob.countDocuments(filter),
  ]);

  res.json({ success: true, data: jobs, total, page, limit });
}

export async function getJob(req: Request, res: Response): Promise<void> {
  const { workspaceId, jobId } = req.params;

  const job = await ProspectingJob.findOne({ _id: jobId, workspaceId });
  if (!job) throw ApiError.notFound('Job not found');

  res.json({ success: true, data: job });
}

export async function cancelJob(req: Request, res: Response): Promise<void> {
  const { workspaceId, jobId } = req.params;

  const job = await ProspectingJob.findOne({ _id: jobId, workspaceId });
  if (!job) throw ApiError.notFound('Job not found');

  if (['complete', 'failed', 'cancelled'].includes(job.status)) {
    throw ApiError.conflict('Job cannot be cancelled in its current state');
  }

  if (job.bullmqJobId) {
    const bullmqJob = await getProspectingQueue().getJob(job.bullmqJobId);
    await bullmqJob?.remove().catch(() => { /* job may already be active or completed */ });
  }
  job.status = 'cancelled';
  await job.save();

  res.json({ success: true, data: job });
}
