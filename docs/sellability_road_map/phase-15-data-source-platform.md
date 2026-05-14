# Phase 15 — Data Source Platform (Clay-parity Foundation)

## Goal

Turn LeadreAI's hardcoded tool registry into a **pluggable data-source platform** with per-workspace credentials, invocation logging, typed contracts, and flexible tables. This is the foundation every subsequent "rival Clay" capability depends on.

## Commercial Outcome

- Unlocks **BYOK customers**: anyone already paying Apollo / Hunter / Clearbit / ZoomInfo can plug those keys in and compose them with our agent + evidence graph.
- Positions LeadreAI as Clay's commercial shape (data source registry) rather than a point tool. Pricing can move to per-workspace credits + per-integration add-ons.
- Existing 14 tools become first-class data sources with richer observability (invocation log, per-source cost, per-source error state).
- Foundation for every Clay feature that follows: waterfalls, formulas, scheduled enrichment, conditional columns, custom HTTP sources. None of those are in scope here; all of them depend on this.

Estimated effort across all four sub-phases: **~4–5 dev-weeks**. Largest single phase in the roadmap, but 15A alone is the critical path — subsequent sub-phases are incremental.

---

## The Five Confirmed Design Decisions (2026-04-22)

All locked in. Spec below follows these:

1. **Credential model: BYOK for licensed providers; metered for commoditized ones** (SerpAPI via our existing router stays metered-through-us). Workspace-encrypted credential blobs.
2. **Agent integration: Hybrid** — data sources auto-register as agent tools (the agent gains a dynamic tool menu), but the primary user-facing surface is explicit per-row / per-column enrichment.
3. **Table shape: Introduce `DataTable`** alongside `Lead`. Rows typed (`company` | `person` | `url` | `custom`). Columns user-defined. `Lead` stays as the agent's native output, later re-projected as a table-type.
4. **Waterfalls: deferred to v2.** v1 = one source per column.
5. **Column formulas: deferred to v2, safe subset in v3.** v1 = a column can reference one other column by key as its input.

---

## Architecture Overview

Four layers, landing in four sub-phases:

```
┌───────────────────────────────────────────────────────────────┐
│ Layer 4: Column-referenced enrichment (15D)                    │
│   Column.definition = { sourceId, inputMappings: {...} }       │
│   "For each row, call source X with input from column Y"       │
└───────────────────────────────────────────────────────────────┘
                               ▲
┌───────────────────────────────────────────────────────────────┐
│ Layer 3: Flexible tables (15C)                                 │
│   DataTable  → rows (typed) → cells (per-column, per-row)      │
│   Agent jobs can write-rows OR fill-columns on an existing     │
│   table. Leads become a table type, not a parallel structure.  │
└───────────────────────────────────────────────────────────────┘
                               ▲
┌───────────────────────────────────────────────────────────────┐
│ Layer 2: External integrations (15B)                           │
│   Apollo, Hunter, ZeroBounce as first BYOK sources.            │
│   Credential test endpoints, adapter mappings, rate limits.    │
└───────────────────────────────────────────────────────────────┘
                               ▲
┌───────────────────────────────────────────────────────────────┐
│ Layer 1: Data-source abstraction (15A)                         │
│   DataSource registry, DataSourceCredential (encrypted),       │
│   DataSourceInvocation log. Existing 14 tools re-registered    │
│   in the new shape. No external integrations yet.              │
└───────────────────────────────────────────────────────────────┘
```

Each sub-phase is independently valuable and shippable.

---

## 15A — Data-Source Abstraction Foundation

**Scope**: Introduce the abstraction. Re-register our existing 14 tools into it. Nothing visible to end-users yet. Pure refactor + new models.

**Effort**: ~1 week.

### Data models

