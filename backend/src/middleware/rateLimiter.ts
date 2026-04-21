import { rateLimit } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { getRedis } from '../config/redis.js';
import { env } from '../config/env.js';

const createRedisStore = (prefix: string) => new RedisStore({
  sendCommand: async (...args: string[]) => {
    const result = await getRedis().call(args[0]!, ...args.slice(1));
    return result as unknown as RedisReply;
  },
  prefix,
});

/**
 * Auth rate limiter — counts FAILED attempts only. A successful login or
 * registration (2xx response) doesn't consume the budget. This protects
 * against brute-force password guessing without punishing legitimate users
 * who log in multiple times across devices, get their password right on
 * the second try, or re-register after realizing they already have an
 * account.
 *
 * Limit raised from 10 to 20 now that only the misses count — 20 failed
 * auth attempts in 15 minutes against a single IP is still clearly
 * adversarial.
 */
export const authRateLimiter = rateLimit({
  store: createRedisStore('rl:auth:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  skipSuccessfulRequests: true,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many failed auth attempts. Try again in 15 minutes.' } },
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
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
});
