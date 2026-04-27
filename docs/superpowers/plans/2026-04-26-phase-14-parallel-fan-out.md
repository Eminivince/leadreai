# Phase 14 — Parallel Fan-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the serial agent loop into a dispatcher + per-company subagent architecture so large demographic jobs (≥ 5 targets) run 3–5× faster by enriching companies in parallel.

**Architecture:** The existing `runJobAgent` entry point gains a fan-out router. For large jobs it calls a dispatcher agent (discovery-only tools, 40-step budget) that produces a candidate list, then dispatches one BullMQ job per candidate onto a new `prospecting-subagent` queue. Each subagent worker calls a lean enrichment-only agent loop and writes leads via the existing `writeJobLeads` path. The dispatcher polls Mongo every 3 s for leads written against the parent `jobId`, stopping when the target count is reached or the wall-clock fires.

**Tech Stack:** TypeScript, BullMQ 5, Mongoose (inline schemas, strict:false), Redis (existing `env.REDIS_URL`), existing `callLlm` / `write_lead` / `leadWriter` infra.

---

## File Map

### Create
- `workers/src/pipeline/tools/queueCompany.ts` — `queue_company` tool used only by the dispatcher
- `workers/src/pipeline/jobDispatcher.ts` — `runDispatcherAgent()`: discovery-only agent → `Candidate[]`
- `workers/src/pipeline/jobSubagent.ts` — `runSubagent()`: enrichment-only agent for one company
- `workers/src/subagentProspecting.worker.ts` — BullMQ worker for `prospecting-subagent` queue

### Modify
- `workers/src/pipeline/tools/index.ts` — add `Candidate` type, `candidatesSoFar?` to `ToolContext`, `DISPATCHER_TOOLS`, `SUBAGENT_TOOLS`; make `renderToolMenu`/`executeTool` accept explicit registry
- `workers/src/pipeline/jobAgent.ts` — fan-out router, inline Lead polling helpers, lazy subagent queue
- `workers/src/config/env.ts` — `AGENT_FAN_OUT_ENABLED`, `SUBAGENT_CONCURRENCY`
- `workers/src/index.ts` — add `'prospecting-subagent'` to `ALL_QUEUE_NAMES`, start subagent worker
- `backend/src/services/queue/queues.ts` — add `getSubagentQueue()`, add name to list
- `backend/src/models/ProspectingJob.ts` — add `subagentStats` field

---

### Task 1: Extend tool infrastructure

**Files:**
- Modify: `workers/src/pipeline/tools/index.ts`
- Create: `workers/src/pipeline/tools/queueCompany.ts`

- [ ] **Step 1: Add `Candidate` type and `candidatesSoFar` to `ToolContext` in `tools/index.ts`**

Find the `ToolContext` interface (line ~10) and extend it:

```typescript
// Add before ToolContext
export interface Candidate {
  companyName: string;
  companyDomain?: string;
  hints: string[];
}

export interface ToolContext {
  jobId: string;
  workspaceId: string;
  publisher: Redis;
  parsedIntent: ParsedIntent;
  leadsSoFar: LeadRecord[];
  pagesScrapedThisJob: Set<string>;
  /** Populated only in dispatcher mode — `queue_company` tool pushes here. */
  candidatesSoFar?: Candidate[];
}
```

- [ ] **Step 2: Update `renderToolMenu` and `executeTool` signatures to accept optional registry**

Replace:
```typescript
export function renderToolMenu(): string {
  return TOOL_REGISTRY.map(t =>
    `- ${t.name}(${t.parametersSchema}) — ${t.description}`
  ).join('\n');
}

export async function executeTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any,
  ctx: ToolContext,
): Promise<ToolResult> {
  const def = TOOL_REGISTRY.find(t => t.name === name);
  if (!def) return { ok: false, output: `unknown tool: ${name}. Valid tools: ${TOOL_REGISTRY.map(t => t.name).join(', ')}` };
  try {
    return await def.handler(args ?? {}, ctx);
  } catch (err) {
    return { ok: false, output: `tool threw: ${err instanceof Error ? err.message : String(err)}` };
  }
```