```typescript
// ── DataSource — static definition, registered in code ──
interface DataSource {
  id: string;                           // 'search_web', 'verify_email', 'apollo.people_search'
  name: string;                         // "Web Search"
  description: string;
  category: DataSourceCategory;          // see enum
  version: number;                       // bump when output shape changes

  // Authentication
  auth: {
    type: 'none' | 'api_key' | 'oauth2' | 'basic' | 'platform';
    // `platform` = LeadreAI provides the key (metered). Built-ins use this.
    fields?: Array<{ key: string; label: string; secret: boolean; hint?: string }>;
    // Optional live test — used by UI's "test connection" button.
    testFn?: (creds: Record<string, string>) => Promise<{ ok: boolean; message?: string }>;
  };

  // Typed contracts
  input: {
    schema: z.ZodSchema;                  // what the caller must pass
    // UX description of each input field, for the agent's tool menu +
    // manual-enrichment UI.
    describe: Array<{ key: string; label: string; required: boolean; hint?: string }>;
  };
  output: {
    schema: z.ZodSchema;                  // what the provider returns
    // Normalized projection — how to project output onto Lead / Contact / Fact.
    // Used by the default writer; individual handlers can override.
    fieldMappings: Array<FieldMapping>;
  };

  // Pricing
  pricing: {
    model: 'byok' | 'metered' | 'free';
    creditsPerCall?: number;              // for metered — what we charge workspace
    providerCostUSDPerCall?: number;       // for internal cost tracker (Phase 13)
    notes?: string;                       // human-readable "this counts as 2 Apollo credits"
  };

  // Limits (per workspace, per day / minute)
  rateLimit?: {
    perMinute?: number;
    perDay?: number;
  };

  // Handler — the actual implementation. Given validated input + creds + context,
  // returns validated output. Throws on auth / rate / upstream failure.
  handler: (
    input: unknown,
    creds: Record<string, string> | null,
    ctx: DataSourceContext,
  ) => Promise<unknown>;
}

type DataSourceCategory =
  | 'person_enrichment' | 'company_enrichment'
  | 'email_finder' | 'email_verify'
  | 'phone_verify' | 'phone_finder'
  | 'company_search' | 'person_search'
  | 'tech_stack' | 'intent_signal'
  | 'news' | 'funding' | 'hiring'
  | 'custom_http' | 'ai'
  | 'registry' | 'search'                 // built-ins
  | 'file' | 'audio' | 'scrape';          // built-ins

interface FieldMapping {
  /** JSONPath-like selector on the provider's raw response. */
  from: string;                           // 'data.person.primary_email'
  /** Target in our normalized model. */
  to: {
    entity: 'lead' | 'contact' | 'fact';
    path: string;                          // 'emails[0].address' or 'apollo_title'
  };
  /** Small transform DSL; NOT arbitrary code. Allowed ops: upper, lower,
   *  trim, split('char')[n], coerce_number, coerce_date. */
  transform?: string;
}

interface DataSourceContext {
  workspaceId: string;
  jobId?: string;
  leadId?: string;
  tableRowId?: string;
  columnKey?: string;
  triggeredBy: 'agent' | 'manual' | 'waterfall' | 'scheduled';
}
```

```typescript
// ── DataSourceCredential — per-workspace, encrypted ──
interface IDataSourceCredential extends mongoose.Document {
  _id: ObjectId;
  workspaceId: ObjectId;
  dataSourceId: string;
  label?: string;                         // "Apollo — Pro seat"
  // Encrypted with the workspace's master key (reuse pattern from
  // Workspace.emailConfig.apiKey / smtpPass).
  encryptedBlob: string;
  verifiedAt?: Date;                      // last successful testFn
  lastUsedAt?: Date;
  lastErrorAt?: Date;
  lastErrorMessage?: string;
  isDefault: boolean;                     // when multiple creds exist for one source
  createdAt: Date;
  updatedAt: Date;
}
```

```typescript
// ── DataSourceInvocation — one row per call ──
interface IDataSourceInvocation extends mongoose.Document {
  _id: ObjectId;
  workspaceId: ObjectId;
  dataSourceId: string;
  credentialId?: ObjectId;                // null for platform/free sources
  triggeredBy: 'agent' | 'manual' | 'waterfall' | 'scheduled';
  parentJobId?: ObjectId;
  parentLeadId?: ObjectId;
  parentTableRowId?: ObjectId;
  parentColumnKey?: string;
  input: Record<string, unknown>;          // snapshot (capped ~16KB)
  output?: Record<string, unknown>;        // snapshot (capped ~64KB) — null on failure
  status: 'pending' | 'success' | 'failed' | 'rate_limited' | 'auth_failed';
  errorMessage?: string;
  latencyMs?: number;
  costUSD?: number;                        // also mirrored into CostEvent
  occurredAt: Date;
}
```

### Indexes
- `DataSourceCredential`: `(workspaceId, dataSourceId, isDefault)` compound; unique per-workspace-per-source-label.
- `DataSourceInvocation`: `(workspaceId, occurredAt desc)`, `(parentJobId)`, `(dataSourceId, occurredAt desc)`. TTL 180 days on `occurredAt`.

