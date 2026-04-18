import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';

export function createProspectingWorker(connection: Redis): Worker {
  const worker = new Worker(
    'prospecting',
    async (job: Job) => {
      logger.info('Prospecting job received', { jobId: job.id, data: job.data });
      // Phase 1: no-op processor — pipeline implemented in Phase 3
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
