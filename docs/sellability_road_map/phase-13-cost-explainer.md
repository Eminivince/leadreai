# Phase 13 — Cost Explainer

## Goal

Show per-job dollar cost with a line-item breakdown, in the UI and via API. No customer should have to guess what a query costs them.

## Commercial Outcome

- Closes the single most common enterprise procurement question: _"What will this cost per query?"_
- Turns a credibility risk ("these AI tools are opaque about costs") into a differentiator.
- Creates the data foundation for a usage-based billing tier later — per-job cost is the atomic unit.
- Estimated effort: **2–3 days**. Highest $/dev-day on the 11–14 sequence.

## What Users Can See After This Phase

1. At job completion: a **Cost** card showing total USD + a breakdown by category.
2. For each job, a downloadable cost receipt (JSON + CSV) with every cost event.
3. On the workspace usage dashboard: rolling 30-day spend, top-10 most expensive jobs.
4. For each tool call in the job's activity log, an inline cost annotation.

Example breakdown for a 50-lead demographic job:

```
Total: $0.42
  LLM tokens    $0.18   (142k in / 18k out · openrouter/anthropic/claude-sonnet-4-6 · 64% cache-hit)
  SERP calls    $0.11   (47 Serper + 12 SerpAPI)
  File fetch    $0.08   (6 PDFs cached, 3 fresh · avg 2.1MB)
  Page scrape   $0.05   (4 calls · avg 3.2s)
  Transcription  —      (0 min)
  Agent control $0.00   (critic pass, tool menu)
```

---

## Architecture Overview

### Cost Events

Every paid action emits a `CostEvent` row. Events are cheap to write, aggregated on demand for the dashboard, and deletable en masse if needed. No hot-path counters to race against.

```typescript
interface ICostEvent {
  _id: ObjectId;
  workspaceId: ObjectId;
  jobId?: ObjectId;              // null for non-job costs (campaign sends, embeddings)
  campaignId?: ObjectId;         // for outreach-send costs
  category: 'llm' | 'serp' | 'file_fetch' | 'transcription' | 'scrape' | 'embedding';
  provider: string;              // 'openrouter', 'serpapi', 'serper', 'brave', 'resend', 'self-hosted', ...
  model?: string;                // LLM model id when relevant
  units: { input?: number; output?: number; cached?: number; count?: number; bytes?: number; seconds?: number };
  unitCostUSD: number;           // cost per unit (e.g. $/1M input tokens)
  totalCostUSD: number;          // pre-computed so dashboards don't recalculate
  occurredAt: Date;
  meta?: Record<string, unknown>;
}
```

Indexes: `(workspaceId, occurredAt)`, `(jobId)`, `(workspaceId, category, occurredAt)`.

Retention: TTL 180 days (configurable). Aggregate monthly rollups live in a separate `WorkspaceUsageMonthly` collection for long-term billing.

### Pricing Table

Prices change. We want to be able to re-price retroactively or run "what if we switched models" reports. Store unit prices in `config/pricing.ts` (versioned in git), never inline in code.

```typescript
export const PRICING = {
  llm: {
    'openrouter/anthropic/claude-sonnet-4-6': { inputPer1M: 3.00, outputPer1M: 15.00, cacheReadPer1M: 0.30 },
    'openrouter/openai/gpt-4o-mini':          { inputPer1M: 0.15, outputPer1M: 0.60 },
    // ...
  },
  serp: {
    serpapi: { perCall: 0.015 },
    serper:  { perCall: 0.001 },
    brave:   { perCall: 0.0 },     // free tier, currently
  },
  fileFetch:     { perMBBandwidth: 0.0, perPDFParse: 0.0002 },  // amortized worker CPU
  transcription: { perMinute: 0.006 },                           // Whisper-compat
  scrape:        { perCall: 0.002 },                             // Playwright container amortized
} as const;
```

### Instrumentation Points

One helper module, one import per tool:

```typescript
// workers/src/services/costTracker.ts
export async function recordCost(event: Omit<ICostEvent, '_id' | 'totalCostUSD'>): Promise<void>;
```

Hooks:

| Tool | What to record |
|---|---|
| `utils/llmClient.ts::callLlmOnce` | LLM call — input/output/cached tokens per response. Requires capturing `usage` from OpenRouter response. |
| `searchProviders/router.ts` | SERP call — one event per provider hit, one unit. Skip on cache hit. |
| `tools/fetchFile.ts` + `services/fileCache.ts` | File fetch — one event per miss, bytes + pdf-parse cost. Skip on cache hit. |
| `tools/scrapePage.ts` | Scrape — one event per call. |
| `tools/transcribeUrl.ts` | Transcription — minutes from audio duration. |
| `services/embeddings.ts` | Embedding — tokens when used for Library ingest or read_document. |

