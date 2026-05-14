# Execution Plan — 2026-04-22 (revised)

_Supersedes: the earlier "phases 11–14 execution plan" (renamed to this file)._
_Source of truth: `docs/goal.md`._

The Clay-parity pivot (goal.md Decisions Log 2026-04-22) reshuffles the work. **Phase 15 (Data Source Platform) becomes the spine** every subsequent phase hangs off. Phases 11–14 remain valid but several of them get re-scoped or absorbed.

---

## TL;DR

**Proposed execution order:**

```
1. Phase 13 (Cost Explainer) — finish Stage 2 (instrumentation)
2. Phase 15A (Data Source abstraction + invocation log + credentials)  ← new headline
3. Phase 15B (Apollo + Hunter + ZeroBounce BYOK)
4. Phase 11 M0 (search_workspace_leads tool) — now a DataSource in the new registry
5. Phase 15C (DataTable primitive)
6. Phase 11 M1-M2 (Skills — re-scoped to "Saved Workflows" = table template + column defs)
7. Phase 12 (Evidence Exports — gets richer with invocationId provenance)
8. Phase 15D (column-referenced enrichment)
9. Phase 14 (parallel fan-out)
10. M4.5 (inbound-reply correlation — independent)
```

**Rough effort**: Phase 13 remaining ~2 days · Phase 15A ~1 week · Phase 15B ~1 week · Phase 11 M0 ~1–2 days · Phase 15C ~1.5 weeks · Phase 11 M1–M2 (rescoped) ~1 week · Phase 12 ~1 week · Phase 15D ~1 week · Phase 14 ~1 week · M4.5 ~2–3 days. **Total: ~8–10 dev-weeks** for full Clay-parity foundation.

---

## Why This Order

**Phase 13 (Cost Explainer) stays first** because Phase 15's invocation log emits `CostEvent` rows through the tracker Phase 13 builds. Finishing Phase 13 Stage 2 now means Phase 15A's telemetry path is a no-op to implement.

**Phase 15A before everything else Clay-parity-related** because it's the refactor. Our existing 14 tools get re-registered in the new shape. Nothing visible to end-users yet, but every subsequent sub-phase (15B / 15C / 15D) becomes a small incremental add.

**Phase 15B (external integrations) before 15C (tables)** because proving the abstraction with one real external provider validates the design. We'd rather find out Apollo's pricing model breaks our adapter contract before we've built the table layer on top.

**Phase 11 M0 (`search_workspace_leads`) slotted between 15B and 15C** because it's now a DataSource in the new registry, a natural demo of a workspace-local source — and because it directly cuts SERP cost on repeat-topic jobs, which helps justify the 15A/15B investment empirically.

**Phase 15C (DataTable) before Phase 11 M1-M2 (Skills)** because Skills re-scopes into "Saved Workflows = table template + column definitions + sources." Without tables, Skills are stuck at the old rawQuery-template shape — less differentiated.

**Phase 12 (Evidence Exports) after 15C** because every exported cell now has `invocationId` — provenance exports get meaningfully richer with the data-source layer in place.

**Phase 15D (column enrichment) after Phase 12** because 15D is where the data-source platform becomes end-user-facing (via the UI, though UI is deferred per user directive). Landing provenance exports first means when 15D ships and users start doing heavy enrichment, the audit trail is already export-ready.

**Phase 14 (fan-out) last** of the 11–15 set because per-source rate limits from Phase 15A/B give us natural parallelism boundaries. Doing fan-out before sources are pluggable means we redo the dispatcher when sources land.

**M4.5 (inbound-reply correlation)** is independent — can be slotted anywhere. Best interleaved into a gap between Phase 15A and 15B (the 1-week gap) if we want it early.

---

## Dependency Graph

```
                Phase 13 (Cost Explainer)
                        │
                        ▼
             Phase 15A (Abstraction)
                        │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  Phase 15B        Phase 11 M0    Phase 15C
  (External        (workspace-    (DataTable)
   BYOK)            leads source)       │
        │              │              │
        └──────────────┤              │
                        ▼              ▼
                 Phase 11 M1-M2    Phase 12
                 (Saved Workflows)  (Evidence)
                        │              │
                        └──────────────┤
                                        ▼
                                Phase 15D
                                (Column enrichment)
                                        │
                                        ▼
                                Phase 14 (Fan-out)
```

- **Phase 13** has no prereqs.
- **Phase 15A** has Phase 13 as a soft prereq (telemetry path), a hard prereq on nothing.
- **Phase 15B, Phase 11 M0, Phase 15C** all gate on 15A.
- **Phase 11 M1-M2 rescoped** gates on 15C (tables).
- **Phase 12** gates on 15A (invocationId) but not 15C.
- **Phase 15D** gates on 15C.
- **Phase 14** is eased by 15A's rate-limit boundaries.

---

## How Earlier Phases Re-Scope

### Phase 11 — Research Skills → Saved Workflows

Before pivot: "Skills = `{rawQueryTemplate + parameters + outputSchema + systemPromptOverride}`". Simple reusable query template.

After pivot: a Saved Workflow is **a table template + its column definitions + their data source bindings + optional agent-seeding brief**. Running a Workflow = create a table from the template + (if specified) kick off an agent job to seed initial rows + apply column definitions for enrichment.

Much more powerful, and exactly matches what Clay calls "Templates" / "Recipes." The old Phase 11 M1-M2 spec is obsolete — rewrite against the table model once 15C lands.

**Phase 11 M0 (`search_workspace_leads`) stays** — it becomes a `DataSource` in the 15A registry instead of a hardcoded tool.

