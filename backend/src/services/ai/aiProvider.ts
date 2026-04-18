import { env } from '../../config/env.js';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiResponse {
  text: string;
  provider: 'anthropic' | 'google' | 'openrouter';
  inputTokens?: number;
  outputTokens?: number;
}

export interface GenerateOptions {
  systemPrompt?: string;
  maxTokens?: number;
  /** Pass true to enable prompt caching on the system prompt (Anthropic only). */
  cacheSystem?: boolean;
}

async function generateWithAnthropic(
  messages: AiMessage[],
  options: GenerateOptions,
): Promise<AiResponse> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  type SystemBlock =
    | string
    | Array<{
        type: 'text';
        text: string;
        cache_control?: { type: 'ephemeral' };
      }>;

  let system: SystemBlock | undefined;
  if (options.systemPrompt) {
    system = options.cacheSystem
      ? [{ type: 'text', text: options.systemPrompt, cache_control: { type: 'ephemeral' } }]
      : options.systemPrompt;
  }

  const response = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: options.maxTokens ?? env.ANTHROPIC_MAX_TOKENS,
    ...(system !== undefined && { system }),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  return {
    text,
    provider: 'anthropic',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function generateWithGoogle(
  messages: AiMessage[],
  options: GenerateOptions,
): Promise<AiResponse> {
  if (!env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set');
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({
    model: env.GOOGLE_MODEL,
    ...(options.systemPrompt && { systemInstruction: options.systemPrompt }),
  });

  // Convert to Gemini history + last user message
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) throw new Error('messages array must not be empty');

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(lastMessage.content);
  const text = result.response.text();

  const usage = result.response.usageMetadata;
  return {
    text,
    provider: 'google',
    inputTokens: usage?.promptTokenCount,
    outputTokens: usage?.candidatesTokenCount,
  };
}

async function generateWithOpenRouter(
  messages: AiMessage[],
  options: GenerateOptions,
): Promise<AiResponse> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const body = {
    model: env.OPENROUTER_MODEL,
    max_tokens: options.maxTokens ?? env.ANTHROPIC_MAX_TOKENS,
    messages: [
      ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };

  const res = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://leadreai.app',
      'X-Title': 'LeadreAI',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${detail}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = data.choices[0]?.message.content ?? '';
  return {
    text,
    provider: 'openrouter',
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
  };
}

/**
 * Unified AI text generation.
 * Priority: USE_OPENROUTER → USE_GOOGLE → Anthropic (default)
 */
export async function generateText(
  messages: AiMessage[],
  options: GenerateOptions = {},
): Promise<AiResponse> {
  if (env.USE_OPENROUTER) {
    return generateWithOpenRouter(messages, options);
  }
  if (env.USE_GOOGLE) {
    return generateWithGoogle(messages, options);
  }
  return generateWithAnthropic(messages, options);
}