### Extensions to existing models

- **`CostEvent`** (Phase 13 model): gain `dataSourceId?` and `invocationId?` fields. Cost writes still flow through Phase 13's tracker; adding these fields means per-source spend rolls up cleanly without a second aggregator.
- **`Lead.sources[]`** and **`Contact.sources[]`**: gain optional `dataSourceId` and `invocationId` so each provenance entry traces back to the invocation that produced it.

### Registry location

```
backend/src/services/data-sources/
  ├── registry.ts              // DATA_SOURCE_REGISTRY export, lookup, category index
  ├── executor.ts              // runDataSource(id, input, ctx) — auth resolution, rate limit, invocation log write, cost record
  ├── credentials.ts           // encrypt / decrypt / test
  ├── sources/
  │   ├── builtins/
  │   │   ├── search-web.ts    // wraps existing pipeline/searchProviders/router.ts
  │   │   ├── fetch-url.ts
  │   │   ├── fetch-file.ts
  │   │   ├── scrape-page.ts
  │   │   ├── transcribe-url.ts
  │   │   ├── verify-email.ts
  │   │   ├── permute-email.ts
  │   │   ├── list-companies.ts
  │   │   ├── lookup-registry.ts
  │   │   ├── extract-names-from-urls.ts
  │   │   ├── read-document.ts
  │   │   ├── score-lead.ts
  │   │   ├── write-lead.ts
  │   │   └── search-workspace-leads.ts  // new tool from Phase 11 M0
  │   └── external/              // populated in 15B
  │       └── (empty in 15A)
```

The **executor** is the only way to call a data source from application code. Direct tool-handler calls go away. This gives us:
- Auth resolution (pick default cred, decrypt, inject)
- Rate-limit enforcement (Redis counter per workspace + source)
- Invocation log write (pending → success/failed)
- Cost record write (Phase 13 integration)
- Structured error classification (auth vs rate vs upstream vs input-validation)

### Agent integration (hybrid, confirmed decision #2)

The agent's tool registry becomes a **view** over the data source registry. `renderToolMenu()` builds the menu from `DATA_SOURCE_REGISTRY` filtered by the workspace's enabled sources:

```typescript
// workers/src/pipeline/jobAgent.ts
const registry = await buildToolRegistryForWorkspace(workspaceId);
// registry = DATA_SOURCE_REGISTRY with only sources the workspace has
// enabled + (for BYOK sources) has valid credentials for
```

This means:
- The agent's prompt becomes per-workspace (different workspaces see different tools).
- Enabling Apollo in a workspace automatically gives the agent access to it.
- Disabling a built-in for a workspace is possible (e.g. "this customer has banned scrape").

### API endpoints (15A)

```
GET    /workspaces/:w/data-sources                    # list available + enabled
PATCH  /workspaces/:w/data-sources/:id                # enable / disable for workspace
POST   /workspaces/:w/data-sources/:id/test           # test connection with creds
GET    /workspaces/:w/data-sources/:id/credentials    # list credentials for this source
POST   /workspaces/:w/data-sources/:id/credentials    # add a new credential
PATCH  /workspaces/:w/data-sources/:id/credentials/:cid
DELETE /workspaces/:w/data-sources/:id/credentials/:cid
GET    /workspaces/:w/invocations                      # log, paginated + filterable
GET    /workspaces/:w/invocations/:id                  # single invocation detail
```

### Verification (15A)

- Every one of the 14 existing tools is registered in the new registry. Old code paths call through the executor. Behavior identical at the agent's view.
- A contrived prospecting job writes `DataSourceInvocation` rows for every tool call (~20–80 rows per job).
- Every invocation has a matching `CostEvent` row (join by `invocationId`).
- Rate limit test: configure `perMinute: 2` on a built-in, call 5× rapidly — third call returns `rate_limited` status, fourth + fifth are blocked.
- No end-user UI changes — this sub-phase is transparent to customers.

---

## 15B — First Three BYOK Integrations

**Scope**: Apollo (people + company), Hunter (email finder), ZeroBounce (email verify). Proves the abstraction with real providers.

**Effort**: ~1 week.

### Why these three

- **Apollo** — the most-requested integration. Has both people and company endpoints, covers licensed/BYOK pattern clearly.
- **Hunter** — straightforward REST, simple auth, cheap to call. Good for iterating on the adapter + mapping patterns.
- **ZeroBounce** — email verify replaces our MX+SMTP probe when the workspace has credit for it. Demonstrates "complements existing built-in."

