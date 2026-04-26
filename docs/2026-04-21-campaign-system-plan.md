# Campaign System — Rating & Plan

_Date: 2026-04-21 · Branch: `feature/intelligent-pipeline`_

This document does two things:

1. Rates the current **lead generation** system honestly, with specifics — what's load-bearing, what's fragile, what would impress a buyer and what wouldn't survive a demo.
2. Lays out a concrete **campaign system** plan for the next work block — bridging the gap between the sophisticated backend pieces that already exist and the five-chapter wizard UI that currently only persists four fields.

It's scoped as an execution plan, not a vision doc. The long-horizon thinking already lives in `docs/2026-04-18-b2b-sellability-roadmap.md` and the `docs/sellability_road_map/phase-*.md` series — this document defers to those for the "where we're going" and focuses on "what we should build next, in what order, and why."

---

## Part 1 — Lead Generation: Rating

**Overall: 8 / 10.** The lead-gen pipeline is the most differentiated thing in the codebase today. It has shifted from BuildPlan.md's linear dork-pipeline into a proper **LLM-driven agent with a tool registry**, and the evolution is genuinely clever.

### Why 8/10 (the strengths)

| # | Strength | Where it lives | Why it matters |
|---|---|---|---|
| 1 | **Agent-driven discovery with a tool registry** | `workers/src/pipeline/jobAgent.ts`, `workers/src/pipeline/tools/*` | Replaces brittle linear dork templates with a planner that routes to the cheapest competent tool first. Can handle niche queries a template-driven system would miss. |
| 2 | **Registry-first discovery** | `pipeline/registryProviders/` (Wikipedia categories, curated seed lists) + `tools/listCompanies.ts` | Often eliminates 50-80% of SERP calls per job (per the system prompt). Massive cost lever. |
| 3 | **Two-pass baseline-then-upgrade strategy** | System prompt in `jobAgent.ts` | Locks in a cheap generic-email record per company before attempting decision-maker enrichment. Graceful degradation under rate-limits or wall-clock pressure. |
| 4 | **Multi-provider search routing + query cache** | `pipeline/searchProviders/{brave,serper,serpapi,router,queryCache}.ts` | Resilient to single-provider outages, rate limits, quota exhaustion. Cached queries cut repeat-job cost. |
| 5 | **Per-job budget estimation with mid-run critic** | `wallClockBudget.ts`, `CRITIC_INTERVAL = 5` in `jobAgent.ts` | Bounds worst-case cost *and* rescues stuck runs by injecting replans. Dollar-per-job is predictable — a real selling point. |
| 6 | **Per-job custom output columns (`outputSchema` + per-lead `facts`)** | Commit `c17bffa` · `jobAgent.ts:142-150` | The user asks for "arbitrary columns" and the agent fills them with provenance. This is the differentiator against Apollo/ZoomInfo for ad-hoc research. |
| 7 | **Workspace Library grounding (`read_document`)** | `tools/readDocument.ts`, `Document`/`DocumentChunk` models | Uploaded pitch decks, portfolio lists, ICP notes bias the search. Lets the agent say "like your portfolio companies" without re-explaining. |
| 8 | **File + OCR ingestion for directory/report discovery** | `tools/fetchFile.ts`, `aggregatorNameExtractor.ts` | Filetype-dork + PDF/XLSX/OCR parsing beats SERP-only tools on association directories, conference attendee lists, regulatory filings. |
| 9 | **Audio transcription for founder-interview-style queries** | `tools/transcribeUrl.ts`, `services/transcription.ts` | Genuine novelty — sourcing executive quotes from podcasts. Nothing in the commercial market does this well. |
| 10 | **Evidence-only write policy (no fabrication)** | System prompt rules 7, 8 + `writeLead.ts` | Explicit "reject UI chrome as contact names" — addresses the #1 hallucination failure mode of agentic systems. |
| 11 | **Contact enrichment awaited before completion** | Commit `3fa63cd` | Job completion is honest — no "ghost complete" where leads appear without contact rows. |

### Why not 9/10 (the honest weaknesses)

