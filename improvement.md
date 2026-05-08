# LeadreAI — Audit & Improvement Plan

**Author:** Engineering audit, 2026-05-07
**Scope:** Full engineering + product review of the lead-discovery pipeline, with prioritized recommendations.

---

## TL;DR

The app has the right *ambition* — agent-orchestrated, citation-backed B2B prospecting — but is failing at the *fundamental* job: it does not deliver verified contacts at acceptable quality or volume. The recent test run produced 4 leads out of 15 requested; the "emails" attached to them include strings like `whoweare@company.com` (the heading "Who We Are" parsed as a person's name, then run through pattern inference). The hybrid discovery path repeatedly times out and silently falls through to a slower cascade. The marketing surface promises "verified leads in minutes"; the system delivers unverified guesses in tens of minutes.

The root causes are not bugs — they're three structural choices:

1. **All-scrape data sourcing.** The system has no commercial data source (Hunter, Apollo, ZoomInfo, Cognism, People Data Labs). It tries to derive contact information from the open web by scraping public team pages and inferring email patterns. For ~70% of Nigerian SMEs (the explicit target market), this strategy cannot succeed because the data isn't on their websites in the first place.
2. **Four competing pipelines and a heavy agent loop on top.** `hybrid → smart → fan-out → serial` is a cascade of fallbacks where each path retries the same fundamentally weak primitives. Roughly 5,300 lines of `workers/src/pipeline/*` plus a 572-line agent driver on top. Each layer adds latency, branch points, and silent failure paths without adding capability.
3. **No quality gate before delivery.** The system writes whatever it finds — including pattern-guessed emails at 0.4 confidence — to the database, surfaces them to the user as "leads", and counts them toward the requested target. The user has no way to distinguish a verified contact from a sentence fragment that passed a regex.

This is fixable. The fix is **smaller** than the codebase — it requires removing things, not adding them. The remaining sections lay out what to keep, what to delete, and the order to do it in.

---

## Section 1 — Engineering Audit

### 1.1 The pipeline is a cascade of half-built strategies

```
DISCOVERY_MODE ∈ { hybrid, smart, old }
   ↓
hybrid           → falls back to →   fan-out
fan-out          → falls back to →   serial
serial           = the agent loop with critic
smart            → falls back to →   serial
```

`workers/src/pipeline/jobAgent.ts:311-334` — the entrypoint dispatches on `DISCOVERY_MODE`, but every branch ends in a fallback to a different branch. There is no scenario in which the cascade improves quality; each fallback is *strictly slower* than the previous one because it's tried only when the previous one didn't return enough candidates.

**Files in `workers/src/pipeline/`** (27 files, 5,258 LOC):
- `jobAgent.ts` (572) — orchestration
- `jobDispatcher.ts` (146) — separate "discovery agent" with its own LLM loop
- `jobSubagent.ts` (321) — fan-out enrichment workers
- `smartDiscovery.ts` (440) — yet another discovery path
- `researchAgent.ts` (197) — yet another agent
- `aggregatorNameExtractor.ts`, `aiContactExtractor.ts`, `contactEnricher.ts` — three different contact-extraction modules with overlapping responsibility
- `entityResolver.ts`, `entityWebsiteFinder.ts`, `heuristicFilter.ts`, `osintEnricher.ts`, `leadQualifier.ts`, `leadScorer.ts`, `ranker.ts`, `deduplicator.ts`, `phoneNormalizer.ts`, `emailDetector.ts` — a long stack of single-purpose transformers

The cost of this sprawl is not raw lines — it's that nobody (including the agent) has a model of which path is canonical. Every bug we fixed in this session (`hybridDiscovery.ts` timeout, `max_tokens` truncation, JSON repair) only affected the *first branch* of a cascade most jobs never reach.

**Recommendation:** Pick one pipeline. Delete the other three. Keep `hybrid` as the spine; delete `smart`, the standalone `dispatcher` agent, and the `serial` fallback. The fan-out subagent pattern stays — it's the only piece that meaningfully parallelizes work — but it should be the *only* downstream of hybrid, not a peer of it.

### 1.2 Discovery is a single-LLM-call gamble

`workers/src/discovery/hybridDiscovery.ts:117-139` — discovery is one OpenRouter call asking for `targetCount × 2` candidate companies in a single JSON response. We diagnosed three failure modes for this in this session alone:

1. **300 s timeout.** `deepseek-v4-pro` on OpenRouter has chain-of-thought reasoning enabled by default; for a 30-candidate JSON output, it routinely takes 4-6 minutes of hidden reasoning before the first output token. Mitigation deployed: switched `DISCOVERY_LLM_MODEL` to `deepseek/deepseek-chat`. **Open question:** the system is one config flip away from the slow path again.
2. **Truncated JSON.** When the model hits `max_tokens` mid-array, parsing fails and the entire candidate list is discarded. Mitigation deployed: `repairTruncatedCandidateArray` salvages whatever completed objects came back. **Open question:** still vulnerable if the *first* candidate is incomplete.
3. **Single-quote JSON.** Some models emit `'candidates'` with single quotes. Mitigation deployed: structural single-quote repair.

The pattern: every failure mode is fixed by a brittle text-level repair on the model's output. The right answer is to **stop putting one LLM call in the critical path**:

- Stream the response so you can salvage partial output without repair acrobatics.
- Or: replace the LLM call with a deterministic registry lookup + LLM ranker. Generating 30 candidate company names is the *easiest* part of the job; we don't need a frontier model to do it.

**Recommendation:** Discovery should be **registry-first, LLM-second**. The seed lists in `workers/src/pipeline/registries/` already cover Nigerian fintech, legal, and manufacturing. The LLM's job becomes "given the user's intent and these 50 candidate companies from the registry, rank the top 30." That call is small (input-bound), fast, and bounded.

### 1.3 Contact extraction is structurally too weak for the market

`workers/src/services/contactExtractor.ts` is the single biggest source of lead-quality complaints. The current strategy:

1. Walk a list of `TEAM_PATHS` (`/team`, `/people`, `/leadership`, ...) on the company's own domain.
2. Scrape headings that match a Title-Case regex.
3. Pattern-infer emails as `firstname.lastname@domain` with confidence 0.4.

This produces the `whoweare@company.com` failure we just fixed: a section heading "Who We Are" passed the regex; "Who" became `firstName`, "We Are" became `lastName`, and `who.weare@company.com` was emitted as a "lead email." Fix deployed (a `NON_NAME_WORDS` blocklist) — but the deeper problem is the strategy itself:

- **Most Nigerian SMEs don't publish team pages.** A team page is a US/Western-Europe convention. The scraper returns 0 contacts for the majority of candidates.
- **Pattern-inferred emails are not emails.** They're guesses. Without SMTP/MX validation downstream, the system has no idea whether `john.smith@acme.com` actually receives mail. The frontend (`LeadDetailDrawer.tsx:119`) presents the confidence as a percentage with no visual distinction between a verified address and a guess — the user reads "40%" as "this email is 40% deliverable" rather than "this is a literal guess."
- **No B2B data source.** The competitors users will compare LeadreAI against (Apollo, ZoomInfo, RocketReach, Lusha, Hunter) have spent years sourcing contact data from logged-in profiles, opt-in forms, and partnership data. LeadreAI's scrape-only approach starts from a fundamentally weaker dataset.

**Recommendation:**

| Tier | Action | Cost | Outcome |
|---|---|---|---|
| 1 | Hunter.io Domain Search API | $49/mo for ~1k domains | Cuts the 50% prune rate to ~15% — Hunter has work-emails-by-domain even when there's no public team page |
| 2 | Apollo.io API or People Data Labs | $99/mo entry tier | Provides named decision-makers + emails for the named-persona queries that are LeadreAI's headline use case |
| 3 | LinkedIn Sales Navigator (manual auth) | $79/mo | The single best source of named contacts; integration is harder but the data is uniquely high quality |
| 4 | MX + SMTP verification (already partially built — `zerobounce-verify.ts`, SMTP RCPT check) | already in code | **Run it on every email before commit, not just optionally**. A pattern-inferred email that fails SMTP RCPT must never be written. |

Without at least Tier 1 and Tier 4, no amount of pipeline cleanup will fix the lead quality complaint. This is the highest-leverage change in the entire audit.

### 1.4 The agent loop is paying for itself only in optimism

`jobAgent.ts:453-571` (`runSerialJobAgent`) is a 100-300 step LLM-driven loop with:

- A 4,000-token system prompt with 12 numbered strategy rules.
- A "two-pass strategy" where the agent is supposed to write a baseline lead, then upgrade it later.
- A "critic" sub-LLM that runs every 5 steps to decide `continue|replan|stop`.
- Per-step JSON parsing with retry-on-failure prompts.

The cost is roughly 100-300 LLM calls per job, each at 45 s timeout, with a critic check every 5 steps adding more. The benefit is that the agent can theoretically pivot mid-run when a strategy isn't working.

In the test run we just observed: the agent made 15 tool calls, the critic told it to "replan" twice (steps 4 and 9), and the final output was 4 leads from 4 candidates — *all* of which came from the dispatcher fallback's candidate list, not from agent-driven discovery. The agent's contribution was the per-company enrichment that the subagents handle. The critic's "replans" were both correct identifications of stuck behavior, but the replan didn't actually change strategy meaningfully — the agent kept trying minor variations.

This pattern is consistent: the agent loop's *cost* is paid every run, but its *gains* show up only in long-tail unusual queries. For demographic queries (which `parsedIntent.queryType` shows is the majority — `demographic_filter` was the type for every job in the recent logs), the deterministic registry → search → enrich pipeline produces equal or better results at 10× lower latency.

**Recommendation:** Demote the agent loop to a fallback. The default path should be:

```
intent → registry lookup → LLM rank candidates → fan-out enrichment subagents
                                                        ↓
                                                  (one subagent per candidate, deterministic)
```

The agent loop survives only for `contact_lookup` queries on a single named entity, where its iterative search-and-refine pattern is genuinely the right tool.

### 1.5 LLM orchestration has too many providers and no cache strategy

The `.env` has 5 different model configurations:
- `ANTHROPIC_MODEL=claude-sonnet-4-6`
- `GOOGLE_MODEL=gemini-2.0-flash-lite`
- `OPENROUTER_MODEL=deepseek/deepseek-v4-pro`
- `DISCOVERY_LLM_MODEL=deepseek/deepseek-chat`
- `CLARIFY_LLM_MODEL=deepseek/deepseek-chat`
- `EMBEDDING_MODEL=nvidia/llama-nemotron-embed-vl-1b-v2:free`

Plus three USE_* toggles (`USE_OPENROUTER`, `USE_GOOGLE`, `USE_LOCAL_LLM`).

Every LLM call site in the codebase has slightly different fallback logic. Some call `aiProvider.ts` (which picks a provider based on USE_*), some call `llmClient.ts` (workers-only, OpenRouter or local LiteLLM), some inline a fetch. There is no cross-call prompt caching beyond what Anthropic does automatically; the same 4,000-token system prompt for the agent loop gets re-billed on every step of every job.

**Recommendation:**
- One **orchestration model** (Anthropic Sonnet — best at tool-using and JSON, with native prompt caching).
- One **extraction model** (DeepSeek V3 Chat or Gemini Flash — cheap, fast, structured output).
- One **embedding model** (whatever you're using — keep it).
- Delete the rest. Delete `USE_GOOGLE`, `USE_LOCAL_LLM`, and the per-call provider gymnastics. Make `aiProvider.ts` and `llmClient.ts` a single client.

### 1.6 Self-improvement logging is theater

The `[thoughts]` log entries (added recently in `validateCandidates.ts`, `contactEnricher.ts`, `leadWriter.ts`, `hybridDiscovery.ts`) record specific suggestions like *"Hunter.io would have prevented this prune"* into worker logs. The intent is right — instrument what the system can't do — but the output goes to stdout and disappears. There is no aggregation, no dashboard, no surface where a human sees "the system flagged 47 prune-rate-due-to-no-public-emails events this week."

**Recommendation:** Either delete the `[thoughts]` entries (cluttering the logs without producing decisions), or wire them to a daily-aggregated `system_observations` collection in Mongo with a small admin view. As-is they're a comment in a log file pretending to be a feedback system.

### 1.7 Schema and data-model issues

`backend/src/models/Lead.ts`:
- `companyDomain` is the unique index (`workspaceId + companyDomain`, sparse). For social-platform-only leads (the recent special-case for Instagram/TikTok-only businesses), this falls through to a `companyName` match — which is fragile across casing variants and minor spelling.
- `emails[].confidence` is a number 0-1 with no semantic meaning. A pattern-inferred email at 0.4 is structurally identical to a scraped contact-page email at 0.4. The frontend has no way to distinguish them.
- `qualificationStatus` and `qualificationScore` exist but no quality gate uses them to decide *whether to deliver the lead at all*. Leads with `qualificationStatus = 'rejected'` are still returned in the dashboard list (the filter is opt-in, not opt-out).

Workers use `mongoose.Schema({}, { strict: false })` (`leadWriter.ts:40`, `contactEnricher.ts:9`) — meaning leads can have any random keys written. The model hallucinations that produced `facts.businessEmail` and `facts.officePhone` (which we patched in `writeLead.ts`) silently survived in the database for an unknown number of historical jobs.

**Recommendations:**
- Add an `emails[].provenance` enum: `{ verified | scraped | pattern_inferred | imported }`. The frontend should render `pattern_inferred` with a "guess" badge and *exclude it from the displayed email count*.
- Treat `strict: false` on Lead/Contact as a bug. Tighten the schema; surface unknown-key writes as warnings.
- Add a `Lead.qualified` boolean derived at write time. The dashboard's default view should show only `qualified=true`. This is the quality gate.

### 1.8 Other structural notes (smaller)

- **BullMQ worker has no `lockDuration` set.** Default is 30 s. Most pipeline steps can exceed 30 s. Lock-renewal is automatic in BullMQ ≥ 4 but worth setting explicitly to avoid silent stalls.
- **`tsbuildinfo` is tracked in git** (`frontend/tsconfig.tsbuildinfo` shows as modified in `git status`). Add to `.gitignore`.
- **Pre-existing TS errors in `sequence.worker.ts`.** They've been ignored in this session's type-checks. Either fix them or `// @ts-expect-error` with a tracking issue.
- **Frontend marketing pages are out of sync with reality** — separate, more detailed plan exists at `~/.claude/plans/fluffy-snuggling-cray.md` covering Salesforce, Slack, Flutterwave, JSON export, Stripe billing, team invites, Zapier. That plan is correct; execute it.

---

## Section 2 — Product Audit

### 2.1 The core promise is not delivered

The marketing copy on `/dashboard` says "Describe who you want to reach. Get a verified lead list in minutes." (`AuthShell.tsx:406`).

The actual user experience as observed in this session:

| User asked for | User got |
|---|---|
| 15 leads | 4 leads (27% of target) |
| Email + phone for each | 2 of 4 had emails; 2 had only phones |
| "Verified" emails | All emails were pattern-inferred or scraped without SMTP verification — including `whoweare@company.com` |
| "In minutes" | The job ran 9 minutes (5 min wasted on hybrid timeout, then 4 min on dispatcher fallback) |

The gap is not 10%; it's 70%. Users will not pay for this experience.

### 2.2 The UI does not surface quality honestly

`LeadDetailDrawer.tsx:119` renders `email.confidence` as `{Math.round(email.confidence * 100)}%`. So a pattern-inferred email guessed from a heading shows as "40%" — the user reads this as "this email is 40% likely to be deliverable" when in fact it has had zero validation of any kind.

This is not a UI polish issue; it's a trust issue. If a user emails `whoweare@company.com` and gets a hard bounce, they conclude LeadreAI's data is unreliable. They will never trust the *good* leads in the same list.

**Recommendation:** Three-tier email presentation:

- **Verified** (green): MX + SMTP RCPT passed. Show without confidence number — it's just "verified."
- **Found** (neutral): Scraped from a public contact page or directory. Show with provenance ("found on /contact").
- **Inferred** (warning, hidden by default): Pattern-derived, never sent through verification. Show only in "show all" mode, with explicit "best guess" framing.

If a lead has only inferred emails, it should not count as a delivered lead. The headline number ("4 of 15") should reflect *qualified* leads only.

### 2.3 No feedback loop, no learning

A user marks a lead as "bad fit" — what happens? Nothing. The next time they search a similar query, the same companies are returned. There is no:
- Workspace-level suppression list of rejected companies
- Industry-level signal that "for *this* user, fintech means lending only, not payments"
- Per-job learning that the agent's first three search queries were unproductive

The marketing positions LeadreAI as "intelligent." Intelligence in a prospecting tool means *not making the same mistake twice*. The current system is amnesiac — every job starts from the same blank state.

**Recommendation:**
1. **Per-lead 👍/👎.** Persist as `Lead.userFeedback`. Suppression of 👎 leads is automatic on next job.
2. **Workspace ICP doc.** A free-text "what kind of leads we want / don't want" that gets prepended to every agent run. Already partially exists via the Library — surface it more prominently.
3. **Job retrospective.** After a job completes, ask the user: "Did we hit the brief?" If no, what was missing? Store the answer; let the LLM read it on the next similar query.

### 2.4 The pricing/credit model doesn't reflect what users care about

Currently 1 credit = 1 dispatch, regardless of leads delivered (`page.tsx:1242`: "A search is one query… Three searches are free."). This means:

- A search that returns 4 leads of 15 requested costs the same as one that returns 15 of 15.
- A search where every lead is junk costs the same as a search where every lead converts.

Users in the early stage will perceive this as "I paid a credit and got nothing useful."

**Recommendation:** Either price per *qualified lead delivered* (only count leads that pass the quality gate), or auto-refund credits when a job delivers <50% of target. The behavior should match the message: "If we don't find them, you don't pay."

### 2.5 The market positioning is slipping

LeadreAI's actual differentiator (per the codebase, the docs, and the working features) is:

- **Citations.** Every lead has source URLs.
- **Editorial UI.** The dashboard is the most distinctive product surface — broadsheet typography, narrative framing.
- **Library + workspace context.** ICP docs that ground the search.

Its weakness:

- **The data is worse than competitors'.**

The strategy that fits: **don't compete on data volume; compete on data trustworthiness.** Apollo gives users 10 unverified contacts; LeadreAI should give users 5 verified, sourced, justified contacts. The "fewer-but-better" position is also the easier engineering goal, because it admits that the all-scrape strategy can't match Apollo's volume.

**Recommendation:** Reposition pricing and product copy around *qualified deliveries* with mandatory verification, even if that means defaulting `targetCount` lower. Showing "5 verified, sourced leads" with green check-marks beats "15 leads, 8 of which we couldn't verify."

### 2.6 Marketing claims that are currently fabricated

(Detail in `~/.claude/plans/fluffy-snuggling-cray.md` — summary here.)

- **Salesforce sync** (pricing page): not built. Schema enum exists; no controller/route.
- **Slack alerts** (pricing page): not built. Campaign DB column exists; nothing fires.
- **Flutterwave payments** (docs): zero code. Paystack and Stripe are wired; Flutterwave is not.
- **JSON export** (docs): backend explicitly rejects `format=json` with a 400.
- **Team invitations** (settings): no backend route.
- **94% email accuracy** (pricing FAQ): unmeasured marketing copy. There is no tracker that would produce this number.
- **"$29/mo" / "$99/mo" tier CTAs** (pricing): Stripe is wired (we just verified Paystack works); but the FAQ promises "cancel any time" without any subscription-management UI.
- **Zapier integration** (docs): forthcoming, framed as available.

These are not just UI bugs; in some jurisdictions they are misrepresentation. Fix the copy *now*, even if you can't ship the features for months. "Coming soon — contact us" is honest. "Cancel any time" without cancellation UI is not.

---

## Section 3 — Recommendations, Prioritized

### Tier 0 — This week (stop the bleeding)

1. **Strip false marketing claims.** Execute the `fluffy-snuggling-cray.md` plan, copy fixes only (B3, B2, A3, B4, B5, A1, A2 minus the implement piece). 90 minutes of work.
2. **Stop counting unverified emails.** In `LeadDetailDrawer.tsx` and the table view, hide `pattern_inferred` emails by default. Show a "show inferred email guesses" toggle. 1-2 hours.
3. **Apply the quality gate at write time.** In `writeLead.ts`, refuse to write a lead unless `emails.length > 0 (verified or scraped) OR phones.length > 0 OR contactSummary.totalContacts > 0`. The pruning logic already deletes leads matching this — move the check upstream to never write them in the first place. 30 minutes.

### Tier 1 — This month (fix the lead-quality engine)

4. **Integrate Hunter.io Domain Search.** New `workers/src/services/hunter.ts`, called by `contactEnricher.ts` *before* the team-page scraper. If Hunter returns ≥ 1 work email for the domain, use it; only fall back to scraping if Hunter returns nothing. Single biggest quality-of-results lever in the codebase. Estimated 1-2 days.
5. **Make SMTP verification mandatory.** `zerobounce-verify.ts` exists but is optional; rewire so every email — Hunter, scraped, or inferred — passes through it before commit. Discard emails that fail SMTP RCPT. 1 day.
6. **Delete the `smart` and `serial` discovery paths.** Keep only `hybrid` → `fan-out`. Reduces `jobAgent.ts` from 572 to ~200 lines. 1 day.
7. **Add 👍/👎 feedback on leads.** Persist; suppress 👎 companies on next workspace job. 1 day backend, 1 day frontend.

### Tier 2 — This quarter (close the gap to competitors)

8. **Apollo.io or People Data Labs integration.** For named-decision-maker queries. ~1 week.
9. **Per-job retrospective.** After a job, prompt the user "did this hit the brief?" and store the answer. Use it as system-prompt context on next similar job. ~3 days.
10. **Replace the agent loop with a deterministic pipeline for demographic queries.** Keep agent for `contact_lookup`. Cuts most jobs from 9 minutes to 60-90 seconds. ~1-2 weeks.
11. **One LLM provider, one model per role.** Sonnet for orchestration, DeepSeek V3 Chat for extraction. Delete Google, local LLM, and unused OpenRouter model envs. ~2 days.
12. **Quality-aware credit pricing.** A job that delivers <50% of target auto-refunds the credit. ~3 days.

### Tier 3 — Strategic (over the next 6 months)

13. **Reposition the product around verified-fewer-but-better leads.** Marketing, pricing, defaults all align. Hardest, highest-leverage cultural change.
14. **Build the suppression / re-discovery system properly.** Cross-workspace anonymized signals: companies that are repeatedly rejected at the directory level get deprioritized in the registry.
15. **Internal data partnership / scraping pipeline.** Curate Nigeria-specific datasets the competitors don't have. This is the only way to *actually* beat Apollo on Nigerian SME data.

---

## Section 4 — Things to delete, not improve

A short list of code that, in the audit's opinion, should be **removed** rather than fixed:

| File / module | Reason |
|---|---|
| `workers/src/pipeline/smartDiscovery.ts` (440 LOC) | Unused fallback; capability subsumed by hybrid |
| `workers/src/pipeline/researchAgent.ts` (197 LOC) | Vestigial; not on any active code path |
| `workers/src/pipeline/jobDispatcher.ts` (146 LOC) | Separate "discovery agent" loop; replaced by hybrid registry-first approach |
| `runSerialJobAgent` in `jobAgent.ts` | Default fallback nobody should hit; kept only for `contact_lookup` queries; extract to its own file with clear naming |
| `aggregatorNameExtractor.ts` + `aiContactExtractor.ts` (one of them) | Two extractors for the same job; pick one |
| All `[thoughts]` log entries | Either operationalize (with aggregation + dashboard) or delete; in current state they're noise |
| `USE_GOOGLE`, `USE_LOCAL_LLM`, `GOOGLE_MODEL`, `LOCAL_LLM_*` envs | Unused or rarely used; one provider is enough |

Codebase reduction estimate: ~2,000 LOC deleted, ~300 LOC modified. Net negative LOC change with no functional regression.

---

## Section 5 — What's actually good

The audit is critical, but the codebase has real strengths that should not get rewritten:

1. **The cost-attribution system** (`runWithCostContext`, `recordLlmCost`) is well-designed — every LLM and SERP call is attributed to a workspace + job via AsyncLocalStorage. Most prospecting tools don't have this granular per-job cost telemetry.
2. **The fan-out subagent pattern** (`jobSubagent.ts`) is the right concurrency model. Don't change it; use it more.
3. **The schema-driven `outputSchema` in `parsedIntent`** lets users request arbitrary columns ("amount_raised", "funding_round") and have the agent fill them in via `facts`. This is genuinely novel and worth doubling down on.
4. **The editorial UI** is unique. Don't redesign it. The frustration users feel is about data quality, not visual design.
5. **The Library / Knowledge Base feature.** ICP docs as agent context is the right product abstraction.
6. **The clarifier flow.** Asking before guessing is the right interaction. Just make it faster (the recent parallel-call fix helps).

---

## Section 6 — Honest limitations of this audit

- This is a static read of the code, not a profiled run. Some of the performance claims (like "the agent loop is paying for itself only in optimism") would benefit from per-job latency and cost telemetry. The infrastructure to gather this exists (cost-attribution); use it.
- The competitive positioning section assumes a market the auditor knows from outside; the user should validate against their actual customer conversations.
- The "delete this code" suggestions are based on call-graph analysis only. Some of those modules may have hidden runtime callers via dynamic dispatch or job-data shapes that weren't visible in static reading.
- The tier estimates ("1 day", "1 week") are rough. Treat them as "hours of focused work for someone with the codebase paged in," not calendar time.

---

**The single most important sentence in this audit:** *Lead quality will not improve until the system has at least one commercial B2B data source and SMTP verification on every email it commits.* Everything else is secondary to that.
