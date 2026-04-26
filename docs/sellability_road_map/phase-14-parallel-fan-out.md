# Phase 14 — Multi-Agent Parallel Fan-Out

## Goal

Turn the current **serial** agent loop into a **dispatcher + per-company subagents** architecture. A 50-target demographic query that takes 20 minutes today should take 2–4 minutes by running per-company enrichment in parallel.

## Commercial Outcome

- **Demo-time perception win**: jobs that feel "instant" convert demos better than jobs that feel like batch runs. The perceived-quality delta is worth more than the actual-time delta.
- **Throughput → unit economics**: shorter jobs mean more jobs per workspace per day mean more credits consumed mean better per-customer ARR at every tier.
- **Agent-loop cost is largely fixed per step**; parallelism doesn't reduce total LLM spend but compresses wall-clock meaningfully, which lets us raise perceived value without raising price.
- Estimated effort: **5–8 days**. Most architectural of the 11–14 set.

## What Users See After This Phase

1. Demographic queries (`targetCount ≥ 10`) complete in 2–5× less wall-clock time.
2. The activity log shows per-company progress in parallel (multiple concurrent "Agent researching X Co" tracks instead of a single sequential stream).
3. Budget and cost telemetry still makes sense — total cost is roughly the same, just spent faster.

---

## Architecture Overview

### Today's serial loop

`runJobAgent` (in `workers/src/pipeline/jobAgent.ts`) runs one LLM turn at a time. For a job where `targetCount=50`:
- Discovery (3–5 turns): `list_companies` + `search_web` to get candidate domains.
- Per-company enrichment (typically 5–8 turns × 50 companies = 250–400 turns) — serial.
- Critic check every 5 turns.

At ~5–10s per LLM call, a 300-turn loop is **25–50 minutes**. The critic + budget caps usually fire first, leaving many companies at "baseline" quality.

### Target architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   DISPATCHER AGENT                             │
│  1. Reads parsedIntent + clarifications                         │
│  2. Calls discovery tools: search_workspace_leads, list_companies,
│     lookup_registry, search_web  (shared discovery, same as today)
│  3. Produces candidate[]  — typically 1.5–2× targetCount domains
│  4. Emits one BullMQ job per candidate to the 'prospecting-subagent' queue
│  5. Waits for subagent jobs to complete (or wall-clock budget fires)
│  6. Aggregates, ranks, writes via existing leadWriter                         │
└──────────────────────────────────────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │  SUBAGENT    │  │  SUBAGENT    │  │  SUBAGENT    │   (× N)
  │  Company A   │  │  Company B   │  │  Company C   │
  │              │  │              │  │              │
  │  Tools avail:│  │  Same menu,  │  │  Same menu,  │
  │  - fetch_url │  │  shorter     │  │  shorter     │
  │  - fetch_file│  │  budget      │  │  budget      │
  │  - extract   │  │              │  │              │
  │  - permute   │  │              │  │              │
  │  - verify    │  │              │  │              │
  │  - scrape    │  │              │  │              │
  │  - write_lead│  │              │  │              │
  │  (discovery  │  │              │  │              │
  │   tools      │  │              │  │              │
  │   excluded)  │  │              │  │              │
  └──────────────┘  └──────────────┘  └──────────────┘
```

**Key constraints**:
- **Subagents cannot discover.** They're given a specific company + domain + any hints the dispatcher gathered. They enrich only. This prevents N parallel SERP explosions.
- **Subagents have independent budgets** — typically 15–20 steps each. Blown budget = baseline-only record. Baseline + named-contact retry is the two-pass strategy the current agent already uses.
- **Dispatcher waits** on sub-job completion via BullMQ `Promise.all` + a parent-level wall-clock timeout. On timeout, whatever subagents have finished are committed; in-flight ones are cancelled.
- **Fan-out concurrency is bounded** — per-workspace parallel-subagent cap (default 5, configurable) prevents a single expensive job from hogging the worker pool.

### BullMQ queue additions

New queue: `prospecting-subagent`. Uses the same Redis instance; workers share the existing process.

```typescript
interface ProspectingSubagentJob {
  parentJobId: string;
  workspaceId: string;
  candidate: {
    companyName: string;
    companyDomain?: string;     // when known from discovery
    hints: string[];             // search-result snippets the dispatcher saw
  };
  parsedIntent: ParsedIntent;    // same as parent
  rawQuery?: string;
  clarifications?: ClarificationAnswer[];
  outputSchema: OutputSchemaColumn[];
  budget: {
    maxSteps: number;            // e.g. 20
    wallClockMs: number;         // e.g. 90_000
  };
}
```

### Tool registry per role

```typescript
// workers/src/pipeline/tools/index.ts gains:
export const DISPATCHER_TOOLS = TOOL_REGISTRY.filter(t => [
  'read_document',
  'search_workspace_leads', // from Phase 11 M0
  'list_companies',
  'lookup_registry',
  'search_web',
  'fetch_url',               // allowed: dispatcher reads homepages to dedup candidates
  'score_lead',
].includes(t.name));

