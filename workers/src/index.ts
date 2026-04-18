import { Redis } from 'ioredis';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
import { createProspectingWorker } from './prospecting.worker.js';

async function bootstrap() {
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('connect', () => logger.info('Workers Redis connected'));
  connection.on('error', (err) => logger.error('Workers Redis error', { err }));

  const publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  publisher.on('error', (err) => logger.error('Publisher Redis error', { err }));

  const worker = await createProspectingWorker(connection, publisher);
  logger.info('Prospecting worker ready', { concurrency: env.WORKER_CONCURRENCY });

  let isShuttingDown = false;
  async function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}, shutting down workers`);
    await worker.close();
    await publisher.quit();
    await connection.quit();
    logger.info('Worker shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT',  () => { void shutdown('SIGINT'); });
}

bootstrap().catch((err) => {
  logger.error('Failed to start workers', { err });
  process.exit(1);
});
