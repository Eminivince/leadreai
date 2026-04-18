import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';
import { JOB_STATUSES } from '@leadreai/shared';

// Minimal ProspectingJob schema for worker use
const prospectingJobSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId },
    status: { type: String, enum: JOB_STATUSES },
    progress: {
      percentage: { type: Number, default: 0 },
      currentStage: { type: String, default: '' },
      stagesComplete: [String],
      leadsFoundSoFar: { type: Number, default: 0 },
    },
    error: {
      message: String,
      stack: String,
      stage: String,
    },
    startedAt: Date,
  },
  { timestamps: true, strict: false }
);

// Use existing model if already registered (handles hot reload)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ProspectingJob: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['ProspectingJob'] as mongoose.Model<any> | undefined) ??
  mongoose.model('ProspectingJob', prospectingJobSchema);

export async function runIntentParser(
  jobId: string,
  workspaceId: string,
  publisher: Redis
): Promise<void> {
  const channel = `job:progress:${jobId}`;

  // Update status to 'parsing'
  await ProspectingJob.findByIdAndUpdate(jobId, {
    status: 'parsing',
    startedAt: new Date(),
    'progress.percentage': 5,
    'progress.currentStage': 'parsing',
  });

  await publisher.publish(
    channel,
    JSON.stringify({ type: 'status', status: 'parsing', percentage: 5 })
  );

  logger.info('Intent parser: parsing', { jobId, workspaceId });

  // Simulate work (Phase 2 stub — real parsing in Phase 3)
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Update status to 'collecting'
  await ProspectingJob.findByIdAndUpdate(jobId, {
    status: 'collecting',
    'progress.percentage': 10,
    'progress.currentStage': 'collecting',
  });

  await publisher.publish(
    channel,
    JSON.stringify({ type: 'status', status: 'collecting', percentage: 10 })
  );

  logger.info('Intent parser: collecting stage reached', { jobId, workspaceId });
}