### Aggregation

Aggregate on demand for the detail page. Campaigns aggregate per-job rollups.

```typescript
// Backend service
computeJobCost(jobId): Promise<JobCostBreakdown>
computeCampaignCost(campaignId): Promise<CampaignCostBreakdown>
computeWorkspaceCost(workspaceId, range): Promise<WorkspaceCostReport>
```

Mongo aggregation is cheap for <10k events per job. Cache aggregate on `ProspectingJob.costSummary` at job-complete time so the dashboard is O(1).

---

## File Map

### New
- `backend/src/models/CostEvent.ts`
- `backend/src/config/pricing.ts` — pricing table
- `backend/src/services/cost/tracker.ts` — `recordCost()` helper (backend-side for campaign-send costs)
- `backend/src/services/cost/aggregator.ts` — the three `compute*` functions
- `backend/src/controllers/costs.controller.ts` — GET endpoints
- `backend/src/routes/costs.routes.ts`
- `workers/src/services/costTracker.ts` — worker-side `recordCost()` (writes directly to Mongo)
- `shared/src/types/cost.ts` — exported types
- `shared/src/schemas/zod/cost.schemas.ts`
- `frontend/src/components/costs/JobCostCard.tsx`
- `frontend/src/components/costs/WorkspaceCostWidget.tsx`

### Modified
- `workers/src/utils/llmClient.ts` — capture `usage` from provider response, call `recordCost`.
- `workers/src/pipeline/searchProviders/{router,brave,serper,serpapi}.ts` — record per-provider-hit.
- `workers/src/pipeline/tools/{fetchFile,scrapePage,transcribeUrl,writeLead}.ts` — record tool costs.
- `workers/src/services/embeddings.ts` — record embedding costs.
- `backend/src/models/ProspectingJob.ts` — add `costSummary: {totalUSD, byCategory}` denormalized.
- `backend/src/routes/jobs.routes.ts` — expose `GET /jobs/:id/cost`.
- `frontend/src/app/(dashboard)/dashboard/leads/page.tsx` or wherever job detail lives — show the cost card.

---

## API Endpoints

```
GET  /api/v1/workspaces/:w/jobs/:jobId/cost           → JobCostBreakdown
GET  /api/v1/workspaces/:w/campaigns/:id/cost         → CampaignCostBreakdown
GET  /api/v1/workspaces/:w/usage?from=YYYY-MM-DD&to=  → WorkspaceCostReport
GET  /api/v1/workspaces/:w/usage/export?format=csv    → CSV dump of CostEvent rows
```

Response shapes in `shared/src/schemas/zod/cost.schemas.ts` — keep them simple so the frontend can render without interpretation logic.

---

## Implementation Sequence

1. **Schema + pricing table + model** (~2 hours). Ship empty and verify types.
2. **Worker-side LLM instrumentation** (~3 hours). Capture OpenRouter `usage`, handle cache-read pricing correctly. Test by eyeballing a few job runs.
3. **Worker-side SERP + file + scrape + transcribe instrumentation** (~3 hours). Each tool gets one `recordCost` line.
4. **Backend aggregator + endpoints** (~2 hours).
5. **Denormalize `costSummary` on job completion** so the existing detail page gets cost O(1) without refactoring (~1 hour).
6. **Frontend cost card + usage widget** (~4 hours).
7. **CSV export endpoint** (~1 hour — last because it's a read-only leaf).

Total: ~2–3 days for one dev. All four workers can run independently of each other after step 1.

---

## Verification Criteria

- Run a 50-lead job. Total cost displays within $0.05 of manually-computed expected.
- Cache hit vs miss correctly differentiates: two back-to-back identical SERP queries should show exactly one SERP cost event.
- Delete the `CostEvent` rows for a job, call `computeJobCost` — returns zero + logs a warning (prove aggregation isn't cached incorrectly).
- Export a workspace's CSV, open in Excel, `SUM(totalCostUSD)` matches the dashboard total.

---

## Explicitly Out of Scope

- **Usage-based billing** — we're measuring, not charging. Billing needs a contract model + Stripe metered subscriptions, which is Phase 9 territory.
- **Forecasting** — "this job will cost approximately $X before it runs" is a different problem (requires modeling agent behavior, not tracking it). Worth a future phase.
- **Budget-locking** — "cap this workspace at $100/month, refuse jobs after." Requires forecasting + policy infrastructure. Not now.
- **Margin accounting** — we're tracking cost-of-goods (what we pay providers). Gross margin is a finance-team spreadsheet until billing lands.