1. **Sequential agent loop is the throughput bottleneck.** Each step is one LLM call at 45s timeout (`LLM_TIMEOUT_MS`). A 100-step job with 5s average latency is ~8 minutes; a 300-step job approaches 25. Per-company work is embarrassingly parallel — a **parallel subagent per candidate company** would realistically 5–10x throughput for demographic queries. The architecture already separates "discovery" (list/search) from "per-company enrichment" (fetch + write), so the refactor is localized.
2. **Email verification quality isn't measured.** The pattern-gen → MX → SMTP-RCPT-TO stack is standard, but there's no visible signal for **catch-all domains** (where every address returns 250-OK and verification is meaningless). Without a catch-all flag, pattern-inferred emails get misleading "verified" badges. This is the kind of thing a buyer will catch in the first demo by searching their own company.
3. **Rank score isn't calibrated against real outcomes.** The composite formula from BuildPlan (completeness 40 / email 20 / phone 15 / OSINT 15 / source 10) is plausible but not tied to reply-rate data. Until campaigns are real, it's uncalibrated — and that's fine, but it should be acknowledged in the UI as "completeness score" rather than implying predictive quality.
4. **Dedup is domain-exact + fuzzy-name.** Rebrands, acquisitions, holding-company/subsidiary cases, and companies sharing domains (law firms on shared marketing domains) leak through. Low priority — but worth knowing before a big customer concatenates a year of jobs.
5. **Cost observability per job is ad-hoc.** Wall-clock budget is tracked; token spend and SERP-credit spend aren't visibly aggregated per job. Given dollar-predictability is the stated selling point, per-job `creditsCharged` + a breakdown (LLM tokens / SERP calls / storage) would make this legible both to ops and to the billing story.
6. **English-centric registries.** Wikipedia-category + seed lists + OpenCorporates is weak for non-Anglophone markets. Fine for v1; a specific constraint to name when selling into EU/LATAM.
7. **No proxy rotation in Playwright.** `scrape_page` works today because the agent is told to prefer cheaper tools and skip aggregator domains. A determined adversarial site (Cloudflare-protected LinkedIn-ish) will still get the worker bot-banned. BuildPlan lists `proxy-agent` as optional — that decision will bite at scale.

### What a buyer-facing demo gets right

- "Find me 50 fintech CEOs in Nigeria with verified emails, and a column for latest funding round" — the `outputSchema` feature genuinely nails this.
- Real-time agent activity stream (`pipeline/jobAgent.ts` → `job:progress:{jobId}` pub/sub → SSE) makes the magic visible.
- The two-pass strategy means even a rate-limited run still produces *something* — no empty-table failures.

### What would fall over in front of a sharp buyer

- "Verify this email I know is valid" — without catch-all detection, confidence labels are misleading.
- "Do the same job twice, is it deterministic?" — registry-first helps, but SERP ordering + LLM nondeterminism mean the second run won't be identical. Unmanaged expectations here are a trust-killer.
- "How much did that cost?" — no dollar breakdown at job end.

---

## Part 2 — Campaign System: Current State Audit

**Today's campaign rating: 3 / 10 end-to-end, despite having 7/10 individual pieces.** The parts exist; they aren't connected.

### What's actually wired

| Piece | Location | Status |
|---|---|---|
| Campaign CRUD | `backend/src/controllers/campaigns.controller.ts` | ✅ Works — create/read/update/delete, file-backed |
| Bulk outreach draft generation | `workers/src/outreach.worker.ts` + `backend/src/services/ai/outreachDraftService.ts` | ✅ Works — BullMQ `outreach` queue, per-lead SerpAPI research, AI draft via Claude, SSE progress |
| Single-draft preview | `outreach.controller.ts::generateSingleDraft` | ✅ Works |
| Draft review workflow (draft → approve → send) | `OutreachDraft` model + `outreach.controller.ts` | ✅ Works for one-shot sends |
| Send via Resend / SendGrid / SMTP | `backend/src/services/email/emailService.ts` + `workers/src/sequence.worker.ts` | ✅ Works, with encrypted provider creds |
| List-Unsubscribe header + token | `backend/src/services/unsubscribe.ts` | ✅ Works (one-click unsubscribe compliant) |
| Sequence data model | `models/Sequence.ts`, `models/SequenceEnrollment.ts` | ✅ Full state machine, step history, bounce/reply tracking |
| Sequence scheduler (cron-style tick) | `workers/src/sequenceScheduler.ts` | ✅ Polls `nextStepAt`, dispatches step jobs idempotently |
| Sequence step executor | `workers/src/sequence.worker.ts` | ✅ Send-window + suppression + retry + step-history append |
| Suppression list | `models/SuppressionList.ts` | ✅ Enforced in `sequence.worker.ts` before send |
| Email event ingestion (bounce/delivered/…) | `models/EmailEvent.ts` + `routes/webhooks.routes.ts` | 🟡 Model exists; webhook handler needs verification |

