import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose, { Schema } from 'mongoose';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
import { runSubagent, type ProspectingSubagentJobData } from './pipeline/jobSubagent.js';
import { runWithCostContext } from './services/costTracker.js';
import { writeSubagentLeads } from './pipeline/leadWriter.js';

// Inline minimal ProspectingJob model to update subagentStats.
// Uses the mongoose.models cache to avoid re-registering if the model
// was already registered (e.g., by prospecting.worker.ts startup).
const prospectingJobSchema = new Schema({
  subagentStats: {
    dispatched: Number,
    completed: Number,
    failed: Number,
    timedOut: Number,
  },
}, { strict: false });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ProspectingJobModel: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['ProspectingJob'] as mongoose.Model<any> | undefined) ??
  mongoose.model('ProspectingJob', prospectingJobSchema, 'prospectingjobs');

export function createSubagentProspectingWorker(
  connection: Redis,
  publisher: Redis,
): Worker {
  const prefix = `{bull}:leadreai:${env.NODE_ENV}`;

  return new Worker(
    'prospecting-subagent',
    async (job: Job) => {
      const data = job.data as ProspectingSubagentJobData;
      const { parentJobId, workspaceId, candidate } = data;
      logger.info('[subagentWorker] received', { parentJobId, company: candidate.companyName });

      try {
        const result = await runWithCostContext({ workspaceId, jobId: parentJobId }, () =>
          runSubagent(data, publisher),
        );

        await writeSubagentLeads(result.leads, parentJobId, workspaceId);

        const incField = result.leads.length > 0 ? 'subagentStats.completed' : 'subagentStats.failed';
        await ProspectingJobModel.findByIdAndUpdate(parentJobId, {
          $inc: { [incField]: 1 },
        }).catch(() => {});

        logger.info('[subagentWorker] done', {
          parentJobId,
          company: candidate.companyName,
          leads: result.leads.length,
        });
      } catch (err) {
        logger.error('[subagentWorker] failed', {
          parentJobId,
          company: candidate.companyName,
          err: err instanceof Error ? err.message : String(err),
        });
        await ProspectingJobModel.findByIdAndUpdate(parentJobId, {
          $inc: { 'subagentStats.failed': 1 },
        }).catch(() => {});
        throw err; // re-throw so BullMQ marks the job as failed
      }
    },
    {
      connection,
      prefix,
      concurrency: env.SUBAGENT_CONCURRENCY,
    },
  );
}