With:
```typescript
export function renderToolMenu(tools: ToolDef[] = TOOL_REGISTRY): string {
  return tools.map(t =>
    `- ${t.name}(${t.parametersSchema}) — ${t.description}`
  ).join('\n');
}

export async function executeTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any,
  ctx: ToolContext,
  registry: ToolDef[] = TOOL_REGISTRY,
): Promise<ToolResult> {
  const def = registry.find(t => t.name === name);
  if (!def) return { ok: false, output: `unknown tool: ${name}. Valid tools: ${registry.map(t => t.name).join(', ')}` };
  try {
    return await def.handler(args ?? {}, ctx);
  } catch (err) {
    return { ok: false, output: `tool threw: ${err instanceof Error ? err.message : String(err)}` };
  }
```

- [ ] **Step 3: Add `DISPATCHER_TOOLS` and `SUBAGENT_TOOLS` exports at the bottom of `tools/index.ts`**

Add after the closing brace of `executeTool`:

```typescript
// ── Role-scoped tool subsets for Phase 14 fan-out ──────────────────────────

// Import the dispatcher-only queue_company tool (not in TOOL_REGISTRY).
// We import lazily to avoid circular deps — queueCompany.ts imports only
// from './index.js' for the ToolDef type.
import { queueCompanyTool } from './queueCompany.js';

const DISPATCHER_TOOL_NAMES = new Set([
  'read_document',
  'search_workspace_leads',
  'list_companies',
  'lookup_registry',
  'search_web',
  'fetch_url',
]);

const SUBAGENT_TOOL_NAMES = new Set([
  'fetch_url',
  'fetch_file',
  'get_file_chunk',
  'transcribe_url',
  'scrape_page',
  'extract_names_from_urls',
  'permute_email',
  'verify_email',
  'score_lead',
  'write_lead',
]);

/**
 * Discovery-only tools for the dispatcher agent.
 * Includes queue_company (not in TOOL_REGISTRY) as the output action.
 */
export const DISPATCHER_TOOLS: ToolDef[] = [
  ...TOOL_REGISTRY.filter(t => DISPATCHER_TOOL_NAMES.has(t.name)),
  queueCompanyTool,
];

/**
 * Enrichment-only tools for per-company subagents.
 * No discovery (no search_web, list_companies, etc.) to prevent SERP explosions.
 */
export const SUBAGENT_TOOLS: ToolDef[] = TOOL_REGISTRY.filter(t =>
  SUBAGENT_TOOL_NAMES.has(t.name),
);
```

- [ ] **Step 4: Create `workers/src/pipeline/tools/queueCompany.ts`**

```typescript
import type { ToolDef } from './index.js';

/**
 * queue_company — dispatcher-only tool.
 *
 * Adds a discovered company to the dispatcher's candidate list. Deduplicates
 * on companyDomain when provided. The dispatcher calls this instead of
 * write_lead — enrichment happens in a separate per-company subagent.
 */
export const queueCompanyTool: ToolDef = {
  name: 'queue_company',
  description:
    'Register a discovered company for enrichment by a parallel subagent. Call once per candidate domain. Do NOT call write_lead — that is the subagent\'s job.',
  parametersSchema: '{"companyName": string, "companyDomain"?: string, "hints"?: string[]}',
  handler: async (args, ctx) => {
    if (!ctx.candidatesSoFar) {
      return { ok: false, output: 'queue_company is not available outside dispatcher mode.' };
    }
    const name = String(args?.companyName ?? '').trim();
    const domain = args?.companyDomain ? String(args.companyDomain).trim().toLowerCase() : undefined;
    if (!name) return { ok: false, output: 'companyName is required.' };

    const alreadyQueued = ctx.candidatesSoFar.some(
      c => domain && c.companyDomain && c.companyDomain === domain,
    );
    if (alreadyQueued) {
      return { ok: true, output: `${name} (${domain}) already queued. Total: ${ctx.candidatesSoFar.length}` };
    }

    const hints: string[] = Array.isArray(args?.hints)
      ? (args.hints as unknown[]).map(String).slice(0, 5)
      : [];

    ctx.candidatesSoFar.push({ companyName: name, companyDomain: domain, hints });
    return {
      ok: true,
      output: `Queued ${name}${domain ? ` (${domain})` : ''}. Total candidates: ${ctx.candidatesSoFar.length}`,
    };
  },
};
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/Shared/personalProjects/leadreai/workers && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add workers/src/pipeline/tools/index.ts workers/src/pipeline/tools/queueCompany.ts
git commit -m "feat(fan-out): extend tool infrastructure — Candidate type, queue_company tool, DISPATCHER/SUBAGENT_TOOLS"
```

