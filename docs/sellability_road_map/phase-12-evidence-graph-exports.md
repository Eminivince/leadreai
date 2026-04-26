# Phase 12 — Evidence Graph Exports

## Goal

Export formats that preserve the agent's per-fact provenance. Every data cell in a lead table should be traceable to a source URL, a scrape timestamp, and (optionally) a snapshot of the page it came from — through the export pipeline, not just in the UI.

## Commercial Outcome

- **Regulated-industry wedge**: legal DD, financial services compliance, policy / government affairs, procurement research. These buyers won't adopt Clay because exports lose provenance. They'll adopt us if we keep it.
- Gives auditable B2B research a real competitive moat. Apollo can't do this (they don't have source URLs). Clay can't do this (their exports are cell values, not evidence chains).
- Underpins the "citation-grade research" positioning in the v2 roadmap.
- Estimated effort: **5–7 days**.

## What Users Can Do After This Phase

1. Export a lead table to `.xlsx` where every data cell carries a **cell comment** linking to its source URL + confidence + scrape date.
2. Export to `.pdf` — a printed audit report with one page per lead, inline citations, sources listed as a bibliography.
3. Export a **proof bundle** (`.zip`) containing the CSV/XLSX + one HTML or PDF snapshot per cited source URL at research time.
4. Via API: retrieve `/leads/:id/evidence` — a normalized JSON of every fact on a lead with sources.

---

## Architecture Overview

### The evidence is already there

Nothing to collect — the data model already carries provenance:

- `Lead.sources[]` — every URL touched during research, typed + dated + confidence-scored.
- `Lead.rawSnippets[]` — verbatim text extracted.
- `Lead.facts[]` — each custom column fact has `{value, unit?, sourceUrl, confidence, raw?}`.
- `Lead.emails[].source` + `confidence`.
- `Lead.phones[].source`.
- `Contact.sources[]` — same pattern for named decision-makers.

Phase 12 is **pure export engineering** — render the existing graph into formats that preserve it.

### Export modes

```typescript
type ExportMode =
  | 'csv'                 // flat CSV. Existing. No provenance. Still supported.
  | 'xlsx_plain'          // flat XLSX, no provenance. Existing.
  | 'xlsx_provenance'     // NEW — cells carry comments with source URLs
  | 'pdf_audit'           // NEW — printed report, one lead per page, inline citations
  | 'proof_bundle';       // NEW — ZIP with xlsx + HTML snapshots of every cited URL
```

All three new modes consume the same `LeadEvidenceGraph` intermediate representation so we only compute provenance once per export.

### `LeadEvidenceGraph` IR

```typescript
interface LeadEvidenceGraph {
  lead: Lead;
  cells: Array<{
    columnKey: string;           // 'companyName', 'emails.0.address', 'facts.amount_raised', ...
    value: unknown;
    sources: Array<{
      url: string;
      scrapedAt?: Date;
      confidence?: number;
      snippet?: string;            // for narrative citations in PDF
    }>;
  }>;
}
```

Build once per lead, per export. Source-dedup at this level (one URL, aggregated evidence) before it reaches any renderer.

### xlsx_provenance renderer

Uses the existing `exceljs` dependency. For each cell:

1. Write the cell value as normal.
2. If the cell's `sources[]` is non-empty, attach an `exceljs` **cell comment** containing:
   - The top-3 source URLs
   - Confidence of each
   - Scraped-at date

Hidden sheet `_sources` contains the full source rows keyed by `LeadId.columnKey` so a power user can filter/pivot on provenance directly.

### pdf_audit renderer

Uses Puppeteer in headless mode to render an HTML template → PDF. One page per lead. Template:

```
┌─────────────────────────────────────────────┐
│ Company Name            [rankScore: 92/100] │
│ ─────────────────────────────────────────── │
│ Industry: Fintech [1]                       │
│ Geography: Lagos, Nigeria [1][2]            │
│ Founded: 2015 [3]                           │
│ Email: hello@company.com [4] (verified)     │
│ Phone: +234... [1]                          │
│                                             │
│ ─── Facts ───                                │
│ Amount raised: $12M [3][5]                   │
│ Latest round:   Series B [3]                 │
│                                             │
│ ─── Sources ───                              │
│ [1] https://company.com (scraped 2026-04-18) │
│ [2] https://techcrunch.com/... (2026-04-18)  │
│ ...                                         │
└─────────────────────────────────────────────┘
```

The `[n]` citation markers inline, full source list at the bottom.

### proof_bundle

A ZIP file assembled in-memory:

```
my-export.zip
├── leads.xlsx               (xlsx_provenance export)
├── leads.pdf                (pdf_audit export)
└── sources/
    ├── {sha256-of-url-1}.html     (raw HTML at scrape time, if we have it)
    ├── {sha256-of-url-2}.pdf      (PDF files we fetched)
    └── _manifest.json       (map of hash → original URL → scraped_at)
```

Source snapshots: populate from the existing `fileCache` (for PDFs / files we fetched) and from a new `page_snapshots` collection for pages we scraped. **Retention honesty**: we don't have historical snapshots for pages scraped pre-Phase 12, so the manifest marks those sources as `{snapshot: null, reason: "not captured at scrape time"}`.

---

## Data Model Additions

```typescript
// Optional — needed only if we want snapshots for scrape_page
interface IPageSnapshot {
  _id: ObjectId;
  workspaceId: ObjectId;
  url: string;
  sha256: string;
  scrapedAt: Date;
  contentType: 'text/html' | 'application/pdf' | 'image/png';
  sizeBytes: number;
  storageRef: string;         // S3 / Cloudinary / local path
  jobId?: ObjectId;
}
```

