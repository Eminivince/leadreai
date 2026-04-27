import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

// See backend env for rationale — anchor storage path to the monorepo
// root so backend (writer) and worker (reader) see the same directory
// regardless of which cwd launched them.
const _moduleDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DOCUMENTS_STORAGE_PATH = resolve(_moduleDir, '../../..', 'storage/documents');

// `z.coerce.boolean()` treats any non-empty string as true — including "false"
// and "0". This helper parses common boolean strings ("true"/"1"/"yes") properly.
const booleanFlag = z
  .union([z.boolean(), z.string()])
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'on';
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  CONTACT_ENRICHMENT_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017'),
  MONGODB_DB_NAME: z.string().default('leadreai'),
  SERPAPI_KEY: z.string().optional(),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  SERPER_API_KEY: z.string().optional(),
  // Comma-separated provider priority list. First configured + non-exhausted wins.
  SEARCH_PROVIDER_ORDER: z.string().default('brave,serper,serpapi'),
  SEARCH_CACHE_ENABLED: booleanFlag.default(true),
  SEARCH_CACHE_TTL_SECONDS: z.coerce.number().int().min(60).default(86400), // 24h
  PLAYWRIGHT_HEADLESS: booleanFlag.default(true),
  PLAYWRIGHT_TIMEOUT_MS: z.coerce.number().default(30000),
  PLAYWRIGHT_CONCURRENCY: z.coerce.number().default(3),
  MAX_FILE_DOWNLOAD_SIZE_MB: z.coerce.number().default(25),
  DEDUP_SIMILARITY_THRESHOLD: z.coerce.number().default(0.25),
  PROXY_LIST: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('nvidia/nemotron-3-super-120b-a12b:free'),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  // Local LiteLLM proxy — OpenAI-compatible endpoint on the user's machine.
  // When USE_LOCAL_LLM=true, all LLM calls route here instead of OpenRouter.
  USE_LOCAL_LLM: booleanFlag.default(false),
  LOCAL_LLM_BASE_URL: z.string().default('http://localhost:4400'),
  LOCAL_LLM_API_KEY: z.string().optional(),
  LOCAL_LLM_MODEL: z.string().default('qwen3.5'),
  OPENCORPORATES_API_KEY: z.string().optional(),
  REACHER_URL: z.string().url().optional(),
  EMAIL_VERIFIER_PROVIDER: z.enum(['mx_only', 'reacher']).default('mx_only'),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().default(5000),
  JWT_SECRET: z.string().min(32),
  UNSUBSCRIBE_BASE_URL: z.string().url().default('http://localhost:4000/unsubscribe'),
  UNSUBSCRIBE_TOKEN_SECRET: z.string().optional(),
  SEQUENCE_SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(10000).default(60000),
  // Document library
  DOCUMENTS_STORAGE_PATH: z.string().default(DEFAULT_DOCUMENTS_STORAGE_PATH),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z.string().default('https://api.openai.com/v1'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMS: z.coerce.number().default(1536),
  // Transcription (Whisper-style). Falls back to EMBEDDING_API_KEY /
  // EMBEDDING_BASE_URL when unset so one OpenAI key unlocks both.
  TRANSCRIPTION_API_KEY: z.string().optional(),
  TRANSCRIPTION_BASE_URL: z.string().optional(),
  TRANSCRIPTION_MODEL: z.string().default('whisper-1'),
  TRANSCRIPTION_MAX_MB: z.coerce.number().default(25),
  // Dev ergonomic — when true, drain every queue (active, waiting, delayed,
  // failed) at worker boot. BullMQ otherwise redelivers jobs that were
  // `active` when the previous process died (stalled-job recovery), which
  // is the right behavior in prod but means a fresh `pnpm dev` resurrects
  // the job you thought you killed. MUST stay false in prod — turning it
  // on there would wipe live jobs on every deploy.
  CLEAR_QUEUES_ON_BOOT: booleanFlag.default(false),
  AGENT_FAN_OUT_ENABLED: booleanFlag.default(true),
  SUBAGENT_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
  FAN_OUT_MIN_TARGET: z.coerce.number().int().min(1).max(50).default(5),
  // Code sandbox — Python executor for agent data-processing tasks.
  // Requires Docker installed and the sandbox image built:
  //   docker build -t leadreai-sandbox:latest workers/sandbox/
  SANDBOX_ENABLED: booleanFlag.default(false),
  SANDBOX_IMAGE: z.string().default('leadreai-sandbox:latest'),
  SANDBOX_TIMEOUT_MS: z.coerce.number().int().min(5000).default(30_000),
  SANDBOX_MEMORY_MB: z.coerce.number().int().min(64).default(256),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid worker env variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