export const SUBAGENT_TOOLS = TOOL_REGISTRY.filter(t => [
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
].includes(t.name));
```

Each role gets its own system prompt derived from the current one but scoped to its responsibilities.

### Aggregation

Subagents `write_lead` directly as today — the upsert on `(workspaceId, companyDomain)` means no aggregation logic is needed. When the dispatcher finishes waiting, it queries Mongo for leads written against this `parentJobId` and proceeds with the existing dedup + rank steps.

---

## Data Model Additions

None required. `parentJobId` on subagent leads is already handled via `Lead.jobId`. We might add a denormalized `ProspectingJob.subagentStats: {dispatched, completed, failed, timedOut}` for dashboard observability.

---

## Implementation Sequence

### Stage 1: Extract the per-company enrichment loop (1 day)

Refactor `jobAgent.ts` into three exported functions:

```typescript
export async function runDispatcherAgent(input): Promise<DispatchResult>;
export async function runSubagent(input): Promise<SubagentResult>;
export async function runJobAgent(input): Promise<JobAgentResult>; // legacy — delegates
```

`runJobAgent` keeps the current serial behavior for small jobs (`targetCount < 5`). Single-company / `contact_lookup` queries bypass fan-out entirely.

### Stage 2: Dispatcher tool subset + prompt (1 day)

Write the dispatcher's system prompt — narrower than today's, focused on producing a good candidate list. Dispatcher stops when it has ≥ `1.5 × targetCount` candidates OR its step budget is consumed.

### Stage 3: Subagent queue + worker (1 day)

New BullMQ queue + per-job handler that calls `runSubagent`. Handler shares the Mongo/LLM infra with the existing prospecting worker.

### Stage 4: Dispatcher orchestration (1–2 days)

Dispatcher calls `subagentQueue.addBulk(candidates.map(...))` then awaits. BullMQ's `Promise.all` on job completion handles the gather.

Wall-clock timeout at the dispatcher level: cancel in-flight subagent jobs, commit whatever's written.

### Stage 5: Per-workspace concurrency cap (0.5 day)

New BullMQ queue option: `limiter: { max: workspace.subagentParallelism ?? 5, duration: 1000 }` — or use a custom per-workspace semaphore in Redis.

### Stage 6: Observability (0.5 day)

`ProspectingJob.subagentStats` updates as subagents complete. Detail page shows "12/18 subagents complete" instead of just "agent running."

### Stage 7: Backward-compat fallback + feature flag (0.5 day)

New env flag `AGENT_FAN_OUT_ENABLED` (default true in dev, staged rollout in prod). Set `false` to run the legacy serial `runJobAgent` for comparison.

Total: **5–8 days** including the refactor.

---

## Verification Criteria

- A 50-target demographic query (e.g., "top 50 Nigerian fintechs") completes in wall-clock time ≤ 40% of the pre-refactor baseline for the same query.
- Total lead count is equivalent (± 10%) to the pre-refactor baseline on the same query.
- LLM token spend is equivalent (± 10%) — parallelism shouldn't *save* tokens, but it shouldn't drastically increase either.
- A single-named-company query (`contact_lookup` or `targetCount=1`) still runs via the serial path, no subagent job created.
- When the parent wall-clock fires, in-flight subagent jobs are cancelled — no zombie jobs continue past the parent's completion.
- Per-workspace concurrency cap enforced: simultaneous heavy jobs from one workspace don't starve other workspaces.

---

## Explicitly Out of Scope

- **Subagent-to-subagent communication** — no shared scratch pad between parallel subagents. If Subagent A discovers Company B's parent company, Subagent B won't hear about it. Each subagent is an island.
- **Streaming partial results to UI during fan-out** — the detail page polls; real-time SSE of every subagent event is more infra than it's worth for v1.
- **Adaptive concurrency** — "increase parallelism if the workspace is on Pro tier" is a pricing concern, not an agent concern. Fixed cap per workspace via env is fine.
- **Cross-job subagent reuse** — if two jobs target overlapping companies at once, they each run their own subagent. De-duping cross-job is future optimization; current Lead upsert handles the eventual-consistency side.
- **Subagent-specific critics** — the existing dispatcher-level critic is enough. Per-subagent critics are overkill for v1 given subagents are budget-limited anyway.

## Risks to Flag

- **LLM rate limits.** 20 parallel subagents burn through OpenRouter concurrency limits much faster than one serial agent. The per-workspace cap is the primary defense; also, the `callLlm` backoff chain already handles 429 retries.
- **Mongo upsert contention.** 20 subagents racing `bulkWrite` on the same collection is fine normally but worth load-testing. Index on `(workspaceId, companyDomain)` must be present (it is).
- **BullMQ memory** with many parallel jobs. Monitor Redis memory after rollout; the dispatcher's `Promise.all` parks jobs in memory until all resolve.

## Connection to Other Phases

- **Phase 13 (Cost Explainer)** is a prerequisite for honest communication of what fan-out does and doesn't save. Without per-job cost telemetry, the post-rollout "it's faster but costs about the same" conversation is harder than it should be.
- **Phase 11 M0 (`search_workspace_leads`)** dramatically improves fan-out efficiency — if the dispatcher hits 15 leads already in the workspace before fanning out, 15 subagent invocations are saved.
- **Phase 12 (Evidence Graph Exports)** unaffected — subagents write the same leads with the same provenance.