### What's sketched but not wired

| Gap | Evidence | Impact |
|---|---|---|
| **Campaign ↔ Sequence link is missing** | `models/Campaign.ts` has no `sequenceId` field. `campaigns.controller.ts` never creates or attaches a sequence | The wizard's Sequence/Message/Schedule chapters have nowhere to land. You cannot launch a multi-step campaign from the product today. |
| **Wizard doesn't persist steps/schedule** | `frontend/.../campaigns/page.tsx::handleLaunch` posts only `{name, description, fileId, tone, language}` | Users who go through the 5-step flow silently lose 4 chapters of input. This is the biggest single UX lie in the product. |
| **No "launch / activate" endpoint** | No controller creates `SequenceEnrollment` records from a campaign's file | The sequence machinery runs, but there's no on-ramp. |
| **Reply detection is absent** | No inbound webhook handler for reply events. Sequence stop rules reference `any_reply` / `positive_reply` but nothing writes `repliedAt` onto enrollments | Sequences will happily keep sending after someone replies — a credibility disaster. |
| **`stats` counters aren't incremented** | `Campaign.stats.sent/opened/replied/bounced` and `Sequence.stats.*` are only wired for `draftsCreated` | Analytics page can't show anything real. |
| **Deliverability checks are static** | Wizard Review chapter shows "SPF / DKIM / DMARC · Pass" hardcoded | Will look great until a DMARC-strict buyer checks. |
| **Daily send cap is UI-only** | Wizard lets user pick 20-500/day; no backend enforcement | Spam risk, ESP throttle risk, domain-reputation risk. |
| **Send window + timezone not typed end-to-end** | `Sequence.steps[].sendWindow` shape exists; wizard `Schedule` uses strings like "9–5" and "Mon–Fri" | Can't round-trip. |
| **No per-step merge-token editor tied to real fields** | Wizard hardcodes `{{first_name}}` / `{{company}}` preview; `templateRenderer.ts` resolves against `Lead` and `Contact` | Users won't know which tokens are safe. |
| **Analytics/detail page absent** | Wizard file's own comment: "Leaves `/dashboard/campaigns/[campaignId]` for a follow-up turn" | No post-launch visibility. |

### Relationship to existing roadmap docs

The sellability roadmap (`docs/sellability_road_map/phase-2-sequence-engine-reply-handling.md`) already specifies the **full vision** for sequences: reply detection via provider webhooks + IMAP fallback, bounce processing, unsubscribe compliance, per-workspace sending-domain verification. That document is the right north star.

This plan is narrower: it's the **minimum bridge** to make the existing wizard tell the truth, backed by the execution infrastructure that's already shipped. Think of it as "Phase 2A" — everything Phase 2 needs that isn't already implemented, ordered by risk and by what unlocks a credible end-to-end demo fastest.

---

## Part 3 — Campaign System: Execution Plan

Four milestones, each shippable on its own. M1–M3 should be possible in the current iteration; M4 is the gateway to the full Phase 2 roadmap.

### M1 — Close the wizard→backend lie (1–2 days)

**Goal:** every field the wizard collects actually persists and round-trips.

1. Extend `Campaign` model with a nullable `sequenceId: ObjectId` ref.
2. On launch, the backend creates a `Sequence` from wizard state (steps + emailTemplates + sendWindow + stopRules) and sets `Campaign.sequenceId`.
   - Map wizard `Schedule.tz` → `sendWindow.timezone`.
   - Map `"9–5"` / `"Mon–Fri"` → `{startHour, endHour, allowedDays[]}`.
   - Persist `schedule.cap` onto `Campaign` (new field: `dailySendCap`).
