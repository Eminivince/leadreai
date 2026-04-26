# LeadreAI B2B Sellability Roadmap — v2

_Date: 2026-04-21 · Supersedes: `2026-04-18-b2b-sellability-roadmap.md`_

The 2026-04-18 roadmap described the product as an "AI-assisted prospecting and outreach engine" and organized pricing + horizons around that framing. Three days of hindsight on what's actually in the codebase make clear that the framing **understates the product**: LeadreAI is now a budget-aware research agent with a tool registry, registry-first discovery, per-job custom output columns, audio transcription, and workspace-library grounding — that's a different product from what the 04-18 doc sells. It also lists work as "future" that's either already shipped or has been reverted on the current branch.

This v2 doc replaces the master roadmap. It doesn't touch the 10 phase-specific execution docs in `sellability_road_map/*` — those are reassessed in the appendix at the end with specific "keep / rewrite / retire / split" guidance.

The prior 04-18 doc remains on disk as an archival record of how we thought about this on that date. Do not edit it.

---

## Part 1 — What the Product Actually Is Now

Three sentences for the top of a pitch deck:

> **LeadreAI is a research agent that produces evidence-backed lead tables.** You ask in natural language, specifying both a target (industry/geo/persona) and the columns you care about (funding round, hiring signals, named founder, your own custom fact); a budgeted agent plans, calls the right tool from a registry of 13 research tools, writes down only what it can justify from source, and hands back a table where every cell is click-throughable to its provenance. It also ships the outreach loop — drafts, send, sequences, suppression — on top of that table.

The material primitives, all shipped and in production-relevant code:

| Primitive | Where it lives | What's differentiated about it |
|---|---|---|
| LLM-planned agent loop (not a fixed pipeline) | `workers/src/pipeline/jobAgent.ts` | Plans, replans via mid-run critic, bounded by wall-clock + step budget |
| 13-tool registry | `workers/src/pipeline/tools/*` | Cheap tools preferred; `scrape_page` held back for last-resort |
| Registry-first discovery | `registryProviders/{seedList,wikipedia}.ts`, `registries/opencorporates.ts` | Often eliminates 50–80% of SERP calls per demographic query |
| Multi-provider search routing | `searchProviders/{brave,serper,serpapi,router,queryCache}.ts` | Resilience against single-provider outages/quota + repeat-query caching |
| Two-pass baseline-then-upgrade | System prompt in `jobAgent.ts` | Always writes a baseline row before attempting decision-maker enrichment — graceful degradation |
| Per-job custom output columns | `outputSchema` on ProspectingJob + `facts` on Lead (commit `c17bffa`) | Every fact carries `{value, unit?, sourceUrl, confidence, raw?}` — provenance preserved |
| Workspace library grounding | `tools/readDocument.ts` + `Document`/`DocumentChunk` models | Uploaded pitch decks, ICP notes, portfolio lists steer future searches |
| File + OCR ingestion | `tools/fetchFile.ts`, `aggregatorNameExtractor.ts` | Directories, annual reports, attendee lists parsed as structured data |
| Audio transcription | `tools/transcribeUrl.ts` + `services/transcription.ts` | Founder interviews, podcasts, conference talks as first-class research surfaces |
| Evidence-only write discipline | System prompt + `tools/writeLead.ts` | Explicit anti-fabrication rules; rejects UI chrome as contact names |
| Contact model + seniority mapping | `models/Contact.ts`, `workers/src/services/seniorityMapper.ts` | Named contacts with title/department/seniority already in production (Phase 1 item from the old roadmap is partially shipped) |
| Budget-aware cost control | `wallClockBudget.ts`, per-job step cap | Per-job cost is bounded and predictable |

What this **is not** — important for honesty with buyers:

- Not a static database of B2B contacts (Apollo/ZoomInfo territory).
- Not a real-time signal feed yet (Phase 10 roadmap item; unshipped).
- Not a CRM (we sync to one; we aren't one).
- Not reliably faster than a human analyst on a single named company — the win is on fleets of 50+ targets with custom columns.

---

## Part 2 — Positioning & Competitive Frame

The 04-18 doc had no competitive frame. This is the biggest commercial miss: the product looks generic until you place it on the map.

**Two axes that matter for outbound buyers:**

1. *Coverage vs. depth.* Apollo and ZoomInfo win on "every US B2B contact." We don't, and won't. We win on "every relevant contact for *your* query, with sources, including the ones Apollo doesn't know about."
2. *Static data vs. arbitrary research.* Clay won on "arbitrary columns with provenance" — you describe a column, it researches it. That's precisely what `outputSchema` + `facts` already does in our codebase.

**Where LeadreAI sits:**

```
                        BROAD COVERAGE
                              │
        Apollo ●             │             ● ZoomInfo
                              │
                              │
        LOW DEPTH ─────────── ● ─────────── HIGH DEPTH
        PER RECORD            │               PER RECORD
                              │
                              │ ● LeadreAI
                              │
        Hunter ●      Clay ● │
                              │
                        NARROW / ON-DEMAND
```

We're in Clay's quadrant (on-demand research with arbitrary columns) but with **three specific assets Clay doesn't have**:

1. **Native outreach execution.** Clay makes you export to Outreach/Lemlist. We have sequences, suppression, List-Unsubscribe, send windows in the codebase already (see campaign plan of 2026-04-21).
2. **Audio and file as first-class research.** Clay does table enrichment over HTTP. We transcribe podcasts and parse annual-report PDFs in the same loop.
3. **Registry-first discovery.** Clay starts from a list you provide. We can produce the list — specifically for markets where Apollo has thin coverage (African fintech, EU SMB, niche verticals).

**The sellable one-liner:**

> "Clay for markets Apollo doesn't cover, with the outreach loop built in."

That positioning should drive every pricing, horizon, and marketing decision in this doc.

---

## Part 3 — What's Actually Blocking the First Dollar

The 04-18 doc frames everything as product build. In reality, two commercial blockers outrank every feature add, and they're both cheap to close:

### Blocker A — Campaign launch path doesn't persist sequence state

See `2026-04-21-campaign-system-plan.md`. The 5-chapter wizard saves 4 fields. Until M1–M4 of that plan are done, no customer can run a real campaign through the product. This is the single most urgent commercial item, not a product item.

### Blocker B — "How much will this cost?" has no answer at job-end

The agent has a step/wall-clock budget. It does not report **dollar spend per job** (LLM tokens + SERP credits + storage). Every enterprise procurement process asks this question. Answering it with a visible breakdown is ~2 days of work and turns a recurring objection into a differentiator — "predictable per-job cost" is something neither Apollo nor Clay surfaces well.

Everything else in this roadmap is downstream of these two.

---

## Part 4 — Differentiation Thesis (New — Missing From 04-18)

Four commercial levers the agent + registry architecture uniquely enables. These are the features that would make a sharp buyer say "I can't do this with Apollo + Lemlist."

### 4.1 — Research Skills Marketplace

A "Skill" = a reusable `(parsedIntent template + outputSchema + system-prompt delta)` bundle. Users and eventually the community publish them.

Examples:

- **Funding Skill** — outputSchema: `[round, amount_raised, lead_investor, announcement_date, source_url]`, biased toward Crunchbase/TechCrunch/registry.
- **Portfolio-Lookalike Skill** — takes the user's uploaded pitch deck from the Library, finds companies of similar stage/sector/geo.
- **Conference Attendee Skill** — filetype:pdf + filetype:xlsx dork pattern + table extraction.
- **Regulatory Filing Skill** — registry-first for the target country, outputSchema: `[filing_type, filing_date, directors[], registered_office]`.

**Why it's commercial:** one Skill = one shareable ICP template, turns a hard-to-explain product into an instantly-understandable wedge. Agencies ship their proprietary research as Skills.

**Implementation:** mostly already possible — `outputSchema` is persisted per job, `systemPromptOverride` is in the Campaign model. The missing piece is a `Skill` model + a library UI + publish/install mechanics. ~2 weeks.

### 4.2 — Evidence Graph Exports

Every fact the agent writes already carries a `sourceUrl` and `confidence`. Today that provenance is surfaced on lead detail pages. The commercial move: **export formats that preserve provenance**.

- `.xlsx` with a hidden provenance sheet: every data cell has a comment linking to source URL + scrape timestamp.
- Audit mode: every cell in a table is click-through, rendered server-side as a report with the scraped page snapshot.
- "Proof bundle" — ZIP of the raw source snapshots that back every claim in a lead table. Legal-defensible.

**Why it's commercial:** any buyer in a regulated industry (legal, financial services, procurement) asks "can we cite this?" The current answer is yes, but only if the UI is open. Exports preserving evidence turn that into a procurement-grade feature. Phase 4 of the old roadmap (`phase-4-evidence-cards-analytics-attribution.md`) touches this but frames it as UI; the productizable move is *exports + bundles*.

### 4.3 — Cost Explainer

Already outlined in "Blocker B" above, but worth calling out as a commercial lever separately. Per-job cost attribution:

- LLM tokens (split by model + whether cached)
- SERP calls (split by provider)
- File fetches (split by cacheable vs. fresh)
- Transcription minutes
- Page scrapes (high-cost tool, count matters)

Surfaced at job completion: "This job cost $0.42: 0.11 LLM / 0.18 SERP / 0.08 file / 0.05 scrape". Billable at that granularity per workspace per month. This is not a nice-to-have — per-query cost predictability is the single question enterprise buyers ask that existing tools duck.

### 4.4 — Multi-Agent Parallel Fan-Out

The current agent loop is serial — one tool call at a time, ~5s per LLM call × 100-300 steps. For demographic queries (the most common commercial case), per-company enrichment is embarrassingly parallel.

The architectural move: a **dispatcher agent** that does discovery, then fans out to N parallel **per-company subagents** for enrichment. Expected 5–10x throughput on 50+ target demographic queries.

**Why it's commercial, not just performance:** jobs that complete in 2 minutes feel like magic; jobs that take 20 minutes feel like a batch job. The delta drives demo conversion materially. Also: shorter jobs = more jobs/day per workspace = more credits consumed = better unit economics at every pricing tier.

---

## Part 5 — Horizons, v2 (Reality-Tagged)

Tags:
- **[SHIPPED]** — in production code on the current branch
- **[PARTIAL]** — skeleton present, commercial gaps
- **[REVERTED]** — was in a prior branch, removed here
- **[NEW]** — not in 04-18 roadmap

### Now (0–6 months) — What closes the first 10 customers

| Item | Status | Notes |
|---|---|---|
| Named contacts with title/seniority | **[SHIPPED]** | `Contact` model + `seniorityMapper.ts` + two-pass agent extraction |
| Workspace Library (BYO ICP docs) | **[SHIPPED]** | `Document`/`DocumentChunk` + `read_document` tool |
| Custom output columns per query | **[SHIPPED]** | `outputSchema` + `facts` — commit `c17bffa` |
| Multi-provider search routing + cache | **[SHIPPED]** | Brave / Serper / SerpAPI router |
| Registry-first discovery | **[SHIPPED]** | Wikipedia + seed list + OpenCorporates |
| File + audio ingestion in research loop | **[SHIPPED]** | `fetch_file` + `transcribe_url` |
| Email send via Resend / SendGrid / SMTP | **[SHIPPED]** | `services/email/emailService.ts` + encrypted credentials |
| Single outreach draft review + send | **[SHIPPED]** | `outreach.controller.ts` |
| Sequence data model + scheduler + worker | **[SHIPPED]** | But not linked to Campaign — see below |
| Suppression list, List-Unsubscribe, unsub tokens | **[SHIPPED]** | `SuppressionList`, `services/unsubscribe.ts` |
| HubSpot OAuth + sync | **[REVERTED]** | Files deleted on current branch — the old Phase 1 commercial claim no longer holds |
| Campaign↔Sequence link + launch path | **[PARTIAL]** | Blocker A — M1–M2 of `2026-04-21-campaign-system-plan.md` |
| Reply + bounce ingestion | **[PARTIAL]** | Webhook models exist, handlers incomplete — M4 of campaign plan |
| Per-job cost explainer | **[NEW]** | Blocker B — ~2 days work, outsized commercial impact |
| Deliverability dashboard (SPF/DKIM/DMARC) | **[PARTIAL]** | Wizard shows static "Pass" — either implement or remove |
| Workspace API keys + webhooks | **[PARTIAL]** | `routes/webhooks.routes.ts` exists; customer-facing API key issuance doesn't |
| Saved searches / always-on alerts | **[NEW]** | Not started |
| Slack notifications on reply/alert | **[NEW]** | Stub only |
| Agency basics (white-label export, client-ready PDF) | **[NEW]** | Phase 5 doc plans this; nothing shipped |
| Credits + billing scaffolding | **[PARTIAL]** | `CreditTransaction` model + `services/credits.ts` exist; no Stripe flow |

**Commercial outcome of Now:** close Blockers A + B. Ship Research Skills v0 (even just templates in code). Re-pick whether HubSpot comes back now or later — the answer depends on whether the first 3 customers actually need it, not on what the old roadmap said.

### Next (6–12 months) — What turns early wins into retention

| Item | Status | Notes |
|---|---|---|
| Research Skills marketplace | **[NEW]** | v0 published; v1 is publish/install |
| Evidence-graph exports (xlsx w/ provenance, proof bundles) | **[NEW]** | Leverages already-stored `sourceUrl` + `confidence` |
| Multi-agent parallel fan-out | **[NEW]** | Largest throughput lever |
| HubSpot sync (re-ship) + Salesforce + Pipedrive | **[PARTIAL/NEW]** | Only if first customers need it |
| Import + dedupe + re-enrichment studio | **[PARTIAL]** | Agent can re-enrich via upsert today; UI missing |
| Collaborative approval flows | **[NEW]** | Phase 8 doc spec |
| Buying-signal monitoring (hiring, funding, leadership change) | **[NEW]** | Phase 10 territory — but possible to MVP as a saved-skill-run-on-cron |
| Attribution dashboards (reply→meeting→pipeline) | **[NEW]** | Requires reply ingestion first |
| Local market / franchise mapping pack | **[NEW]** | Registry-routing is already a moat here |

### Later (12–24 months) — Upmarket and second SKUs

Roughly unchanged from 04-18, except:

- **ABM workspace / account plans** — now practical because the Library + agent already gather per-account evidence.
- **Tender / RFP monitoring** — much more realistic than in 04-18 because file+OCR ingestion is shipped.
- **Website visitor / intent layer** — remains out-of-scope (compliance + data deal work).
- **Relationship / warm-intro graph** — deferred; requires customer data volume we don't have.
- **Enterprise trust (SSO/SAML/SCIM, data residency, audit retention)** — mandatory for deals >$50K/yr; Phase 9 doc stands.

---

## Part 6 — New Phases to Add to `sellability_road_map/*`

Proposing four new phase docs be written. Rough order of commercial impact:

### Phase 11 — Research Skills & Skill Marketplace

Turn the agent's `outputSchema` + `systemPromptOverride` primitives into a shareable, reusable unit. Single-workspace Skills first; shared Skills later; paid Skills from agencies as a marketplace v1.

### Phase 12 — Evidence Graph & Provenance Exports

Preserve the agent's per-fact provenance through the full export pipeline. `.xlsx` with comments; `.pdf` audit reports; `.zip` proof bundles. Hooks on top of existing `sources[]` and `facts[].sourceUrl`.

### Phase 13 — Cost Explainer & Unit-Economic Telemetry

Per-job cost breakdown (LLM tokens × model × cache-status, SERP calls × provider, file fetches, transcription minutes, page scrapes). Visible at job completion, aggregated on workspace dashboard, exportable for the finance team.

### Phase 14 — Multi-Agent Dispatcher + Parallel Enrichment

Refactor the agent loop into a dispatcher (discovery) + N parallel per-company subagents (enrichment). Localized refactor in `workers/src/pipeline/jobAgent.ts` and `tools/*`. Biggest single performance lever.

---

## Part 7 — Pricing — Minor Update From 04-18

Principles unchanged. Draft tiers unchanged. Two additions:

- **Skills as a pricing lever.** Team tier: install community Skills. Growth: publish workspace Skills. Agency: publish + sell Skills + usage pooling across clients.
- **Cost explainer as a Growth+ feature.** Team sees total credits; Growth and above see per-call breakdown. Aligns with the "charge for workflow value" principle from 04-18.

Remove HubSpot-gated features from the Team-tier pricing table until HubSpot sync is back on the shipping branch. The 04-18 tier list gates "1 CRM sync" at Team — that's currently a check we'd fail.

---

## Part 8 — Best Initial ICP — Sharpened

04-18 said "agencies / outbound teams / SMB-focused operators." That's still correct but too broad. Sharpen:

- **Primary:** agencies and solo researchers doing custom B2B research in markets Apollo covers poorly (African fintech, EU SMB by vertical, APAC regional SMB, industry-specific directories). These buyers already pay Clay $800–$2k/mo; they'll switch for `list_companies` + registry routing + audio transcription.
- **Secondary:** regulated-industry research teams (legal, financial services DD, policy/government affairs) who need evidence-preserved exports. They won't adopt Clay because exports don't meet their audit bar. They might adopt us if Phase 12 (Evidence Graph Exports) ships.
- **Deliberately deprioritized:** US B2B outbound SDR teams. That's Apollo + Outreach territory. We don't have the data coverage or the sequencing maturity to win there yet.

---

## Appendix A — Per-Phase Reassessment

For each existing phase doc in `sellability_road_map/*`. Short guidance on what to do next.

### Phase 1 — Contact Intelligence + HubSpot CRM Sync

**Status:** split.

- **Contact intelligence half — partially shipped.** `Contact` model, `seniorityMapper.ts`, and named-contact extraction via the two-pass agent exist. Phase 1 doc treats `Contact` as net-new; needs to be rewritten to describe what's left: role-in-buying-committee inference, contact-level freshness scoring, bulk contact refresh.
- **HubSpot half — reverted.** Files deleted on current branch. Phase 1 doc should either be shelved until a customer is committed to HubSpot, or re-scoped as a **CRM Connector Framework** — a generic sync abstraction with HubSpot as first instance when demand is proven. Don't ship the old HubSpot-specific build.

**Recommendation:** split this doc into `phase-1a-contact-intelligence.md` (rewritten to reflect what's shipped) and `phase-1b-crm-connector-framework.md` (re-scoped, non-HubSpot-specific).

### Phase 2 — Sequence Engine + Reply / Bounce / Unsubscribe

**Status:** partially shipped. Sequence/enrollment models + worker + scheduler are in. Campaign↔Sequence link, reply webhooks, and provider-inbound parsing aren't. `2026-04-21-campaign-system-plan.md` is the near-term execution; Phase 2 doc remains the long-term spec.

**Recommendation:** keep as-is; the campaign-plan doc is the M1–M4 slice. Add a status header to Phase 2 pointing at the campaign plan.

### Phase 3 — Deliverability & Compliance

**Status:** forward-looking. Unchanged except that the wizard's fake "SPF/DKIM/DMARC · Pass" display needs to either be implemented or removed — see the campaign plan.

**Recommendation:** keep; add a small note that the wizard-UI stub must be closed (remove the lie) before Phase 3 can claim progress.

### Phase 4 — Evidence Cards & Analytics Attribution

**Status:** forward-looking. Overlaps significantly with the proposed **Phase 12 — Evidence Graph & Provenance Exports**. Phase 4 is oriented to in-app UI (lead detail pages, attribution dashboards); Phase 12 is about exports and formats. Both should exist.

**Recommendation:** keep Phase 4 focused on in-app evidence cards + attribution. Create Phase 12 separately for exports. Cross-reference.

### Phase 5 — Agency Mode, White-Label, Client Workspaces

**Status:** forward-looking. Sharper now given Agency is the primary ICP in this v2. Elevate priority.

**Recommendation:** keep spec; move this earlier in the build sequence than 04-18 implied. Consider Skills marketplace (new Phase 11) as a prerequisite — agencies publishing Skills is the killer feature.

### Phase 6 — Saved Searches, Automation, Triggers

**Status:** forward-looking, directly enabled by the agent architecture (saved search = saved Skill + cron). Small rewrite to frame as Skill-based.

**Recommendation:** update to reference Phase 11 Skills model; a "saved search" is a Skill + a schedule. Simplifies the spec.

### Phase 7 — Data Import, Cleanup, Enrichment Studio

**Status:** overlap with shipped Library + agent upsert. "Bring your own CSV + enrich" is not implemented; "CSV as research target" is (via `fetch_file` on user-uploaded spreadsheets + re-`write_lead` on existing domains).

**Recommendation:** split into `phase-7a-bring-your-own-data-import.md` (CSV upload + dedupe + re-enrich workflow — unshipped) and `phase-7b-library-grounding-upgrades.md` (improvements on the already-shipped Library/Document system). Retire the monolithic Phase 7.

### Phase 8 — Collaborative Review & Approval

**Status:** forward-looking. Unchanged.

**Recommendation:** keep.

### Phase 9 — Enterprise Admin, Billing, API

**Status:** forward-looking. Stripe + SAML + API keys still unshipped. Unchanged.

**Recommendation:** keep.

### Phase 10 — ABM Workspace, TAM Builder, Intelligence Products

**Status:** forward-looking, more tractable now than in 04-18 due to Library + agent + registry routing.

**Recommendation:** keep spec; flag that buying-signal detection can MVP sooner than the doc implies, as a scheduled Skill (Phase 11 × Phase 6 = signal cron).

### Engine architecture vision (`engine-architecture-vision.md`)

**Not part of the sellability roadmap**, but noted in passing: this doc describes in **future tense** the agent / tool registry / registry discovery that's already in production. It is badly stale and should be rewritten to describe the shipped engine accurately. Flagging for a separate turn.

---

## Summary

- **The 04-18 roadmap under-sold the product.** This v2 leads with what's actually differentiated — agent loop, registry-first, custom columns, evidence preservation, audio — and repositions LeadreAI as "Clay for markets Apollo doesn't cover, with the outreach loop built in."
- **HubSpot sync is reverted on this branch.** The 04-18 pricing and Phase 1 doc both depend on it. v2 treats HubSpot as a "ship-on-customer-demand" item, not a day-one gate.
- **Two non-product blockers outrank everything:** the campaign launch path (Blocker A) and per-job cost explainability (Blocker B). Closing both is ~1–2 weeks.
- **Four new phases proposed** — Research Skills marketplace, Evidence Graph Exports, Cost Explainer, Multi-agent Parallelization — all enabled by primitives that already exist in code. These should become new phase docs (Phases 11–14).
- **Per-phase reassessment** in Appendix A tags each existing phase doc as keep / rewrite / retire / split.
- **No existing phase doc was modified in this pass.** The appendix is a proposal. Execution on those edits is a separate alignment step.