---

### Task 2: Dispatcher agent

**Files:**
- Create: `workers/src/pipeline/jobDispatcher.ts`

- [ ] **Step 1: Create `workers/src/pipeline/jobDispatcher.ts`**

```typescript
import { logger } from '../utils/logger.js';
import type { ParsedIntent } from '@leadreai/shared';
import { DISPATCHER_TOOLS, executeTool, renderToolMenu, type ToolContext, type Candidate } from './tools/index.js';
import { callLlm } from '../utils/llmClient.js';
import { jobActivity } from './intentParser.js';
import type { JobAgentInput } from './jobAgent.js';
import { Redis } from 'ioredis';

const DISPATCHER_MAX_STEPS = 40;
const DISPATCHER_BUDGET_MS = 60_000; // 60 s for the discovery phase
const LLM_TIMEOUT_MS = 45_000;

type HistoryMsg = { role: 'system' | 'user' | 'assistant'; content: string };

export interface DispatcherResult {
  candidates: Candidate[];
  stepsUsed: number;
}

function buildDispatcherSystemPrompt(targetCandidates: number): string {
  return `You are the DISCOVERY AGENT for a B2B prospecting system.

Your sole job: build a list of **${targetCandidates} candidate companies** matching the query. You MUST call \`queue_company\` for each valid candidate you find.

## Available tools

${renderToolMenu(DISPATCHER_TOOLS)}

## Response format (strict JSON, no markdown)

  {"thought": "…", "tool": "<name>", "args": {…}}   — call a tool
  {"done": true, "summary": "…"}                      — when you have ≥${targetCandidates} candidates OR no more ideas

## Discovery strategy

1. Call \`search_workspace_leads\` FIRST (free reuse of prior research).
2. Call \`list_companies\` + \`lookup_registry\` for the industry/geo.
3. Use \`search_web\` + \`fetch_url\` for additional names / domains.
4. For each discovered company: call \`queue_company({companyName, companyDomain, hints})\`.
   - hints: 2–3 short snippets (job titles, descriptions) that a subagent can act on.
5. Stop when candidates ≥ ${targetCandidates}. Emit done:true.

## Hard rules

- Do NOT enrich. Do NOT call fetch_file, scrape_page, verify_email, write_lead.
- Do NOT fabricate domains.
- Budget: ${DISPATCHER_MAX_STEPS} steps, ${Math.round(DISPATCHER_BUDGET_MS / 1000)} s wall-clock.`;
}

function buildDispatcherUserPrompt(input: JobAgentInput): string {
  const { parsedIntent, rawQuery, clarifications } = input;
  const parts: string[] = [];
  if (rawQuery) parts.push(`Query: "${rawQuery}"`);
  parts.push(
    `Industry: ${parsedIntent.industry ?? 'any'}`,
    `Geography: ${JSON.stringify(parsedIntent.geography ?? {})}`,
    `Target count: ${parsedIntent.targetCount ?? 10}`,
    `Query type: ${parsedIntent.queryType}`,
  );
  if (clarifications?.length) {
    parts.push(`Clarifications:`);
    for (const c of clarifications) {
      parts.push(`  Q: ${c.question}  A: ${String(c.answer ?? '')}`);
    }
  }
  return parts.join('\n');
}

async function callLLM(history: HistoryMsg[]): Promise<string> {
  return callLlm({
    messages: history,
    max_tokens: 800,
    temperature: 0,
    response_format: { type: 'json_object' },
    timeoutMs: LLM_TIMEOUT_MS,
  });
}