3. Update wizard `handleLaunch` to submit the full payload in one call: `POST /api/v1/workspaces/:w/campaigns` now accepts `{ ...existing, steps, schedule, replyRules }`.
4. Validate end-to-end with a Zod schema in `shared/src/schemas/zod/campaign.schemas.ts`.
5. UI acceptance: reload the campaign after launch — every chapter repopulates from the persisted record.

**Why first:** every subsequent milestone depends on the wizard actually saving what the user drew. Without this, the rest is building on sand.

### M2 — Activate endpoint + enroll leads (1–2 days)

**Goal:** pressing "Launch" causes real scheduled sends.

1. `POST /workspaces/:w/campaigns/:id/activate`:
   - Loads the `File.leadIds`.
   - Bulk-creates `SequenceEnrollment` records (one per lead), `status: 'active'`, `currentStep: 1`, `nextStepAt: now + step1.delayDays`.
   - Sets `Campaign.status: 'active'`, `Sequence.status: 'active'`.
   - Honors audience refinements from the wizard (`hot`, `verifiedOnly`, `excludeCRM`) as enrollment filters.
   - Idempotent — unique index `(sequenceId, leadId)` already exists on enrollments.
2. Pre-activation checks, returned as a preflight response the UI can show:
   - Workspace has `emailConfig` and it's verified.
   - File has ≥1 lead matching the refinements.
   - Suppression list applied — leads with suppressed emails/domains excluded, counted, shown.
3. Enforce `Campaign.dailySendCap`:
   - Add a Redis counter key `send-quota:{workspaceId}:{YYYY-MM-DD}`.
   - `sequence.worker.ts` checks-and-increments before `sendEmail`. On cap hit, defer `nextStepAt` to next allowed window instead of skipping.
4. UI: "Launch" button becomes a two-stage confirm — preflight summary, then Activate. Wizard's existing "launched" modal adapts.

**Why second:** this is the first milestone where a user can do something they demonstrably couldn't before. It also surfaces the suppression/quota work that the sequence roadmap calls out anyway.

### M3 — Analytics view + stat rollups (2–3 days)

**Goal:** `/dashboard/campaigns/[campaignId]` shows real post-launch data.

1. Stat maintenance:
   - `sequence.worker.ts` already writes step-history status (sent/failed). Add `$inc` on `Sequence.stats` and `Campaign.stats` (`sent`, `bounced` once bounce events land).
   - Draft-level stats (`draftsCreated`) already maintained in `outreach.worker.ts`.
2. Campaign detail page:
   - Top-line KPIs: enrolled / sent / bounced / replied / unsubscribed / in-flight today.
   - Step funnel: for each step, sent → opened → clicked → replied (opens/clicks light up once webhooks land in M4; until then show "—" with a tooltip).
   - Sending-velocity chart (cap vs. actual per day).
   - Per-enrollment table with state + next-step-at, linked to the per-lead step history.
   - Pause / resume / archive controls.
3. Reliance on `AuditLog` for a "recent activity" stream — entries already written on approve/send.

**Why third:** until there's a feedback loop, users won't trust the launched state. And since all the write sites are known (two workers), instrumenting them is localized.

### M4 — Reply + bounce ingestion (3–5 days)

**Goal:** sequences stop when they should.

This is where Phase 2 of the sellability roadmap takes over. Scope for this milestone, in priority order:

1. **Provider webhooks (fastest wins):**
   - `POST /webhooks/resend` — handle `email.bounced`, `email.delivered`, `email.complained` (unsubscribe), `email.opened`, `email.clicked`.
   - `POST /webhooks/sendgrid` — same event taxonomy, different payload.
   - HMAC-verify per provider.
   - Write `EmailEvent` rows, update `SequenceEnrollment.stepHistory[n]` fields (`deliveredAt`, `bouncedAt`, `bounceType`, etc.), and apply stop rules (bounce → add to suppression + stop enrollment; complaint → same).
