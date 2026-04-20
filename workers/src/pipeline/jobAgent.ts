import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';
import type { ParsedIntent } from '@leadreai/shared';
import type { LeadRecord } from './deduplicator.js';
import {
  TOOL_REGISTRY, executeTool, renderToolMenu,
  type ToolContext,
} from './tools/index.js';
import { callLlm, isLlmConfigured } from '../utils/llmClient.js';
import { estimateWallClockMs } from './wallClockBudget.js';

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

// Step budget scales linearly with target count (min 30, max 200) — large demographic
// jobs need many more tool calls than a single contact_lookup.
const BASE_MAX_STEPS = 30;
const STEPS_PER_LEAD = 4;
const ABSOLUTE_MAX_STEPS = 200;
const LLM_TIMEOUT_MS = 25_000;
const CRITIC_INTERVAL = 5;

type HistoryMsg = { role: 'system' | 'user' | 'assistant'; content: string };

function buildSystemPrompt(maxSteps: number, budgetMs: number): string {
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

1. PLAN briefly before your first action. What does the user want? How many? **What PERSONAS does the query specify** (founder, CEO, managing partner, head of X, CTO, procurement, etc.)? Persona match is as important as company match.

2. Cheap first: lookup_registry, search_web, fetch_url, extract_names_from_urls, verify_email — these are fast & low-cost. Exhaust these before scrape_page (heavy, uses full browser).

3. **TWO-PASS STRATEGY — write baseline first, upgrade later.** Per company:

   PASS 1 (baseline — always do this first):
   a. Identify the company's real domain (via search_web snippets; don't guess).
   b. The initial search usually surfaces a generic email (info@, contact@, enquiries@) + phone in the snippets or homepage. If you have { domain + any email } already from a search, **call write_lead IMMEDIATELY with that baseline data**. Do NOT do further work before writing. This locks in progress even if you get rate-limited later.
   c. If the initial search didn't surface an email, do ONE fetch_url on the homepage to get one — then write_lead.

   PASS 2 (upgrade — only after baseline is written, and only if budget allows):
   d. For queries asking for named decision-makers, search for the company's leadership/team page ("<domain> partners" / "<company> managing partner" / "<domain> team").
   e. fetch_url the leadership page. Extract named contacts matching the target persona.
   f. Generate + verify a permuted email for that person.
   g. Call write_lead AGAIN with the same companyDomain and the named person's data. The tool upserts on domain and keeps the strictly-better record (named > generic).
   h. If no named person surfaces after ONE team-page attempt, move on — the baseline is already written.

4. For demographic queries ("find 50 <role> at <industry> in <geo>"): search_web for candidate companies; apply steps 3a-c for each (write baseline), then 3d-g if budget allows.

5. **NEVER end a turn without writing gathered data.** If you've identified a company and any contact path, write_lead before your next tool call. Unwritten intermediate state is lost on errors.

6. Never fabricate data. Only write_lead records you can justify from tool output you've seen. **Never invent a person's name from thin air** — if a team page gives you "John Smith, Managing Partner", use that exactly; don't pattern-match "John Smith" onto a different firm.

7. Reject UI/navigation text as contact names. If the only candidate name on a page is something like "Related Pages", "Our Team", "About Us", "Home", "Contact" — that's page chrome, not a person. Do NOT write it as topContact.

8. Watch your budget (${maxSteps} tool calls, ${Math.round(budgetMs / 1000)}s wall-clock). Prefer cheap tools. Don't scrape aggregator domains (zoominfo.com, rocketreach.co, contactout.com, signalhire.com, datanyze.com, apollo.io, hunter.io, lusha.com) — they're paywalled junk; use extract_names_from_urls on their SERP URLs instead.

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

  const transcript: string[] = [];
  const startedAt = Date.now();
  const targetCount = parsedIntent.targetCount ?? 10;

  // Compute per-job wall-clock budget and step cap from parsed intent.
  const { budgetMs, explanation } = estimateWallClockMs(parsedIntent);
  const maxSteps = Math.min(
    ABSOLUTE_MAX_STEPS,
    Math.max(BASE_MAX_STEPS, BASE_MAX_STEPS + targetCount * STEPS_PER_LEAD),
  );
  logger.info('[jobAgent] budget', { jobId, budgetMs, maxSteps, explanation });

  const history: HistoryMsg[] = [
    { role: 'system', content: buildSystemPrompt(maxSteps, budgetMs) },
    { role: 'user', content: buildInitialUserPrompt(parsedIntent) },
  ];

  for (let step = 0; step < maxSteps; step++) {
    if (ctx.leadsSoFar.length >= targetCount) {
      logger.info('[jobAgent] target reached', { step, leads: ctx.leadsSoFar.length });
      return { leads: ctx.leadsSoFar, stepsUsed: step, stopReason: 'target_reached', transcript };
    }
    if (Date.now() - startedAt > budgetMs) {
      logger.info('[jobAgent] wall-clock budget exhausted', { step, budgetMs, leads: ctx.leadsSoFar.length });
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

  logger.info('[jobAgent] max steps reached', { leads: ctx.leadsSoFar.length, maxSteps });
  return { leads: ctx.leadsSoFar, stepsUsed: maxSteps, stopReason: 'max_steps', transcript };
}
