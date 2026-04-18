import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis } from '../config/redis.js';
import { env } from '../config/env.js';

const redis = getRedis();

const createRedisStore = (prefix: string) => new RedisStore({
  sendCommand: async (...args: string[]) => {
    const result = await redis.call(args[0]!, ...args.slice(1));
    return result as boolean | number | string | (boolean | number | string)[];
  },
  prefix,
});

export const authRateLimiter = rateLimit({
  store: createRedisStore('rl:auth:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many auth attempts. Try again in 15 minutes.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

export const jobRateLimiter = rateLimit({
  store: createRedisStore('rl:job:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: env.JOB_RATE_LIMIT_PER_HOUR,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Job submission rate limit exceeded' } },
  standardHeaders: true,
  legacyHeaders: false,
});

export const globalRateLimiter = rateLimit({
  store: createRedisStore('rl:global:'),
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
});