### Per-integration files

```
backend/src/services/data-sources/sources/external/
  ├── apollo-people-search.ts       # POST /api/v1/mixed_people/search
  ├── apollo-people-enrichment.ts   # POST /api/v1/people/match
  ├── apollo-company-enrichment.ts  # POST /api/v1/organizations/enrich
  ├── hunter-email-finder.ts        # GET /v2/email-finder
  ├── hunter-domain-search.ts       # GET /v2/domain-search
  └── zerobounce-verify.ts          # GET /v2/validate
```

Each file exports a single `DataSource` object. No shared base class — composition over inheritance; each provider's quirks are fully encapsulated.

### Credential handling

Encryption reuses `backend/src/utils/encrypt.ts` pattern (`aes-256-gcm`, scrypted key from `JWT_SECRET + salt`). One salt per data-source type so credential encryption keys don't cross providers.

Test endpoint:
- Apollo: `POST /api/v1/auth/health` (if exists) or a zero-cost `/organizations/enrich` with a known-valid domain.
- Hunter: `GET /v2/account` (free, unmetered — verifies key without consuming credit).
- ZeroBounce: `GET /v2/getcredits` (free account status check).

If the test endpoint succeeds, `verifiedAt` updates on the credential.

### Rate limits

- Apollo: `perMinute: 120`, `perDay: 10000` by default. Override per workspace.
- Hunter: `perMinute: 30`, `perDay: 1000`.
- ZeroBounce: none enforced (they bill per-call, no explicit rate limit below plan cap).

Enforced by the executor via Redis counter. Hitting a limit writes an invocation with `status: 'rate_limited'`, returns structured error to caller, does NOT consume a credit.

### Output adapters

Each source's `fieldMappings[]` maps provider response → normalized shape:

```typescript
// Apollo people_match example
fieldMappings: [
  { from: 'person.first_name', to: { entity: 'contact', path: 'firstName' } },
  { from: 'person.last_name',  to: { entity: 'contact', path: 'lastName' } },
  { from: 'person.title',      to: { entity: 'contact', path: 'title' } },
  { from: 'person.linkedin_url',to:{ entity: 'contact', path: 'linkedinUrl' } },
  { from: 'person.email',      to: { entity: 'contact', path: 'emails[0].address' } },
  { from: 'person.seniority',  to: { entity: 'fact',    path: 'seniority' } },
  // ...
]
```

Applied by a `normalize(rawOutput, mappings): NormalizedPayload` utility. Transform DSL stays narrow — `upper`, `lower`, `trim`, `split('@')[1]`, `coerce_number`, `coerce_date` and nothing else.

### Verification (15B)

- Workspace can add Apollo API key → test passes → invocation succeeds with real data.
- Cost event per invocation reflects Apollo's per-credit pricing (even if BYOK — we track usage for the workspace's internal budgeting).
- Agent can choose Apollo over `search_web` when the workspace has both enabled.
- Hunter email-finder fills a `Lead.emails[]` entry with `source: 'hunter', dataSourceId: 'hunter.email_finder'`.

---

## 15C — DataTable Primitive

**Scope**: Flexible tables alongside Leads. Rows typed (`company` | `person` | `url` | `custom`). Columns user-defined. Agent runs can write rows OR fill columns on an existing table.

**Effort**: ~1.5 weeks.

### Data models

