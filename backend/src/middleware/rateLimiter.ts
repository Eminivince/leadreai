import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

export const jobRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: env.JOB_RATE_LIMIT_PER_HOUR,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Job submission rate limit exceeded' } },
  standardHeaders: true,
  legacyHeaders: false,
});
