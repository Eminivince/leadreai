import { Redis } from 'ioredis';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
import { createProspectingWorker } from './prospecting.worker.js';
import { createOutreachWorker } from './outreach.worker.js';
import { createContactWorker } from './contact.worker.js';

async function bootstrap() {
  // Each BullMQ Worker needs its own Redis connection — sharing one instance causes
  // shutdown ordering issues and violates BullMQ's ownership model.
  const prospectingConn = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  prospectingConn.on('error', (err) => logger.error('Prospecting Redis error', { err }));

  const outreachConn = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  outreachConn.on('error', (err) => logger.error('Outreach Redis error', { err }));

  const contactConn = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  contactConn.on('error', (err) => logger.error('Contact Redis error', { err }));

  const publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  publisher.on('connect', () => logger.info('Workers Redis connected'));
  publisher.on('error', (err) => logger.error('Publisher Redis error', { err }));

  const prospectingWorker = await createProspectingWorker(prospectingConn, publisher);
  logger.info('Prospecting worker ready', { concurrency: env.WORKER_CONCURRENCY });

  const outreachWorker = await createOutreachWorker(outreachConn, publisher);
  logger.info('Outreach worker ready', { concurrency: env.WORKER_CONCURRENCY });

  const contactWorker = createContactWorker(contactConn);
  logger.info('Contact worker ready', { concurrency: env.CONTACT_ENRICHMENT_CONCURRENCY });

  let isShuttingDown = false;
  async function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}, shutting down workers`);
    await Promise.all([prospectingWorker.close(), outreachWorker.close(), contactWorker.close()]);
    await publisher.quit();
    await Promise.all([prospectingConn.quit(), outreachConn.quit(), contactConn.quit()]);
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
