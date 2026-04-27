import { logger } from '../utils/logger.js';
import { SUBAGENT_TOOLS, executeTool, renderToolMenu, type ToolContext } from './tools/index.js';
import type { Candidate } from './tools/index.js';
import { callLlm, isLlmConfigured } from '../utils/llmClient.js';
import { jobActivity } from './intentParser.js';
import type { LeadRecord } from './deduplicator.js';
import type { ParsedIntent } from '@leadreai/shared';
import { Redis } from 'ioredis';

export interface ProspectingSubagentJobData {
  parentJobId: string;
  workspaceId: string;
  candidate: Candidate;
  parsedIntent: ParsedIntent;
  rawQuery?: string;
  clarifications?: Array<{ id: string; question: string; answer: unknown }>;
  budget: { maxSteps: number; wallClockMs: number };
}

export interface SubagentResult {
  leads: LeadRecord[];
  stepsUsed: number;
}

const LLM_TIMEOUT_MS = 45_000;
type HistoryMsg = { role: 'system' | 'user' | 'assistant'; content: string };

function buildSubagentSystemPrompt(maxSteps: number, wallClockMs: number): string {
  return `You are an ENRICHMENT SUBAGENT for a B2B prospecting system.

You have been assigned ONE company to research. Your job: find contact data and call write_lead.

## Available tools

${renderToolMenu(SUBAGENT_TOOLS)}

## Response format (strict JSON, no markdown)

  {"thought": "…", "tool": "<name>", "args": {…}}   — call a tool
  {"done": true, "summary": "…"}                      — when you have called write_lead OR can't find anything

## Strategy

1. Use fetch_url on the company's homepage to gather any visible emails/phones.
2. Write a BASELINE lead immediately via write_lead with whatever you have (domain + any email).
3. If the query needs named contacts, search for the team/leadership page and extract names.
4. Use permute_email + verify_email for discovered names.
5. Upgrade via write_lead again with the named contact when found.

## Hard rules

- Do NOT call search_web, list_companies, lookup_registry, search_workspace_leads, or queue_company.
- You enrich ONE company. Do not discover others.
- Budget: ${maxSteps} steps, ${Math.round(wallClockMs / 1000)} s.`;
}

function buildSubagentUserPrompt(data: ProspectingSubagentJobData): string {
  const { candidate, parsedIntent, rawQuery } = data;
  const parts: string[] = [
    `Target company: ${candidate.companyName}`,
  ];
  if (candidate.companyDomain) parts.push(`Domain: ${candidate.companyDomain}`);
  if (candidate.hints.length) parts.push(`Hints from dispatcher:\n${candidate.hints.map(h => `  - ${h}`).join('\n')}`);
  if (rawQuery) parts.push(`Original query context: "${rawQuery}"`);
  parts.push(
    `Industry: ${parsedIntent.industry ?? 'any'}`,
    `Desired fields: ${parsedIntent.desiredFields.join(', ') || 'standard contact data'}`,
  );
  const schema = parsedIntent.outputSchema ?? [];
  if (schema.length > 0) {
    parts.push(`Extra columns to fill via write_lead \`facts\`:`);
    for (const col of schema) {
      parts.push(`  - ${col.key} (${col.type}): "${col.label}"`);
    }
  }
  return parts.join('\n');
}

async function callLLM(history: HistoryMsg[]): Promise<string> {
  return callLlm({
    messages: history,
    max_tokens: 1000,
    temperature: 0,
    response_format: { type: 'json_object' },
    timeoutMs: LLM_TIMEOUT_MS,
  });
}

export async function runSubagent(
  data: ProspectingSubagentJobData,
  publisher: Redis,
): Promise<SubagentResult> {
  const { parentJobId, workspaceId, parsedIntent, budget } = data;
  const { maxSteps, wallClockMs } = budget;

  if (!isLlmConfigured()) {
    logger.error('[subagent] LLM not configured', { parentJobId });
    return { leads: [], stepsUsed: 0 };
  }

  // Subagents write to parentJobId so leads appear in the parent's result list.
  const ctx: ToolContext = {
    jobId: parentJobId,
    workspaceId,
    publisher,
    parsedIntent,
    leadsSoFar: [],
    pagesScrapedThisJob: new Set<string>(),
  };

  const history: HistoryMsg[] = [
    { role: 'system', content: buildSubagentSystemPrompt(maxSteps, wallClockMs) },
    { role: 'user', content: buildSubagentUserPrompt(data) },
  ];

  const startedAt = Date.now();
  let stepsUsed = 0;

  for (let step = 0; step < maxSteps; step++) {
    stepsUsed = step + 1;
    // Exit early once we've written at least one lead and had a few steps to upgrade it.
    if (ctx.leadsSoFar.length > 0 && step > 5) break;
    if (Date.now() - startedAt > wallClockMs) break;

    let raw: string;
    try {
      raw = await callLLM(history);
    } catch (err) {
      logger.warn('[subagent] LLM call failed', {
        parentJobId,
        step,
        company: data.candidate.companyName,
        err: err instanceof Error ? err.message : String(err),
      });
      break;
    }

    history.push({ role: 'assistant', content: raw });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (parsed?.done === true) break;

    const toolName: string | undefined = parsed?.tool;
    if (!toolName) {
      history.push({ role: 'user', content: 'Respond with a JSON tool call or {"done":true}.' });
      continue;
    }

    const result = await executeTool(toolName, parsed.args ?? {}, ctx, SUBAGENT_TOOLS);
    history.push({ role: 'user', content: `Tool ${toolName} result (ok=${result.ok}):\n${result.output}` });
  }

  logger.info('[subagent] finished', {
    parentJobId,
    company: data.candidate.companyName,
    leads: ctx.leadsSoFar.length,
    stepsUsed,
  });
  return { leads: ctx.leadsSoFar, stepsUsed };
}