Snapshot size concern: a worker-heavy day could generate gigabytes. Retention policy: 90-day TTL (configurable) for snapshots; the citation itself (URL + timestamp) is permanent on the lead.

**For v1**, snapshots are opt-in per workspace (`settings.captureSourceSnapshots: true`). Off by default. Regulated-industry buyers flip it on; casual users skip the storage cost.

---

## API Endpoints

```
POST /workspaces/:w/export/leads
  body: {
    leadIds?: string[];                  // specific leads
    filters?: LeadFilter;                // or bulk filter
    jobId?: string;                       // or whole job
    mode: 'csv' | 'xlsx_plain' | 'xlsx_provenance' | 'pdf_audit' | 'proof_bundle';
  }
  response: { downloadUrl, expiresAt }    // signed URL, 24h TTL

GET  /workspaces/:w/leads/:id/evidence     → LeadEvidenceGraph JSON
GET  /workspaces/:w/contacts/:id/evidence  → contact evidence JSON
```

The signed-URL pattern already exists for plain exports (`services/export/`). Extend it to handle the three new modes.

Long-running exports (pdf_audit, proof_bundle) go async:

```
POST /workspaces/:w/export/leads  (mode: pdf_audit)
  response 202: { exportJobId }
GET  /workspaces/:w/export/jobs/:exportJobId
  response: { status: 'queued'|'processing'|'done'|'failed', downloadUrl?, errorMessage? }
```

Puppeteer rendering of 100+ leads takes minutes, not seconds. Async via BullMQ `export` queue.

---

## File Map

### New
- `backend/src/services/export/evidenceGraph.ts` — build the IR
- `backend/src/services/export/xlsxProvenanceExporter.ts`
- `backend/src/services/export/pdfAuditExporter.ts` — Puppeteer wrapper + HTML template
- `backend/src/services/export/proofBundleExporter.ts`
- `backend/src/services/export/exportTemplates/leadAudit.html` — Puppeteer template
- `backend/src/models/PageSnapshot.ts` (optional, v2)
- `backend/src/controllers/exports.controller.ts` (extend if exists)
- `workers/src/export.worker.ts` — BullMQ worker for async exports
- `frontend/src/components/leads/ExportMenu.tsx` — the menu gains 3 new items

### Modified
- `backend/src/services/queue/queues.ts` — register `export` queue
- `workers/src/index.ts` — register export worker
- `backend/src/models/Lead.ts` — no change (the evidence is already there)
- Frontend export menu + ExportDialog

### Dependency additions
- `puppeteer` (or `playwright` already installed — probably reuse)
- `archiver` for ZIP assembly
- `exceljs` (already installed for `xlsx_plain`)

---

## Implementation Sequence

1. **Evidence IR builder** (~1 day). Walk Lead → LeadEvidenceGraph. Unit tests cover provenance dedup + missing-source edge cases.
2. **xlsx_provenance renderer** (~1 day). Straight `exceljs` cell-comment loop.
3. **pdf_audit template + Puppeteer renderer** (~2 days). HTML template, Puppeteer PDF, async queue.
4. **proof_bundle assembly** (~1 day). Archiver + existing fileCache integration.
5. **Snapshot-capture hook** (~1 day, optional v1). Add a `savePageSnapshot` call in `scrapePage.ts` + `fetchUrl.ts` gated by workspace setting.
6. **Frontend export menu + status polling for async exports** (~1 day).

Total: **5–7 days**.

---

## Verification Criteria

- Export a 50-lead result to `xlsx_provenance`. Open in Excel. Hover over a randomly-selected non-trivial cell. See a comment with the source URL + confidence.
- Open the `_sources` hidden sheet. Count rows = count of non-empty source-bearing cells in the visible sheet.
- Export the same result to `pdf_audit`. Each lead gets its own page. Every inline `[n]` has a matching entry in the per-lead Sources section.
- Export `proof_bundle`. Unzip. For every URL listed in the xlsx `_sources` sheet where `workspace.settings.captureSourceSnapshots = true`, a corresponding file exists in `sources/`.
- Response time for `xlsx_provenance` on 500 leads < 10s. PDF async completes < 2 min for 50 leads.

---

## Explicitly Out of Scope

- **Retroactive snapshots** — we can't snapshot pages that were scraped before Phase 12. The manifest is honest about this.
- **Versioned evidence** — "this lead's email was X on March 1, Y on April 1." The model doesn't track version history yet; add in a future phase if needed.
- **Custom PDF templates** — one template for v1. Whitelabel / per-customer templates is an Enterprise-tier feature later.
- **Evidence signing** — cryptographic signatures on exports for true legal admissibility. Worth a future phase; not v1.
- **Video/audio evidence** — transcripts from `transcribe_url` are already citable. The audio file itself as an attachment is a future nice-to-have.
- **Interactive evidence UI** — the in-app evidence panel (already exists per Phase 4) stays separate. Phase 12 is about *exports*.

## Connection to Other Phases

- **Phase 4 (Evidence Cards)** provides the in-app UI for the same data. Phase 12 layers exports on top of the same primitives. Don't rebuild the IR in both — consume the same evidence-graph builder.
- **Phase 13 (Cost Explainer)** — snapshot storage has a cost footprint that should show up as a `file_fetch` category in cost events.
- **Phase 11 (Skills)** — "Skills that produce evidence-preserving outputs" is a natural Skill-marketplace category for regulated buyers.
