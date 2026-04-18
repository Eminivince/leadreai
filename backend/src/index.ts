import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { getRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';

async function bootstrap() {
  await connectDatabase();
  getRedis(); // initialize connection
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`Backend listening on port ${env.PORT}`);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, shutting down`);
    server.close(async () => {
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