```typescript
interface IDataTable extends mongoose.Document {
  _id: ObjectId;
  workspaceId: ObjectId;
  createdBy: ObjectId;
  name: string;
  description?: string;
  rowType: 'company' | 'person' | 'url' | 'custom';
  columns: Array<ColumnDef>;
  sourceJobId?: ObjectId;              // job that seeded this table
  tags: string[];
  rowCount: number;                    // denormalized for listing perf
  createdAt: Date;
  updatedAt: Date;
}

interface ColumnDef {
  key: string;                         // stable identifier, snake_case
  label: string;                       // human-readable header
  type: 'text' | 'number' | 'currency' | 'date' | 'url' | 'email' | 'phone' | 'tags' | 'boolean' | 'ref';
  // In v1, definition is always `{type: 'static'}` (user types a value) or
  // `{type: 'enriched'}` (placeholder for 15D source-powered enrichment).
  definition?: ColumnDefinition;
  width?: number;                      // UI hint (stored, not enforced)
  pinned?: boolean;                    // UI hint
}

type ColumnDefinition =
  | { type: 'static' }
  | { type: 'enriched'; sourceId?: string; /* 15D fills the rest */ };

interface IDataTableRow extends mongoose.Document {
  _id: ObjectId;
  tableId: ObjectId;
  workspaceId: ObjectId;
  /** Primary identifier for this row's type — companyDomain for
   *  company rows, email or linkedinUrl for person rows, url for url
   *  rows, arbitrary for custom. Unique per table. */
  primaryKey: string;
  cells: Map<string, Cell>;            // keyed by ColumnDef.key
  /** Link back to a Lead / Contact when the row is agent-produced. */
  leadId?: ObjectId;
  contactId?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

interface Cell {
  value: unknown;                       // type must match ColumnDef.type
  sources?: Array<{
    dataSourceId?: string;
    invocationId?: ObjectId;
    sourceUrl?: string;
    confidence?: number;
    scrapedAt?: Date;
  }>;
  filledAt?: Date;
  filledBy?: 'agent' | 'manual' | 'data_source' | 'system';
}
```

Indexes: `(workspaceId, updatedAt desc)` on tables, `(tableId, primaryKey)` unique on rows, `(tableId, updatedAt desc)` on rows.

### Agent integration

A new flag on ProspectingJob:

```typescript
ProspectingJob.target?: { type: 'table'; tableId: ObjectId; mode: 'write_rows' | 'fill_columns' }
```

- `write_rows` — agent appends new rows to the table (new `list_companies` + enrichment writes rows instead of Lead documents, or in addition to them).
- `fill_columns` — agent iterates over existing rows and fills empty cells.

