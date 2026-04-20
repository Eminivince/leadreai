import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Unified LLM client. Reads env to decide between:
 *   - OpenRouter (default, remote API)
 *   - Local LiteLLM proxy (OpenAI-compatible, user's localhost)
 *
 * Both speak the same OpenAI chat-completions schema, so callers don't care which
 * provider is active. Toggle via USE_LOCAL_LLM=true in .env.
 *
 * All existing call sites pass a ready-to-go `body` (messages, max_tokens, etc.).
 * This client injects the correct URL + auth + model override, then returns the
 * parsed response content string.
 */

export interface LlmRequest {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: Array<{ role: string; content: string } | Record<string, any>>;
  max_tokens?: number;
  temperature?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response_format?: any;
  // If caller wants a specific remote model, override here. When USE_LOCAL_LLM
  // is on, this is IGNORED and LOCAL_LLM_MODEL is used.
  model?: string;
  timeoutMs?: number;
}

export interface LlmResponse {
  ok: boolean;
  status: number;
  content: string;
}

const DEFAULT_TIMEOUT_MS = 25_000;
// Local models on consumer hardware are slow (first-token latency can exceed 30s,
// generation at ~15-30 tok/s). Enforce a floor so per-caller short timeouts don't
// kill the request before the model can respond. Only applies when USE_LOCAL_LLM is on.
const LOCAL_TIMEOUT_FLOOR_MS = 180_000;

function resolveEndpoint(): { url: string; apiKey: string; model: string; provider: 'local' | 'openrouter' } {
  if (env.USE_LOCAL_LLM) {
    return {
      url: `${env.LOCAL_LLM_BASE_URL.replace(/\/$/, '')}/v1/chat/completions`,
      apiKey: env.LOCAL_LLM_API_KEY ?? '',
      model: env.LOCAL_LLM_MODEL,
      provider: 'local',
    };
  }
  return {
    url: `${env.OPENROUTER_BASE_URL.replace(/\/$/, '')}/chat/completions`,
    apiKey: env.OPENROUTER_API_KEY ?? '',
    model: env.OPENROUTER_MODEL,
    provider: 'openrouter',
  };
}

export function isLlmConfigured(): boolean {
  const ep = resolveEndpoint();
  // Local LiteLLM may be run without an API key; allow empty when provider=local.
  return ep.provider === 'local' ? true : Boolean(ep.apiKey);
}

export async function callLlmOnce(req: LlmRequest): Promise<LlmResponse> {
  const ep = resolveEndpoint();
  const requested = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutMs = ep.provider === 'local' ? Math.max(requested, LOCAL_TIMEOUT_FLOOR_MS) : requested;

  // Local LiteLLM uses whatever model the proxy advertises; remote honors the caller's
  // requested model (falling back to env default).
  const model = ep.provider === 'local' ? ep.model : (req.model ?? ep.model);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ep.apiKey) headers['Authorization'] = `Bearer ${ep.apiKey}`;
    if (ep.provider === 'openrouter') headers['HTTP-Referer'] = 'https://leadreai.app';

    const body: Record<string, unknown> = {
      model,
      messages: req.messages,
    };
    if (req.max_tokens !== undefined) body['max_tokens'] = req.max_tokens;
    if (req.temperature !== undefined) body['temperature'] = req.temperature;
    // response_format: OpenRouter supports it. Local LiteLLM backends (llama.cpp, vLLM,
    // Ollama) often reject unknown fields with 400. Skip it when USE_LOCAL_LLM is on —
    // the model instruction in the prompt still asks for JSON-only output.
    if (req.response_format !== undefined && ep.provider === 'openrouter') {
      body['response_format'] = req.response_format;
    }

    const res = await fetch(ep.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      logger.warn('[llmClient] non-200', {
        provider: ep.provider, status: res.status, model,
        errBody: errBody.slice(0, 500),
      });
      return { ok: false, status: res.status, content: '' };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    return { ok: true, status: res.status, content: json?.choices?.[0]?.message?.content ?? '' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * callLlm with 429 / network-error exponential backoff.
 * Used by anything that runs inside the agent loop or in tight repeated cycles.
 */
export async function callLlm(req: LlmRequest): Promise<string> {
  // Longer backoff chain for strict free-tier rate limits (e.g. Nemotron).
  // Total wait if all trip: ~2.5 min. Lets a rate-limited agent ride out the
  // window rather than abandoning the job with leads in flight.
  const backoffs = [5_000, 15_000, 30_000, 60_000];
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    const result = await callLlmOnce(req).catch((err) => {
      logger.warn('[llmClient] fetch threw', {
        attempt, err: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, status: 0, content: '' } as LlmResponse;
    });
    if (result.ok) return result.content;
    if (result.status === 429 && attempt < backoffs.length) {
      const waitMs = backoffs[attempt]!;
      logger.info('[llmClient] 429 rate-limited — backing off', { attempt: attempt + 1, waitMs });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    throw new Error(`LLM status ${result.status}`);
  }
  throw new Error('LLM retry budget exhausted');
}