2. **Reply detection — provider-inbound first, IMAP later:**
   - Start with the "forward inbound replies to webhook" path that both Resend and SendGrid support. Much cheaper than IMAP polling for v1.
   - On inbound: match `Message-ID` headers back to `stepHistory.messageId` to find the enrollment, set `repliedAt`, apply `stop_sequence`.
   - **Explicitly defer positive-vs-negative reply classification** to Phase 2 proper. v1 = any reply stops the sequence, notify in-app.
3. **Bounce-driven suppression:**
   - Hard bounce → auto-add email to `SuppressionList` scoped to workspace.
   - Soft bounce × 3 consecutive → same.
4. **In-app notifications:**
   - `notifications` service already exists — reuse it. Notify on first reply per enrollment.

**Why last:** this is the biggest block and genuinely belongs to the Phase 2 roadmap. But without it, the rest of the campaign system is irresponsible to ship — a campaign that keeps hitting a replied lead is worse than no campaign. M1–M3 should land behind a feature flag if M4 slips.

### Parallel-track hygiene (do in any milestone)

- **Typed wizard state ↔ shared schema**: move `SeqStep`/`Schedule`/`ReplyRules` out of the page file into `shared/src/schemas/zod/campaign.schemas.ts` so FE and BE validate against the same thing.
- **Merge-token picker**: a small shared list in `shared/` of tokens that map to `Lead`/`Contact` fields, surfaced in the wizard as a chip-bar next to the body textarea. Source-of-truth for what `templateRenderer.ts` actually resolves.
- **Kill static "SPF/DKIM · Pass"**: either do a real DNS check (cheap, <50ms) or remove the section from the wizard. Lying to users in-app is worse than the feature being absent.
- **Per-workspace test send**: a "send this draft to myself" button before activation. Catches template bugs cheaply.

---

## Risks & tradeoffs to flag before starting

- **Breaking the existing `Campaign` → single-send flow.** Current `outreach.worker.ts` bulk-generates drafts that the user reviews before sending. If M1–M2 collapse "generate drafts" and "send via sequence" into one flow, drafts-review-then-send is lost. **Recommendation:** keep the draft-review flow as a per-campaign option (`Campaign.mode: 'draft_review' | 'automated'`) and default the wizard to `automated` while leaving the existing workflow available from the leads page.
- **IMAP vs webhook for reply detection.** Webhooks require each customer to configure their ESP — high setup friction. IMAP polling works with any inbox but costs ~$0.01-0.02/workspace/month and has 5-minute latency. The roadmap doc calls IMAP a "fallback"; M4 above inverts that (webhook-first). That inversion is deliberate — it prioritizes the bigger customers who already use Resend/SendGrid. Revisit after first 5 paying workspaces.
- **Campaigns can enroll the same lead twice across campaigns.** Enrollment uniqueness is `(sequenceId, leadId)` — two different sequences can both mail the same lead on the same day. Need a workspace-level rule ("no lead enrolled in more than one active sequence at a time") before the first customer has multiple sequences. Add as a pre-flight check in M2.
- **Scheduler drift.** `sequenceScheduler` polls every `SEQUENCE_SCHEDULER_INTERVAL_MS`. If the worker process dies mid-tick, no harm done (idempotent jobId). If it dies entirely, nothing sends. Phase 2 of the roadmap calls out monitoring; at minimum add a Bull Board alert for zero scheduler-ticks-in-5-minutes.

---

## Summary

- **Lead generation: 8/10** — genuinely differentiated via the agent + tool registry + registry-first strategy + custom output columns. Weak spots are catch-all email detection, cost observability, and throughput (sequential agent loop).
- **Campaign system today: 3/10 end-to-end** despite 7/10 individual components. Backend sequence machinery is shipped; the Campaign model doesn't reference it; the wizard persists 4 of 20-odd fields.
- **Next four milestones (M1–M4)** close that gap in order of load-bearing risk: persist the wizard truthfully → activate real sends → expose analytics → ingest replies/bounces. M4 is the on-ramp to the broader Phase 2 sellability roadmap.
- **Single most urgent thing:** M1. Every other plan is downstream of the wizard actually saving what the user drew.