`write_lead` tool gains awareness: when the job targets a table, it writes both a `Lead` (agent's native) and the matching `DataTableRow`. Keeps backward compatibility.

### API endpoints (15C)

```
GET    /workspaces/:w/tables                         # list
POST   /workspaces/:w/tables                         # create
GET    /workspaces/:w/tables/:id
PATCH  /workspaces/:w/tables/:id                     # name, columns, etc.
DELETE /workspaces/:w/tables/:id

POST   /workspaces/:w/tables/:id/columns             # add column
PATCH  /workspaces/:w/tables/:id/columns/:key
DELETE /workspaces/:w/tables/:id/columns/:key

GET    /workspaces/:w/tables/:id/rows                # paginated
POST   /workspaces/:w/tables/:id/rows                # manual row add (single or bulk)
PATCH  /workspaces/:w/tables/:id/rows/:rowId         # edit cells
DELETE /workspaces/:w/tables/:id/rows/:rowId

POST   /workspaces/:w/tables/:id/from-job/:jobId     # seed from completed agent job
```

### Verification (15C)

- Create a table with columns `[company_name, domain, country]`. Manually add 5 rows. List returns them.
- Run an agent job targeting the table with `mode: 'write_rows'`. Rows are appended; existing rows not touched.
- Cell provenance surfaces correctly when a row was filled by `write_lead` vs manual entry.

---

## 15D — Column-referenced Enrichment

**Scope**: Per-column "enrich this row using source X with input from column Y." No waterfalls. No formulas beyond single-column reference.

**Effort**: ~1 week.

### Column definition shape

```typescript
type ColumnDefinition =
  | { type: 'static' }
  | { type: 'enriched';
      sourceId: string;
      credentialId?: string;           // defaults to workspace's default for this source
      inputMappings: Record<string, ColumnRef>;   // source field key → where to pull input from
      outputPath: string;              // which field of source output lands in this cell
    };

type ColumnRef =
  | { kind: 'column'; key: string }      // pull from another column of the same row
  | { kind: 'literal'; value: string }    // hardcoded input
  | { kind: 'row_type_id' };             // the row's primaryKey (companyDomain / email / etc.)
```

Example: an `apollo_title` column:

```json
{
  "key": "apollo_title",
  "label": "Title (Apollo)",
  "type": "text",
  "definition": {
    "type": "enriched",
    "sourceId": "apollo.people_search",
    "inputMappings": {
      "first_name": { "kind": "column", "key": "first_name" },
      "last_name":  { "kind": "column", "key": "last_name" },
      "domain":     { "kind": "column", "key": "company_domain" }
    },
    "outputPath": "person.title"
  }
}
```

### Enrichment execution

```
POST /workspaces/:w/tables/:id/columns/:key/enrich
  body: { rowIds?: string[]; filter?: RowFilter; dryRun?: boolean }
  response: {
    enrichmentJobId: string;
    estimatedCallCount: number;
    estimatedCostUSD: number;
    estimatedCreditsPerCall: number;
  }
```

Runs via a new `table-enrichment` BullMQ queue. Per-row processing:

1. Load row.
2. Resolve `inputMappings` — look up referenced columns' current values.
3. Call the data source via the executor.
4. Apply `outputPath` to extract the target value.
5. Write cell value + source record.
6. Emit SSE `enrichment_progress` event.

**Dry run**: returns estimate without executing. Shows "this will cost 47 Apollo credits across 47 rows."

### Verification (15D)

- Add an enriched column. Enrich 10 rows. Invocation log shows 10 rows.
- Dry run before a 1000-row enrichment returns an accurate estimate.
- When a source rate-limits mid-run, the job pauses, invocations with `status: 'rate_limited'` land, job resumes after retry window.
- Re-enriching a column with new creds writes NEW source entries (provenance history is additive, not destructive).

---

## Out of Scope (Deferred Explicitly)

- **Waterfalls** (source A → source B → source C fallback per column) — v2. Requires invocation log + column abstraction to be mature first.
- **Formulas / expression language** — v2 (safe subset) / v3 (fuller). Clay's formula language is its own phase.
- **Scheduled / periodic enrichment** — "re-enrich this column every Monday." Depends on Phase 6 (saved searches / triggers); fold in when that lands.
- **Clay-style "find companies" AI columns** — our agent already does this job for whole jobs; table-level AI columns are a composable re-packaging of the same primitives, deferred until 15D settles.
- **Custom HTTP sources** — letting users write their own HTTP-based source. Huge product surface (auth modes, response parsing UI). Defer to v3.
- **Source marketplace** (publish a source config for other workspaces to install) — depends on 15B hardening and Phase 11 M2 (Skills sharing primitives).
- **UI** — per user's explicit request, all UI discussion and work is deferred. API-first; UI follows.

---

## Risks

1. **Credential security blast radius**. A decryption bug leaks customer API keys for paid services. Mitigate: reuse battle-tested encrypt util, envelope-encrypt each credential separately, never log decrypted credentials, rotate encryption key annually.
2. **Provider API drift**. Apollo / Hunter / ZeroBounce change response shapes without warning. Mitigate: version the `DataSource` registry entry, keep integration tests that hit real APIs with tiny payloads, pin provider API versions in the request path.
3. **Cost explosion from agent mis-selection**. The agent choosing Apollo over `search_web` when Apollo isn't meaningfully better wastes the customer's paid credits. Mitigate: the `pricing.notes` field lets us hint the agent ("Apollo costs 2 credits per call — prefer for person-enrichment only, not for discovery"), wire into the agent's system prompt.
4. **Table model proliferation**. Users create dozens of half-filled tables. Mitigate: archive idle tables automatically after 90 days, show "unused" badges in the list.
5. **Backward compatibility on Leads**. The agent today writes Leads. After 15C the agent can also write table rows. Keep both paths; don't break the existing Lead-first workflows customers depend on.

---

## Connection to Other Phases

- **Phase 13 (Cost Explainer)** — load-bearing for 15A. Every `DataSourceInvocation` emits a `CostEvent`. Phase 13 Stage 2 (instrumentation) should wire through the executor path, not the old hardcoded tools directly — saves rework.
- **Phase 11 (Skills)** — becomes "Saved Workflows" after 15C lands. A Skill = a table template + column definitions + their data sources + optional agent seeding instructions. Much more powerful than the current "Skill = parsedIntent template."
- **Phase 12 (Evidence Exports)** — provenance becomes richer with `invocationId` links. Exports gain a "which data source filled this cell" dimension.
- **Phase 14 (Parallel fan-out)** — per-source rate limits give us a natural parallelism boundary. The dispatcher+subagent refactor should be aware of data sources.

---

## Decision Log

- **2026-04-22**: Five design decisions locked (BYOK + metered hybrid; hybrid agent integration; `DataTable` introduced; waterfalls v2; formulas v2/v3). Phase 15 spec written. Implementation proceeds with 15A.
- **_(pending)_**: Confirm sub-phase ordering and priority against the existing Phase 13 Stage 2 work.