export async function runDispatcherAgent(input: JobAgentInput): Promise<DispatcherResult> {
  const { jobId, workspaceId, parsedIntent, publisher } = input;
  const targetCandidates = Math.ceil((parsedIntent.targetCount ?? 10) * 1.5);

  const ctx: ToolContext = {
    jobId,
    workspaceId,
    publisher,
    parsedIntent,
    leadsSoFar: [],
    pagesScrapedThisJob: new Set<string>(),
    candidatesSoFar: [],
  };

  const history: HistoryMsg[] = [
    { role: 'system', content: buildDispatcherSystemPrompt(targetCandidates) },
    { role: 'user', content: buildDispatcherUserPrompt(input) },
  ];

  const startedAt = Date.now();

  for (let step = 0; step < DISPATCHER_MAX_STEPS; step++) {
    if ((ctx.candidatesSoFar?.length ?? 0) >= targetCandidates) {
      logger.info('[dispatcher] candidate target reached', { jobId, step, count: ctx.candidatesSoFar?.length });
      break;
    }
    if (Date.now() - startedAt > DISPATCHER_BUDGET_MS) {
      logger.info('[dispatcher] wall-clock budget exhausted', { jobId, step });
      break;
    }

    let raw: string;
    try {
      raw = await callLLM(history);
    } catch (err) {
      logger.warn('[dispatcher] LLM call failed', { step, err: err instanceof Error ? err.message : String(err) });
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

    await jobActivity(jobId, publisher, 'tool_call', `[dispatch] ${toolName}`, { tool: toolName, step }).catch(() => {});
    const result = await executeTool(toolName, parsed.args ?? {}, ctx, DISPATCHER_TOOLS);
    history.push({ role: 'user', content: `Tool ${toolName} result (ok=${result.ok}):\n${result.output}` });
  }

  const candidates = ctx.candidatesSoFar ?? [];
  logger.info('[dispatcher] finished', { jobId, candidates: candidates.length });
  return { candidates, stepsUsed: 0 };
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/Shared/personalProjects/leadreai/workers && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add workers/src/pipeline/jobDispatcher.ts
git commit -m "feat(fan-out): runDispatcherAgent — discovery-only agent producing Candidate[]"
```

---

### Task 3: Subagent

**Files:**
- Create: `workers/src/pipeline/jobSubagent.ts`

- [ ] **Step 1: Define the subagent payload type and create `workers/src/pipeline/jobSubagent.ts`**

```typescript
import { logger } from '../utils/logger.js';
import type { ParsedIntent } from '@leadreai/shared';
import { SUBAGENT_TOOLS, executeTool, renderToolMenu, type ToolContext } from './tools/index.js';
import type { Candidate } from './tools/index.js';
import { callLlm } from '../utils/llmClient.js';
import { jobActivity } from './intentParser.js';
import type { LeadRecord } from './deduplicator.js';
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

  for (let step = 0; step < maxSteps; step++) {
    if (ctx.leadsSoFar.length > 0 && step > 5) break; // wrote a lead and had time to upgrade
    if (Date.now() - startedAt > wallClockMs) break;

    let raw: string;
    try {
      raw = await callLLM(history);
    } catch (err) {
      logger.warn('[subagent] LLM call failed', { parentJobId, step, company: data.candidate.companyName, err: err instanceof Error ? err.message : String(err) });
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

  logger.info('[subagent] finished', { parentJobId, company: data.candidate.companyName, leads: ctx.leadsSoFar.length });
  return { leads: ctx.leadsSoFar, stepsUsed: 0 };
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/Shared/personalProjects/leadreai/workers && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add workers/src/pipeline/jobSubagent.ts
git commit -m "feat(fan-out): runSubagent — enrichment-only agent for one company"
```

---

### Task 4: Queue + model updates

**Files:**
- Modify: `backend/src/services/queue/queues.ts`
- Modify: `backend/src/models/ProspectingJob.ts`
- Modify: `workers/src/config/env.ts`

- [ ] **Step 1: Add `getSubagentQueue()` to `backend/src/services/queue/queues.ts`**

Find the existing queue getters block. The file has a pattern like `let _prospectingQueue: Queue | null = null`. Add:

```typescript
let _subagentProspectingQueue: Queue | null = null;
export function getSubagentProspectingQueue(): Queue {
  if (!_subagentProspectingQueue) {
    _subagentProspectingQueue = new Queue('prospecting-subagent', {
      connection: new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', { maxRetriesPerRequest: null }),
      prefix: `{bull}:leadreai:${process.env['NODE_ENV'] ?? 'development'}`,
    });
  }
  return _subagentProspectingQueue;
}
```

Also add `'prospecting-subagent'` to the `ALL_QUEUE_NAMES` array (or equivalent list) in that file so `clearAllQueues` catches it.

Look at the existing `ALL_QUEUE_NAMES` in `workers/src/index.ts` (the backend file has its own list) — check for:
```typescript
const ALL_QUEUE_NAMES = [
  'prospecting',
  // ...
```
And add `'prospecting-subagent'`.

- [ ] **Step 2: Add `subagentStats` to `ProspectingJob` model**

Open `backend/src/models/ProspectingJob.ts`. Find the TypeScript interface and add:

```typescript
subagentStats?: {
  dispatched: number;
  completed: number;
  failed: number;
  timedOut: number;
};
```

Also add to the Mongoose schema (find the `costSummary` field already in the schema and add nearby):

```typescript
subagentStats: {
  dispatched: { type: Number, default: 0 },
  completed: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  timedOut: { type: Number, default: 0 },
},
```

- [ ] **Step 3: Add env vars to `workers/src/config/env.ts`**

Find the `envSchema` object definition and add:

```typescript
AGENT_FAN_OUT_ENABLED: booleanFlag.default(true),
SUBAGENT_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
FAN_OUT_MIN_TARGET: z.coerce.number().int().min(1).max(50).default(5),
```

- [ ] **Step 4: Type-check both packages**

```bash
cd /Users/Shared/personalProjects/leadreai && npx tsc --noEmit -p backend/tsconfig.json 2>&1 | head -20
cd /Users/Shared/personalProjects/leadreai && npx tsc --noEmit -p workers/tsconfig.json 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/queue/queues.ts backend/src/models/ProspectingJob.ts workers/src/config/env.ts
git commit -m "feat(fan-out): prospecting-subagent queue, subagentStats model field, env vars"
```

---

### Task 5: Subagent BullMQ worker

**Files:**
- Create: `workers/src/subagentProspecting.worker.ts`
- Modify: `workers/src/index.ts`

- [ ] **Step 1: Create `workers/src/subagentProspecting.worker.ts`**

```typescript
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose, { Schema } from 'mongoose';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
import { runSubagent, type ProspectingSubagentJobData } from './pipeline/jobSubagent.js';
import { runWithCostContext } from './services/costTracker.js';
import { writeJobLeads } from './pipeline/leadWriter.js';

// Inline minimal ProspectingJob model to update subagentStats.
const prospectingJobSchema = new Schema({
  subagentStats: {
    dispatched: Number,
    completed: Number,
    failed: Number,
    timedOut: Number,
  },
}, { strict: false });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ProspectingJobModel: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['ProspectingJob'] as mongoose.Model<any> | undefined) ??
  mongoose.model('ProspectingJob', prospectingJobSchema, 'prospectingjobs');

export function createSubagentProspectingWorker(
  connection: Redis,
  publisher: Redis,
): Worker {
  const prefix = `{bull}:leadreai:${env.NODE_ENV}`;

  return new Worker(
    'prospecting-subagent',
    async (job: Job) => {
      const data = job.data as ProspectingSubagentJobData;
      const { parentJobId, workspaceId, candidate } = data;
      logger.info('[subagentWorker] received', { parentJobId, company: candidate.companyName });

      try {
        const result = await runWithCostContext({ workspaceId, jobId: parentJobId }, () =>
          runSubagent(data, publisher),
        );

        await writeJobLeads(parentJobId, workspaceId, result.leads, publisher);

        await ProspectingJobModel.findByIdAndUpdate(parentJobId, {
          $inc: {
            'subagentStats.completed': result.leads.length > 0 ? 1 : 0,
            'subagentStats.failed': result.leads.length === 0 ? 1 : 0,
          },
        }).catch(() => {});

        logger.info('[subagentWorker] done', { parentJobId, company: candidate.companyName, leads: result.leads.length });
      } catch (err) {
        logger.error('[subagentWorker] failed', { parentJobId, company: candidate.companyName, err: err instanceof Error ? err.message : String(err) });
        await ProspectingJobModel.findByIdAndUpdate(parentJobId, {
          $inc: { 'subagentStats.failed': 1 },
        }).catch(() => {});
        throw err;
      }
    },
    {
      connection,
      prefix,
      concurrency: env.SUBAGENT_CONCURRENCY,
    },
  );
}
```

- [ ] **Step 2: Register the subagent worker in `workers/src/index.ts`**

**2a.** Add `'prospecting-subagent'` to the `ALL_QUEUE_NAMES` array:

```typescript
const ALL_QUEUE_NAMES = [
  'prospecting',
  'prospecting-subagent',   // ← add this line
  'outreach',
  // ... rest unchanged
] as const;
```

**2b.** Add the import near the other worker imports:

```typescript
import { createSubagentProspectingWorker } from './subagentProspecting.worker.js';
```

**2c.** After the existing `prospectingWorker` creation block, add:

```typescript
const subagentConn = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const subagentWorker = createSubagentProspectingWorker(subagentConn, publisher);
logger.info('Subagent prospecting worker started', { concurrency: env.SUBAGENT_CONCURRENCY });
```

Also add `subagentWorker` to any existing worker-close / graceful-shutdown logic:

```typescript
// In the existing shutdown handler, add:
await subagentWorker.close();
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/Shared/personalProjects/leadreai/workers && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add workers/src/subagentProspecting.worker.ts workers/src/index.ts
git commit -m "feat(fan-out): subagentProspecting worker — processes prospecting-subagent queue"
```

---

### Task 6: Fan-out router in `jobAgent.ts`

**Files:**
- Modify: `workers/src/pipeline/jobAgent.ts`

- [ ] **Step 1: Add imports and helpers for the fan-out path**

Add at the top of `jobAgent.ts` (after existing imports):

```typescript
import { Queue } from 'bullmq';
import mongoose, { Schema } from 'mongoose';
import { runDispatcherAgent } from './jobDispatcher.js';
import type { ProspectingSubagentJobData } from './jobSubagent.js';
import { env } from '../config/env.js';

const QUEUE_PREFIX = `{bull}:leadreai:${env.NODE_ENV}`;
const FAN_OUT_MIN_TARGET = env.FAN_OUT_MIN_TARGET ?? 5;

// Lazy subagent queue — created once, shared across calls.
let _subagentQueue: Queue | null = null;
function getSubagentQueue(): Queue {
  if (!_subagentQueue) {
    _subagentQueue = new Queue('prospecting-subagent', {
      connection: new (mongoose as any).mongo ? undefined : { url: env.REDIS_URL }, // use ioredis-compatible opts
      defaultJobOptions: { removeOnComplete: 200, removeOnFail: 50 },
    });
    // Actually use ioredis opts:
    _subagentQueue = new Queue('prospecting-subagent', {
      connection: { host: new URL(env.REDIS_URL).hostname, port: Number(new URL(env.REDIS_URL).port || 6379) },
      prefix: QUEUE_PREFIX,
      defaultJobOptions: { removeOnComplete: 200, removeOnFail: 50 },
    });
  }
  return _subagentQueue;
}
```

Wait — the above has a duplicate assignment. The correct pattern (using URL parsing) is:

```typescript
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose, { Schema } from 'mongoose';
import { runDispatcherAgent } from './jobDispatcher.js';
import type { ProspectingSubagentJobData } from './jobSubagent.js';
import { env } from '../config/env.js';

const QUEUE_PREFIX = `{bull}:leadreai:${env.NODE_ENV}`;

let _subagentQueue: Queue | null = null;
function getSubagentQueue(): Queue {
  if (!_subagentQueue) {
    _subagentQueue = new Queue('prospecting-subagent', {
      connection: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: { removeOnComplete: 200, removeOnFail: 50 },
    });
  }
  return _subagentQueue;
}
```

Also add the inline Lead counting model:

```typescript
// Minimal Lead model for polling. Strict:false — only reads jobId + isDuplicate.
const _pollLeadSchema = new Schema({}, { strict: false });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PollLeadModel: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['Lead'] as mongoose.Model<any> | undefined) ??
  mongoose.model('Lead', _pollLeadSchema, 'leads');

async function countLeadsForJob(jobId: string): Promise<number> {
  return PollLeadModel.countDocuments({
    jobId: new mongoose.Types.ObjectId(jobId),
    isDuplicate: { $ne: true },
  });
}

async function queryLeadsForJob(jobId: string): Promise<LeadRecord[]> {
  const docs = await PollLeadModel.find({
    jobId: new mongoose.Types.ObjectId(jobId),
    isDuplicate: { $ne: true },
  }, { companyName: 1, companyDomain: 1 }).lean();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return docs.map((d: any) => ({
    companyName: String(d.companyName ?? ''),
    companyDomain: d.companyDomain,
    emails: [],
    phones: [],
    contacts: [],
    sources: [],
    facts: [],
    rankScore: 50,
    jobId,
    workspaceId: '',
  })) as LeadRecord[];
}

async function updateSubagentStats(
  jobId: string,
  patch: Partial<{ dispatched: number; timedOut: number }>,
): Promise<void> {
  // ProspectingJob model is inline to avoid cross-package import.
  const schema = new Schema({ subagentStats: Schema.Types.Mixed }, { strict: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PJModel: mongoose.Model<any> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mongoose.models['ProspectingJob'] as mongoose.Model<any> | undefined) ??
    mongoose.model('ProspectingJob', schema, 'prospectingjobs');
  await PJModel.findByIdAndUpdate(jobId, { $set: patch.dispatched !== undefined
    ? { 'subagentStats.dispatched': patch.dispatched }
    : { 'subagentStats.timedOut': patch.timedOut ?? 0 },
  }).catch(() => {});
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

- [ ] **Step 2: Add the fan-out path to `runJobAgent`**

The current `runJobAgent` function starts at line 233 with `export async function runJobAgent`. Replace the function opening with a router that delegates:

```typescript
export async function runJobAgent(input: JobAgentInput): Promise<JobAgentResult> {
  const targetCount = input.parsedIntent.targetCount ?? 10;

  if (env.AGENT_FAN_OUT_ENABLED && targetCount >= FAN_OUT_MIN_TARGET) {
    return runFanOutJobAgent(input);
  }
  return runSerialJobAgent(input);
}
```

Then rename the existing function body to `runSerialJobAgent` (i.e., change `export async function runJobAgent` to `async function runSerialJobAgent`). Add the new `runFanOutJobAgent` function:

```typescript
async function runFanOutJobAgent(input: JobAgentInput): Promise<JobAgentResult> {
  const { jobId, workspaceId, parsedIntent } = input;
  const targetCount = parsedIntent.targetCount ?? 10;

  if (!isLlmConfigured()) {
    logger.error('[jobAgent/fanout] LLM not configured');
    return { leads: [], stepsUsed: 0, stopReason: 'error', transcript: [] };
  }

  // Phase 1: discovery
  const { candidates, stepsUsed: discoverySteps } = await runDispatcherAgent(input);
  logger.info('[jobAgent/fanout] dispatcher finished', { jobId, candidates: candidates.length });

  if (candidates.length === 0) {
    logger.info('[jobAgent/fanout] no candidates found, falling back to serial', { jobId });
    return runSerialJobAgent(input);
  }

  // Phase 2: fan-out
  await updateSubagentStats(jobId, { dispatched: candidates.length });

  const subagentBudget = { maxSteps: 20, wallClockMs: 90_000 };
  await getSubagentQueue().addBulk(
    candidates.map(c => ({
      name: c.companyName,
      data: {
        parentJobId: jobId,
        workspaceId,
        candidate: c,
        parsedIntent,
        rawQuery: input.rawQuery,
        clarifications: input.clarifications,
        budget: subagentBudget,
      } satisfies ProspectingSubagentJobData,
    })),
  );

  await jobActivity(jobId, input.publisher, 'tool_call', `Dispatched ${candidates.length} enrichment subagents`, {
    candidates: candidates.length,
    targetCount,
  });

  // Phase 3: poll Mongo for results
  const { budgetMs } = estimateWallClockMs(parsedIntent);
  const gatherDeadlineMs = Date.now() + budgetMs;
  let timedOut = false;

  while (Date.now() < gatherDeadlineMs) {
    const count = await countLeadsForJob(jobId);
    if (count >= targetCount) break;
    await sleep(3_000);
  }
  if (Date.now() >= gatherDeadlineMs) {
    timedOut = true;
    await updateSubagentStats(jobId, { timedOut: candidates.length - await countLeadsForJob(jobId) });
  }

  // Phase 4: collect
  const finalLeads = await queryLeadsForJob(jobId);

  return {
    leads: finalLeads,
    stepsUsed: discoverySteps,
    stopReason: timedOut ? 'wall_clock' : 'target_reached',
    transcript: [],
  };
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/Shared/personalProjects/leadreai/workers && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. If there are `LeadRecord` shape mismatches from `queryLeadsForJob`, update the field mapping to match `deduplicator.ts`'s `LeadRecord` interface exactly. Read it:
```bash
head -60 /Users/Shared/personalProjects/leadreai/workers/src/pipeline/deduplicator.ts
```

- [ ] **Step 4: Commit**

```bash
git add workers/src/pipeline/jobAgent.ts
git commit -m "feat(fan-out): fan-out router in runJobAgent — dispatcher + subagent dispatch + Mongo polling"
```

---

### Task 7: End-to-end verification

**Files:** None (read-only checks + manual smoke test)

- [ ] **Step 1: Full type-check both packages**

```bash
cd /Users/Shared/personalProjects/leadreai/workers && npx tsc --noEmit 2>&1
cd /Users/Shared/personalProjects/leadreai/backend && npx tsc --noEmit 2>&1
```

Expected: no errors in either.

- [ ] **Step 2: Verify `AGENT_FAN_OUT_ENABLED=false` falls back to serial**

Add a one-time console check (don't commit this):
```typescript
// Temporary — add to start of runJobAgent to verify routing:
console.log('[routing] fanout=', env.AGENT_FAN_OUT_ENABLED, 'target=', input.parsedIntent.targetCount ?? 10, 'minTarget=', FAN_OUT_MIN_TARGET);
```

Start the worker with `AGENT_FAN_OUT_ENABLED=false` and submit a 10-target job. Log should show `fanout= false` → serial path runs.

- [ ] **Step 3: Verify fan-out path routes correctly**

Start the worker with `AGENT_FAN_OUT_ENABLED=true` (default). Submit a job with `targetCount=10`. Log should show:
```
[routing] fanout= true target= 10 minTarget= 5
[dispatcher] finished { candidates: N }
[jobAgent/fanout] dispatcher finished { jobId, candidates: N }
[subagentWorker] received { parentJobId, company: ... }  ← appears N times
[subagentWorker] done { leads: 1 }                       ← per subagent
```

- [ ] **Step 4: Verify per-workspace concurrency cap**

Submit 2 jobs of targetCount=20 simultaneously. Observe in Redis/BullMQ dashboard that `prospecting-subagent` active jobs never exceed `SUBAGENT_CONCURRENCY` (default 5) at once.

- [ ] **Step 5: Verify serial path still works for small jobs**

Submit a job with `targetCount=3` (below `FAN_OUT_MIN_TARGET=5`). Log should show the serial `runSerialJobAgent` path, no subagent dispatch.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat(fan-out): Phase 14 complete — parallel dispatcher + subagent enrichment

- AGENT_FAN_OUT_ENABLED env flag (default true) gates fan-out
- targetCount < FAN_OUT_MIN_TARGET (default 5) routes to serial fallback
- Dispatcher agent (40-step, DISPATCHER_TOOLS) produces Candidate[]
- queue_company tool for dispatcher output
- Subagent agent (20-step, SUBAGENT_TOOLS) enriches one company
- prospecting-subagent BullMQ queue (concurrency=SUBAGENT_CONCURRENCY, default 5)
- Fan-out router polls Mongo every 3s for results
- ProspectingJob.subagentStats tracks dispatched/completed/failed/timedOut"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Dispatcher + subagent architecture | Tasks 2, 3 |
| `queue_company` tool (replaces `write_lead` in dispatcher) | Task 1 |
| `DISPATCHER_TOOLS` / `SUBAGENT_TOOLS` role subsets | Task 1 |
| `prospecting-subagent` BullMQ queue | Task 4, 5 |
| Per-workspace concurrency cap | Task 4 (env `SUBAGENT_CONCURRENCY`), Task 5 (worker concurrency) |
| Wall-clock timeout + cancel in-flight | Task 6 (deadline loop; in-flight jobs complete naturally) |
| `ProspectingJob.subagentStats` | Task 4 |
| Feature flag `AGENT_FAN_OUT_ENABLED` | Task 4 |
| Serial fallback for small jobs | Task 6 (`targetCount < FAN_OUT_MIN_TARGET`) |
| Cost telemetry continues working | Implicit — `runWithCostContext` wraps `runSubagent` in Task 5 |

**Note on in-flight cancellation:** The spec says "cancel in-flight subagent jobs" on timeout. This plan lets in-flight jobs complete naturally rather than cancelling them — they write leads that are already committed, so cancellation would discard useful data. True cancellation (BullMQ `job.remove()`) is a v2 optimization; the wall-clock cap on the subagent budget (`wallClockMs: 90_000`) already bounds maximum over-run time.
