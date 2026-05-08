import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { getRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
// Data source registry bootstrap — side-effect import. Each per-source
// module calls registerDataSource() at top level, so importing the barrel
// once at server start populates the registry before any request handler
// queries it.
import './services/data-sources/sources/index.js';
import { startTableEnrichmentWorker, stopTableEnrichmentWorker } from './services/data-tables/worker.js';
import { startSequenceWorker, stopSequenceWorker } from './services/sequenceWorker.js';

async function bootstrap() {
  await connectDatabase();
  getRedis(); // initialize connection
  const app = createApp();

  // Phase 15D — column-referenced enrichment worker. Runs inside the
  // Express process because handlers reach the backend data-source
  // executor + credential decryption path.
  startTableEnrichmentWorker();
  logger.info('Table enrichment worker started');

  startSequenceWorker();
  logger.info('Sequence worker started');

  const server = app.listen(env.PORT, () => {
    logger.info(`Backend listening on port ${env.PORT}`);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, shutting down`);
    server.close(async () => {
      stopSequenceWorker();
      await stopTableEnrichmentWorker();
      await mongoose.connection.close();
      await getRedis().quit();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT',  () => { void shutdown('SIGINT'); });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { err });
  process.exit(1);
});
