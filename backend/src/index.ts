import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { getRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';

async function bootstrap() {
  await connectDatabase();
  getRedis(); // initialize connection
  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(`Backend listening on port ${env.PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { err });
  process.exit(1);
});
