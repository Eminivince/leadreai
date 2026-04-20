import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';
import type { ParsedIntent } from '@leadreai/shared';
import type { LeadRecord } from './deduplicator.js';
import {
  TOOL_REGISTRY, executeTool, renderToolMenu,
  type ToolContext,
} from './tools/index.js';
import { callLlm, isLlmConfigured } from '../utils/llmClient.js';

export interface JobAgentInput {
  jobId: string;
  workspaceId: string;
  parsedIntent: ParsedIntent;
  publisher: Redis;
}

export interface JobAgentResult {
  leads: LeadRecord[];
  stepsUsed: number;
  stopReason: 'target_reached' | 'max_steps' | 'wall_clock' | 'agent_done' | 'error';
  transcript: string[];
}

const MAX_STEPS = 30;
const MAX_WALL_MS = 5 * 60 * 1000;
const LLM_TIMEOUT_MS = 25_000;
const CRITIC_INTERVAL = 5;

type HistoryMsg = { role: 'system' | 'user' | 'assistant'; content: string };

function buildSystemPrompt(): string {
  return `You are an autonomous lead-research agent. Given a user query, you drive a tool-using research process that ends with one or more qualified leads written via the write_lead tool.

## Available tools

${renderToolMenu()}

## Response format

On every turn, respond with EXACTLY ONE JSON object matching one of these shapes (no markdown, no prose, no code fences):

  { "thought": "…", "tool": "<tool_name>", "args": {…} }
    → Call one tool. Thought is private (for your own reasoning).

  { "thought": "…", "done": true, "summary": "…" }
    → Stop. Use when you have already written enough leads via write_lead, or when further work is futile.

## Core strategy

1. PLAN briefly before your first action. What does the user want? How many? What fields?
2. Cheap first: lookup_registry, search_web, fetch_url, extract_names_from_urls, verify_email — these are fast & low-cost. Exhaust these before scrape_page (heavy, uses full browser).
3. For a named-entity query ("find contacts at <company>"): start with lookup_registry. Then search_web — the real website domain usually appears in the top 3 result URLs or snippets; EXTRACT IT by reading the snippets, don't guess. Once you have the domain, fetch_url the /contact, /about, /team pages directly. Use search_web with aggregator-restricted queries (site:linkedin.com OR site:zoominfo.com) + extract_names_from_urls to harvest employee names, then permute_email + verify_email per name on the real domain. write_lead per verified contact.
4. For a demographic query ("find 50 <role> at <industry> in <geo>"): use search_web to find candidate companies, inspect snippets before committing to scrape_page. Loop.
5. Never fabricate data. Only write_lead records you can justify from tool output you've seen.
6. Watch your budget (${MAX_STEPS} tool calls, ${MAX_WALL_MS / 1000}s wall-clock). Prefer cheap tools. Don't scrape aggregator domains (zoominfo.com, rocketreach.co, contactout.com, signalhire.com, datanyze.com, apollo.io, hunter.io, lusha.com) — they're paywalled junk; use extract_names_from_urls on their SERP URLs instead.

## Completion criteria

You must stop when either:
- You have written \`targetCount\` leads via write_lead, OR
- No further productive action remains (emit done:true)

Return ONLY JSON. No markdown fences.`;
}

function buildInitialUserPrompt(intent: ParsedIntent): string {
  const parts = [
    `Query type: ${intent.queryType}`,
    `Target count: ${intent.targetCount}`,
    `Industry: ${intent.industry}`,
    `Geography: ${JSON.stringify(intent.geography)}`,
    `Desired fields: ${intent.desiredFields.join(', ') || '(none specified → any business contact data)'}`,
    `Keywords: ${intent.keywords?.join(', ') || '(none)'}`,
  ];
  if (intent.namedEntities?.length) {
    parts.push(`Named entities: ${intent.namedEntities.join(', ')}`);
  }
  parts.push(`\nWhat is your first action? Plan briefly in the "thought" field, then call one tool.`);
  return parts.join('\n');
}

async function callLLM(history: HistoryMsg[]): Promise<string> {
  return callLlm({
    messages: history,
    max_tokens: 1200,
    temperature: 0,
    response_format: { type: 'json_object' },
    timeoutMs: LLM_TIMEOUT_MS,
  });
}

