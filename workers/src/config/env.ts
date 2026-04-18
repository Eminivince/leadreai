import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  CONTACT_ENRICHMENT_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017'),
  MONGODB_DB_NAME: z.string().default('leadreai'),
  SERPAPI_KEY: z.string().optional(),
  PLAYWRIGHT_HEADLESS: z.coerce.boolean().default(true),
  PLAYWRIGHT_TIMEOUT_MS: z.coerce.number().default(30000),
  PLAYWRIGHT_CONCURRENCY: z.coerce.number().default(3),
  MAX_FILE_DOWNLOAD_SIZE_MB: z.coerce.number().default(25),
  DEDUP_SIMILARITY_THRESHOLD: z.coerce.number().default(0.25),
  PROXY_LIST: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('nvidia/nemotron-3-super-120b-a12b:free'),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().default(5000),
  JWT_SECRET: z.string().min(32).optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid worker env variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
