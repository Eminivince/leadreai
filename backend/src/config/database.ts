import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export async function connectDatabase(): Promise<void> {
  const MAX_RETRIES = 5;
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME });
      logger.info('MongoDB connected');
      return;
    } catch (err) {
      attempt++;
      logger.error(`MongoDB connection attempt ${attempt} failed`, { err });
      if (attempt === MAX_RETRIES) throw err;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}