async function runCritic(history: HistoryMsg[], ctx: ToolContext): Promise<string | null> {
  const criticHistory: HistoryMsg[] = [
    {
      role: 'system',
      content: `You are a research-quality critic. Review the agent's progress so far and decide whether to continue, replan, or stop.

Respond with exactly one JSON object:
  { "decision": "continue" | "replan" | "stop", "reasoning": "…", "suggestion"?: "…" }

Decide:
- continue: agent is making progress, no intervention needed
- replan: agent is stuck or wasting budget — include "suggestion" pointing to a better strategy
- stop: agent has enough data OR further work is futile`,
    },
    {
      role: 'user',
      content: `Target: ${ctx.parsedIntent.targetCount} leads. Written so far: ${ctx.leadsSoFar.length}. Recent agent activity:\n${history.slice(-10).map(m => `[${m.role}] ${m.content.slice(0, 400)}`).join('\n\n')}`,
    },
  ];
  try {
    const raw = await callLLM(criticHistory);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse(raw) as any;
    logger.info('[jobAgent][critic]', { decision: parsed?.decision, reasoning: parsed?.reasoning });
    if (parsed?.decision === 'stop') return 'STOP';
    if (parsed?.decision === 'replan' && parsed?.suggestion) {
      return `REPLAN: ${parsed.suggestion}`;
    }
  } catch (err) {
    logger.warn('[jobAgent][critic] failed', { err: err instanceof Error ? err.message : String(err) });
  }
  return null;
}

export async function runJobAgent(input: JobAgentInput): Promise<JobAgentResult> {
  const { jobId, workspaceId, parsedIntent, publisher } = input;

  if (!isLlmConfigured()) {
    logger.error('[jobAgent] LLM not configured — set USE_LOCAL_LLM or OPENROUTER_API_KEY');
    return { leads: [], stepsUsed: 0, stopReason: 'error', transcript: ['LLM not configured'] };
  }

  const ctx: ToolContext = {
    jobId, workspaceId, publisher, parsedIntent,
    leadsSoFar: [],
    pagesScrapedThisJob: new Set<string>(),
  };

  const history: HistoryMsg[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildInitialUserPrompt(parsedIntent) },
  ];
  const transcript: string[] = [];
  const startedAt = Date.now();
  const targetCount = parsedIntent.targetCount;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (ctx.leadsSoFar.length >= targetCount) {
      logger.info('[jobAgent] target reached', { step, leads: ctx.leadsSoFar.length });
      return { leads: ctx.leadsSoFar, stepsUsed: step, stopReason: 'target_reached', transcript };
    }
    if (Date.now() - startedAt > MAX_WALL_MS) {
      logger.info('[jobAgent] wall-clock budget exhausted', { step });
      return { leads: ctx.leadsSoFar, stepsUsed: step, stopReason: 'wall_clock', transcript };
    }

    let raw: string;
    try {
      raw = await callLLM(history);
    } catch (err) {
      logger.warn('[jobAgent] LLM call failed', { step, err: err instanceof Error ? err.message : String(err) });
      return { leads: ctx.leadsSoFar, stepsUsed: step, stopReason: 'error', transcript };
    }
    transcript.push(`[${step}] ← ${raw.slice(0, 400)}`);
    history.push({ role: 'assistant', content: raw });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      history.push({ role: 'user', content: 'Your previous response was not valid JSON. Return exactly one JSON object per the system prompt.' });
      continue;
    }

    if (parsed?.done === true) {
      logger.info('[jobAgent] agent signaled done', { step, leads: ctx.leadsSoFar.length, summary: parsed.summary });
      return { leads: ctx.leadsSoFar, stepsUsed: step, stopReason: 'agent_done', transcript };
    }

    const toolName = parsed?.tool;
    if (!toolName || !TOOL_REGISTRY.find(t => t.name === toolName)) {
      history.push({
        role: 'user',
        content: `Your response must include "tool": "<one of ${TOOL_REGISTRY.map(t => t.name).join(', ')}>" or "done": true. Try again.`,
      });
      continue;
    }

    logger.info('[jobAgent] tool call', { step, tool: toolName, thought: parsed.thought?.slice(0, 200) });
    await publisher.publish(
      `job:progress:${jobId}`,
      JSON.stringify({
        type: 'activity', stage: 'agent', ts: Date.now(),
        title: `Agent step ${step + 1}: ${toolName}`,
        meta: { thought: parsed.thought?.slice(0, 200) },
      }),
    );

    const toolResult = await executeTool(toolName, parsed.args ?? {}, ctx);
    transcript.push(`[${step}] → ${toolName} → ${toolResult.output.slice(0, 300)}`);
    history.push({ role: 'user', content: `Tool ${toolName} result (ok=${toolResult.ok}):\n${toolResult.output}` });

    // Critic checkpoint
    if ((step + 1) % CRITIC_INTERVAL === 0 && ctx.leadsSoFar.length < targetCount) {
      const criticVerdict = await runCritic(history, ctx);
      if (criticVerdict === 'STOP') {
        logger.info('[jobAgent] critic stopped run', { step, leads: ctx.leadsSoFar.length });
        return { leads: ctx.leadsSoFar, stepsUsed: step, stopReason: 'agent_done', transcript };
      }
      if (criticVerdict?.startsWith('REPLAN:')) {
        history.push({ role: 'user', content: `CRITIC FEEDBACK: ${criticVerdict.slice(7).trim()}` });
      }
    }
  }

  logger.info('[jobAgent] max steps reached', { leads: ctx.leadsSoFar.length });
  return { leads: ctx.leadsSoFar, stepsUsed: MAX_STEPS, stopReason: 'max_steps', transcript };
}
