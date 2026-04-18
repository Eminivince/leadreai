import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z.string().default('leadreai'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  USE_GOOGLE: z.coerce.boolean().default(false),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().default(2048),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_MODEL: z.string().default('gemini-1.5-flash'),
  SERPAPI_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_TO_MONGODB: z.coerce.boolean().default(false),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  JOB_RATE_LIMIT_PER_HOUR: z.coerce.number().default(10),
  WORKER_CONCURRENCY: z.coerce.number().default(3),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
