# Phase 11 M1 — Saved Workflows (Plan)

_Date: 2026-04-22 · Supersedes the pre-pivot spec in `docs/sellability_road_map/phase-11-research-skills.md` for M1. M2 (publish/install) is deferred._

## Framing (from goal.md + exec plan)

Per the 2026-04-22 pivot, Skills become **Workflows**. A Workflow is:

> **A table template + column definitions + data source bindings + optional agent seed query.**

Running a Workflow = create a new `DataTable` from the template + (optionally) kick off a prospecting job targeted at that table + the user can then run the column enrichments.

The primitive composes entirely on top of what we shipped in 15C/15D — no new runtime. Workflows are **stored configurations**, the runtime is the existing table + job + enrichment engine.

## What users can do after M1

1. From any existing DataTable: click **Save as workflow** → name/describe → workflow is stored under `/library`.
2. `/dashboard/library` lists all workflows.
3. Click a workflow → **Run** form: name the new table, fill any seed-query `{{params}}`, choose whether to dispatch the seed job now. Clicking Run creates the new table, optionally dispatches a prospecting job targeted at it, and redirects to the table detail page.
4. Rename, update description, or delete a workflow.

## Out of scope for M1

- Publishing + installing across workspaces (M2).
- Cross-workflow chaining.
- Scheduled / recurring runs (Phase 6 overlap — defer).
- Running a workflow into an *existing* table (v1 is always "new table").
- Version history on workflow edits.

## Data model

```typescript
// shared/src/types/workflow.ts
interface Workflow {
  _id: string;
  workspaceId: string;
  createdBy: string;

  name: string;
  description?: string;
  tags: string[];

  // The table template — columns definition copied from a source table.
  // `columns` reuses the existing ColumnDef (same shape we persist on
  // DataTable). Enriched columns carry their sourceId + inputMappings +
  // outputPath, so running the workflow produces a ready-to-enrich table.
  tableTemplate: {
    rowType: RowType;
    columns: ColumnDef[];
    defaultTableNameTemplate?: string;  // e.g. "{{count}} {{industry}} in {{country}}"
  };

  // Optional seed: kick off an agent job right after the table is created.
  // Parameters let the user templatize the query with placeholders that
  // get interpolated at run-time. Omit `seed` for workflows that only
  // carry column definitions (user seeds the table manually).
  seed?: {
    rawQueryTemplate: string;
    parameters: Array<{
      key: string;
      label: string;
      type: 'text' | 'number' | 'select';
      defaultValue?: string | number;
      options?: string[];
      required: boolean;
    }>;
  };

  // Where this workflow came from. v1 is always `local`.
  origin: 'local';

  stats: {
    timesRun: number;
    lastRunAt?: string;
  };

  createdAt: string;
  updatedAt: string;
}
```

Indexes: `(workspaceId, updatedAt desc)`.

## API

```
GET    /workspaces/:w/workflows                          List
POST   /workspaces/:w/workflows                          Create directly (body: full Workflow)
POST   /workspaces/:w/workflows/from-table/:tableId      Create by snapshotting a table
GET    /workspaces/:w/workflows/:id                      Detail
PATCH  /workspaces/:w/workflows/:id                      Update name / description / tags / seed
DELETE /workspaces/:w/workflows/:id                      Delete
POST   /workspaces/:w/workflows/:id/run                  Run → returns { tableId, jobId? }
```

**`/from-table/:tableId` body:**
```ts
{
  name: string;
  description?: string;
  tags?: string[];
  includeSeed?: boolean;   // if true AND table.sourceJobId exists, pull the rawQuery as the template
}
```

**`/run` body:**
```ts
{
  tableName: string;
  tableDescription?: string;
  tags?: string[];
  seedParams?: Record<string, string | number>;   // fill `{{placeholders}}`
  dispatchSeedJob: boolean;                        // if false, create the table only
}
```

Response:
```ts
{ tableId: string; jobId?: string }
```

## Backend files to add

- `shared/src/types/workflow.ts`
- `shared/src/schemas/zod/workflow.schemas.ts`
- `shared/src/schemas/zod/index.ts` — export workflow schemas
- `shared/src/types/index.ts` — export workflow types
- `backend/src/models/Workflow.ts`
- `backend/src/services/workflows.ts` — `interpolateTemplate`, `createTableFromWorkflow`, `dispatchSeedJob`
- `backend/src/controllers/workflows.controller.ts`
- `backend/src/routes/workflows.routes.ts`
- `backend/src/app.ts` — mount routes

