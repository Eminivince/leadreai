import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose from 'mongoose';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
import { runIntentParser } from './pipeline/intentParser.js';

async function connectDB(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  logger.info('Worker MongoDB connected');
}

export async function createProspectingWorker(connection: Redis, publisher: Redis): Promise<Worker> {
  await connectDB();

  const worker = new Worker(
    'prospecting',
    async (job: Job) => {
      const { jobId, workspaceId } = job.data as { jobId: string; workspaceId: string };
      logger.info('Prospecting job received', { jobId, workspaceId });

      try {
        await runIntentParser(jobId, workspaceId, publisher);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('Intent parser failed', { jobId, err });

        // Mark job as failed in DB + publish error event
        const ProspectingJob = mongoose.models['ProspectingJob'] as
          | mongoose.Model<mongoose.Document>
          | undefined;

        if (ProspectingJob) {
          await ProspectingJob.findByIdAndUpdate(jobId, {
            status: 'failed',
            'error.message': message,
            'error.stage': 'parsing',
          });
        }

        await publisher.publish(
          `job:progress:${jobId}`,
          JSON.stringify({ type: 'error', message })
        );

        throw err; // re-throw so BullMQ marks job as failed and retries
      }
    },
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    }
  );

  worker.on('completed', (job) => {
    logger.info('Job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', { jobId: job?.id, err });
  });

  worker.on('error', (err) => {
    logger.error('Worker error', { err });
  });

  return worker;
}
