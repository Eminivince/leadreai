import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';
import { JOB_STATUSES } from '@leadreai/shared';
import type { ParsedIntent } from '@leadreai/shared';
import { deduplicateLeads } from './deduplicator.js';
import { rankLeads } from './ranker.js';
import { writeLeads } from './leadWriter.js';
import { runJobAgent } from './jobAgent.js';

const prospectingJobSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId },
    status: { type: String, enum: JOB_STATUSES },
    parsedIntent: { type: mongoose.Schema.Types.Mixed },
    progress: {
      percentage: { type: Number, default: 0 },
      currentStage: { type: String, default: '' },
      stagesComplete: [String],
      leadsFoundSoFar: { type: Number, default: 0 },
    },
    error: { message: String, stack: String, stage: String },
    startedAt: Date,
    activityLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true, strict: false },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ProspectingJob: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['ProspectingJob'] as mongoose.Model<any> | undefined) ??
  mongoose.model('ProspectingJob', prospectingJobSchema);

async function pushProgress(
  jobId: string,
  publisher: Redis,
  status: string,
  percentage: number,
  stage: string,
): Promise<void> {
  await ProspectingJob.findByIdAndUpdate(jobId, {
    status,
    'progress.percentage': percentage,
    'progress.currentStage': stage,
    $push: { 'progress.stagesComplete': stage },
  });
  await publisher.publish(
    `job:progress:${jobId}`,
    JSON.stringify({ type: 'status', status, percentage, stage }),
  );
}

// Preserved for prospecting.worker.ts error-path activity logging.
// Individual pipeline stages no longer emit via this helper — the JobAgent owns per-step activity events.
export async function jobActivity(
  jobId: string,
  publisher: Redis,
  step: string,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const at = new Date().toISOString();
  const doc: { at: string; step: string; message: string; meta?: Record<string, unknown> } = {
    at,
    step,
    message,
  };
  if (meta && Object.keys(meta).length > 0) doc.meta = meta;
  try {
    await ProspectingJob.findByIdAndUpdate(jobId, {
      $push: {
        activityLog: {
          $each: [doc],
          $slice: -200,
        },
      },
    });
    await publisher.publish(
      `job:progress:${jobId}`,
      JSON.stringify({ type: 'activity', ...doc }),
    );
  } catch (err) {
    logger.warn('[Pipeline] jobActivity failed', {
      jobId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function runIntentParser(
  jobId: string,
  workspaceId: string,
  publisher: Redis,
): Promise<void> {
  logger.info('[Pipeline] Starting job (agent-orchestrated)', { jobId, workspaceId });

  await ProspectingJob.findByIdAndUpdate(jobId, {
    status: 'parsing',
    startedAt: new Date(),
    'progress.percentage': 3,
    'progress.currentStage': 'parsing',
  });
  await publisher.publish(
    `job:progress:${jobId}`,
    JSON.stringify({ type: 'status', status: 'parsing', percentage: 3, stage: 'parsing' }),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobDoc = await ProspectingJob.findById(jobId).lean() as any;
  if (!jobDoc) throw new Error(`Job ${jobId} not found`);
  const parsedIntent = jobDoc.parsedIntent as ParsedIntent;
  if (!parsedIntent) throw new Error(`Job ${jobId} has no parsedIntent`);

  logger.info('[Pipeline] parsedIntent loaded', {
    jobId, queryType: parsedIntent.queryType,
    industry: parsedIntent.industry, targetCount: parsedIntent.targetCount,
  });

  await pushProgress(jobId, publisher, 'collecting', 10, 'jobAgentStart');

  // ── AGENT OWNS THE PIPELINE ───────────────────────────────────────────
  const agentResult = await runJobAgent({
    jobId, workspaceId, parsedIntent, publisher,
  });

  logger.info('[Pipeline] JobAgent finished', {
    jobId,
    leadsEmitted: agentResult.leads.length,
    stepsUsed: agentResult.stepsUsed,
    stopReason: agentResult.stopReason,
  });

  // ── Dedup + Rank + Persist ───────────────────────────────────────────
  await pushProgress(jobId, publisher, 'deduplicating', 85, 'deduplication');
  const deduped = deduplicateLeads(agentResult.leads);

  await pushProgress(jobId, publisher, 'deduplicating', 92, 'ranking');
  const ranked = rankLeads(deduped, parsedIntent.desiredFields);

  await pushProgress(jobId, publisher, 'deduplicating', 97, 'leadWrite');
  await writeLeads(ranked, jobId, workspaceId, publisher);

  await pushProgress(jobId, publisher, 'complete', 100, 'done');

  // Persist a compact agent transcript for post-hoc debugging
  await ProspectingJob.findByIdAndUpdate(jobId, {
    'progress.leadsFoundSoFar': ranked.length,
    agentTranscript: agentResult.transcript.slice(-40),
    agentStopReason: agentResult.stopReason,
    agentStepsUsed: agentResult.stepsUsed,
  });

  logger.info('[Pipeline] Job complete', { jobId, totalLeads: ranked.length });
}