**Runtime helpers on top of existing code:**

- `services/workflows.ts::createTableFromWorkflow(workflow, overrides) → DataTable` — wraps existing table-create logic from `dataTables.controller.ts::createTable`.
- `services/workflows.ts::dispatchSeedJob(workflow, interpolatedQuery, table) → ProspectingJob` — builds a `ProspectingJob` with `target: { kind: 'table', tableId }` using the same queue enqueue as `/jobs` POST. Skip the clarify step (workflows are already parameterized).
- `interpolateTemplate(template, params)` — `{{count}}` → `params.count`. Reject unknown params. Error if a `required: true` param is missing.

## Frontend files to add

- `frontend/src/app/(dashboard)/dashboard/library/page.tsx` — workflow index
- `frontend/src/app/(dashboard)/dashboard/library/[workflowId]/page.tsx` — detail + run form
- `frontend/src/components/workflows/SaveAsWorkflowDialog.tsx` — on table detail page

**Modifications:**
- `frontend/src/app/(dashboard)/dashboard/tables/[tableId]/page.tsx` — add "Save as workflow" button next to "Run action".
- `frontend/src/components/layout/Sidebar.tsx` — already has `library` nav entry, no change needed.

## UX — happy paths

### Save a workflow

From a table detail page, "Save as workflow" button opens a dialog:
- Name (required), description, tags.
- "Include seed query" checkbox — visible only if the table has a `sourceJobId`. When checked, the workflow captures `table.sourceJob.rawQuery` as the template with no parameters (user can edit later to templatize).

Submit → POST `/workflows/from-table/:tableId` → redirect to `/library/:workflowId`.

### Run a workflow

From `/library/:workflowId`, the run form shows:
- Table name (pre-filled from `defaultTableNameTemplate` if present, or `workflow.name`).
- Parameter inputs (if seed has parameters). All required params gate the Run button.
- "Dispatch seed job now" toggle (default ON if seed exists, disabled otherwise).

Submit → POST `/workflows/:id/run` → redirect to `/dashboard/tables/:tableId`. If a seed job was dispatched, the table banner shows "Seeding from dispatch…" and polls for completion (same pattern as `SeedFromJobDialog`).

### List

`/dashboard/library` — cards grid. Each card: name, description (truncated), rowType badge, column count, "seeded" badge if seed present, last-run-at, stats.

## Incremental sequencing

1. **Shared types + Zod** (~30 min).
2. **Backend model + controller + routes** (~2 h). Minimal: list, create-from-table, get, run. Patch/delete can land as a fast follow.
3. **Run helper** — the interesting bit. Needs `createTableFromWorkflow` + `dispatchSeedJob`. Extract table-create into a reusable service fn so the controller and the workflow-run path share it (avoids drift).
4. **Frontend library index** (~1 h). Query + render cards. Empty state when none.
5. **Save-as-workflow dialog** on table detail page (~45 min).
6. **Workflow detail + run form** (~1.5 h). Most of the logic is form validation + redirect after run.
7. **Polish** — rename, description edit, delete with confirmation — stamp on top after the happy path works.

## Cost + verification

**Verification criteria for M1:**

- Save a table with 5 columns (2 static, 3 enriched) as workflow → workflow persists the column defs verbatim.
- Run the workflow with a name → new table created with identical 5 columns.
- Running with `dispatchSeedJob: true` and no seed on the workflow returns 400.
- Running with `dispatchSeedJob: true` + seed + missing required param returns 400.
- Running with full params dispatches a ProspectingJob whose `rawQuery` equals the interpolated template.
- `workflow.stats.timesRun` increments on successful run; `lastRunAt` updates.
- Edit workflow name → updated in the library index.
- Delete workflow → 404s on subsequent GET; running returns 404.

## M2 path (not this ship)

M2 is the shareable-install flow (mint shareToken, public preview, install endpoint). Everything from the original Phase 11 M2 spec still applies, just retargeted at the Workflow model. 2–3 days when we ship it.
