import winston from 'winston';
import { env } from '../config/env.js';

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${String(timestamp)} ${level}: ${String(message)}${metaStr}`;
        })
      ),
    }),
  ],
});