### Phase 12 — Evidence Graph Exports

Before pivot: export the provenance on `Lead.sources[]` + `Lead.facts[].sourceUrl`.

After pivot: same, PLUS every source entry now carries `invocationId` linking to a `DataSourceInvocation` with full input/output snapshots. Exports get a new tab: "Invocation log" — for regulated buyers, this is gold.

Scope grows slightly; mostly additive.

### Phase 14 — Parallel Fan-out

Architecture unchanged. The dispatcher + subagent pattern still applies. What changes: subagents now make data-source calls through the executor (which handles per-source rate limits), so concurrency is naturally bounded. We get per-source throttling for free instead of building it twice.

---

## What Gets Deleted / Retired

Per user's "single source of truth" principle (goal.md), these docs are now contradicted or superseded and should be deleted or rewritten:

- **`docs/2026-04-18-b2b-sellability-roadmap.md`** (v1 roadmap) — already superseded by 2026-04-21 v2 and now by goal.md + this execution plan. **Action: delete.**
- **`docs/2026-04-21-b2b-sellability-roadmap.md`** (v2 roadmap) — its positioning and horizon are still largely valid, but the four-phase proposal (11–14 without 15) is outdated. **Action: archive or rewrite against goal.md. Not urgent.**
- **`docs/sellability_road_map/phase-1-contact-intelligence-crm-sync.md`** — Phase 1 is split in goal.md and half-reverted (HubSpot). Partial content applies. **Action: rewrite as two smaller phases OR absorb into a future Phase 16 (CRM sync framework) once goal.md finalizes HubSpot re-ship commitment.**
- **`docs/sellability_road_map/phase-7-data-import-enrichment-studio.md`** — largely replaced by Phase 15 (which is a superset). **Action: delete.**
- **`docs/2026-04-21-campaign-system-plan.md`** — campaign work is shipped. **Action: archive as historical; don't delete — it's a useful record of the M1-M4 decisions.**

**Don't delete yet:**

- `docs/goal.md` — source of truth, just authored.
- `docs/engine-architecture-vision.md` — describes the shipped agent. Still accurate, needs a light update post-Phase 15A (the registry changes).
- `docs/sellability_road_map/phase-{2,3,4,5,6,8,9,10}.md` — still-useful execution specs for their domains. Cross-link back to goal.md in a future tidy pass.
- `docs/sellability_road_map/phase-{11,12,13,14,15}.md` — all current-era plans, keep.

---

## Phase 13 Status

**Stage 1 (schema + pricing + model + tracker) — SHIPPED** (2026-04-22 in this session).

**Stage 2 (instrumentation) — next.** This is the remaining ~1–2 days of Phase 13. Instrument these callsites to emit `recordXCost(...)`:

- `workers/src/utils/llmClient.ts` — LLM calls (parse OpenRouter `usage`).
- `workers/src/pipeline/searchProviders/router.ts` + per-provider files — SERP calls.
- `workers/src/pipeline/tools/fetchFile.ts` — file fetches.
- `workers/src/pipeline/tools/scrapePage.ts` — Playwright calls.
- `workers/src/pipeline/tools/transcribeUrl.ts` — transcription minutes.
- `workers/src/services/embeddings.ts` — embedding tokens.
- `backend/src/services/email/emailService.ts` (campaign sends — trivial cost but good for margin accounting).

**Stage 3 (aggregator + endpoints + frontend card)** — deferred. The numbers flow correctly through Stage 2 to `CostEvent` rows; the aggregator + UI can land alongside Phase 15D when customers are about to start configuring their own data sources and want to see the cost surface.

**Net path:** finish Phase 13 Stage 2 (~2 days), then straight into Phase 15A.

---

## Decisions Still Open

Unchanged from prior execution plan — worth re-reading before we start 15A:

1. **Pricing freshness**: (b) freeze at emit — confirmed via Phase 13 Stage 1's `unitPriceUSD` storage.
2. **Skills: independent copies vs references** — now moot; Skills become Saved Workflows in 15C/11-rescope. Default to independent-copies when we get there.
3. **Evidence snapshots storage backend** — still open (Cloudinary recommended). Not blocking 15A.
4. **Agent prompt versioning** — still open. Not blocking 15A (the hybrid-registry change is backward-compat because agent tools are just a view).
5. **M4.5 approach**: still open (custom Message-ID vs capture-ESP-assigned). Recommend spiking while 15A is underway.

---

## Horizon-1 Definition (from goal.md) — Revised Against This Plan

Launch-ready = "an agency can run their whole week on LeadreAI." Mapping that to deliverables:

- Core loop (research → campaign) — ✅ shipped (M1-M4).
- Clarifier + guardrail — ✅ shipped.
- Cost visibility — Phase 13 Stage 1 ✅, Stage 2 next.
- Workspace-lead reuse — Phase 11 M0 (post-15A).
- External data integrations (Apollo at minimum) — Phase 15B.
- Flexible tables — Phase 15C.
- Provenance exports — Phase 12.
- Column-referenced enrichment — Phase 15D.
- Parallel performance — Phase 14.
- Inbound replies — M4.5.

All of that is ~8–10 dev-weeks. That's roughly Horizon 1's 3-month window, which lines up cleanly.

---

## Next Concrete Move

1. Finish **Phase 13 Stage 2** — instrumentation. Wire `recordXCost()` into the 7 callsites listed above. ~1–2 days.
2. Begin **Phase 15A** — refactor the 14 existing tools into the new `DataSource` registry. Introduce `DataSourceCredential` + `DataSourceInvocation` models. Wire the executor. ~1 week.

Both are implementation work, no further alignment needed.
