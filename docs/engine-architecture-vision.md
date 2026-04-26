# Prospecting Engine Architecture — Shipped State

> **TL;DR:** The engine is a budget-bounded LLM agent driving a 14-tool research registry with cost-ordered tool preferences, multi-provider search routing, registry-first discovery, and evidence-preserving writes. This doc describes what's in production on the current branch. The prior version of this doc described this same architecture as a *future goal* ("three pillars to ship"); the bulk of that rollout has landed — what remains is enumerated at the bottom under **Remaining Gaps**.

Last updated: 2026-04-21. If you're modifying `workers/src/pipeline/`, the code is authoritative — this doc explains the *why*.

---

## What The Engine Is

A user submits a natural-language prospecting query. The backend persists a `ProspectingJob` with a parsed intent (`parsedIntent`) and an optional custom output schema (`outputSchema`), then enqueues a BullMQ job. A worker picks it up and invokes `runJobAgent` (`workers/src/pipeline/jobAgent.ts`).

From that point on, the engine is **not a pipeline**. It's a loop:

```
system prompt (tool menu, strategy rules, budget)
  ↓
user prompt (parsed intent + raw query + outputSchema)
  ↓
┌─────────────────────────────────────────────────┐
│  LLM turn → {thought, tool, args} or {done}     │
│    ↓                                             │
│  execute tool → short text output ← to LLM      │
│    ↓                                             │
│  every 5 turns: critic reviews transcript,       │
│    may STOP or inject REPLAN feedback            │
└─────────────────────────────────────────────────┘
  ↺ until target_reached | wall_clock | max_steps | agent_done | error
  ↓
return leads written so far (via write_lead)
```

The LLM is the planner. The registry is the actuator. Everything else (budget, critic, publisher, deduplicator) is supervision.

---

## The Tool Registry

`workers/src/pipeline/tools/index.ts` declares a 14-entry registry, **ordered intentionally by cost tier**. The order is rendered verbatim into the agent's system prompt as `renderToolMenu()`, and the system prompt instructs the agent to prefer earlier tools. This ordering encodes the cost hierarchy:

| Tier | Tools | Purpose |
|---|---|---|
| 1. Library | `read_document` | Search the workspace's uploaded docs first — grounds the run in the user's own ICP, pitch deck, portfolio notes |
| 2. Discovery | `list_companies`, `lookup_registry` | Registry-first: curated seed lists + Wikipedia categories + OpenCorporates. Often eliminates 50–80% of SERP calls on demographic queries |
| 3. Search | `search_web`, `fetch_url`, `fetch_file`, `get_file_chunk`, `transcribe_url`, `scrape_page` | SERP (multi-provider), HTML fetch, PDF/DOCX/XLSX/OCR ingestion, audio transcription, and Playwright scrape as the last-resort |
| 4. Enrichment | `extract_names_from_urls`, `permute_email`, `verify_email` | Named-contact extraction + email pattern generation + MX/SMTP verification |
| 5. Scoring / finalize | `score_lead`, `write_lead` | Write the evidence-backed record; never fabricate |

Key architectural properties of the registry:

- **Cheap tools always precede expensive ones in the prompt.** The agent is told explicitly ("rule 3: cheap first") to exhaust Library + Discovery + Search before reaching for `scrape_page`.
- **`write_lead` is upsertable on `(workspaceId, companyDomain)`.** The agent's two-pass strategy depends on this: pass 1 writes a baseline record with a generic email + phone; pass 2 re-writes with a named decision-maker when/if found. The writer merges strictly-better fields.
- **Every `write_lead` call is evidence-backed.** The tool rejects fabricated names and requires a source reference. Per-lead `facts[]` (custom output columns) carry `{value, unit?, sourceUrl, confidence, raw?}` — provenance is first-class.

---

## Discovery: Multi-Source + Registry-First

Discovery is the layer where the old linear pipeline was weakest ("Google-only"). The shipped architecture has two routers that abstract discovery over many providers.

### Search Providers — `pipeline/searchProviders/`

| Provider | Role |
|---|---|
| `brave.ts` | Primary for high-volume demographic searches (flat rate, generous quota) |
| `serper.ts` | Secondary for Google-equivalent result quality |
| `serpapi.ts` | Tertiary; used when structured sitelinks/knowledge-graph matter |
| `router.ts` | Round-robins / fails-over based on quota + response health |
| `queryCache.ts` | 24h Redis cache on `(normalized_query, provider)` → result set — repeat queries cost zero |

### Registry Providers — `pipeline/registryProviders/`

The `list_companies` tool is registry-first. It queries:

| Source | File | Strength |
|---|---|---|
| Curated seed lists | `seedList.ts` | Hand-curated lists per `(country, industry)` — highest confidence, slowest to grow |
| Wikipedia categories | `wikipedia.ts` | Fetches and parses `Category:X_companies_of_Y` to yield dozens of named companies with Wikidata domains |
| OpenCorporates | `registries/opencorporates.ts` | Statutory registry data for hard-to-find SMB and regulated entities |
| Router | `registryProviders/router.ts` | Merges + de-duplicates across the above, honoring `tags` filters (e.g. `mid-tier`, `startup`) |

When `list_companies` returns enough candidates, the agent skips straight to enrichment. When it doesn't, the agent falls through to `search_web`. This fall-through — not a hand-written dork template — is the main cost lever.

---

## The Agent Loop (Planning, Execution, Control)

### System prompt

`buildSystemPrompt` in `jobAgent.ts` injects:

1. The rendered tool menu (with cost-ordered comments).
2. The response format contract (exactly one JSON object per turn — `{thought, tool, args}` or `{thought, done, summary}`).
3. **Strategy rules** — notably:
   - Rule 2: discovery-first, search-second for demographic queries.
   - Rule 4: two-pass strategy (baseline `write_lead` before named-contact enrichment).
   - Rule 7: never fabricate; reject UI chrome as contact names (rule 8).
   - Rule 10: Library (`read_document`) is the true first call whenever the user's own docs might ground the query.
   - Rule 11: audio transcription for founder-interview / conference-talk queries.
   - Rule 12: filetype dorks + `fetch_file` for known document formats (annual reports, attendee lists, filings).
4. **Budget**: step cap + wall-clock in seconds, both interpolated into the prompt so the agent can self-pace.

### Turn loop

`runJobAgent` runs up to `maxSteps` iterations. Each turn:

- Calls the LLM (`callLlm` → OpenRouter or local LLM per env, `response_format: json_object`, 45s timeout).
- Parses strictly — malformed JSON is fed back as a user-role correction prompt rather than crashing the run.
- Invalid tool names → feed back the valid-tool list; no abort.
- Valid tool → `executeTool` dispatches to the registry handler. Tool result becomes the next user-role message: `Tool X result (ok=true/false): <short text>`.
- Publishes a `{type: 'activity', stage: 'agent', tool, thought}` event to Redis `job:progress:{jobId}`, forwarded over SSE to the browser.
- Every `CRITIC_INTERVAL = 5` turns, runs a separate critic LLM call with the last 10 messages and `leadsSoFar.length` vs. `targetCount`. Critic can:
  - Return `continue` (no action).
  - Return `stop` → loop exits as `agent_done`.
  - Return `replan` + a `suggestion` → injected as a user-role message `CRITIC FEEDBACK: …` before the next turn.

### Termination

Six exit conditions, tracked as `stopReason`:

| Reason | Trigger |
|---|---|
| `target_reached` | `ctx.leadsSoFar.length >= targetCount` |
| `wall_clock` | Elapsed time exceeds per-job budget from `wallClockBudget.ts` |
| `max_steps` | Step cap reached (`min(300, max(100, 100 + target × 4))`) |
| `agent_done` | Model returned `{done: true, summary}` or critic returned `stop` |
| `error` | LLM call failed after retries, or LLM not configured |

Every termination still returns whatever `leadsSoFar` contains — partial results are first-class. The two-pass strategy above is specifically designed to make partial results *useful*: by the time any exit fires, every discovered company already has a baseline record.

---

## Budget, Critic, and Graceful Degradation

Three distinct safeguards layered on top of the loop:

1. **Wall-clock budget** — `wallClockBudget.ts::estimateWallClockMs(parsedIntent)` computes a per-job ms budget from `targetCount`, `queryType`, and `desiredFields`. Published with every job start so operators can see it.
2. **Step cap** — `min(ABSOLUTE_MAX_STEPS=300, max(BASE_MAX_STEPS=100, 100 + target × STEPS_PER_LEAD=4))`. Floor of 100 was raised from 30 after observing small-target jobs (e.g. `targetCount=5`) run out of steps at 50 while still productively enriching.
3. **Critic every 5 turns** — a second, smaller LLM call that reviews transcript + progress and can stop or replan. Prevents stuck loops ("keep calling `search_web` on variants of the same query"). Feedback is injected in-channel, not as a hard override.

The two-pass baseline-then-upgrade strategy (rule 4) is the graceful-degradation story at the agent level: the loop can be killed at any point after step ~10 and still produce a table of rows with generic contact data. Named-decision-maker enrichment is "upgrade on the way out."

---

## Provenance & Evidence Discipline

Every write the agent makes preserves source:

- **`Lead.sources[]`** — URLs, source types, scraped-at timestamps, confidence per source.
- **`Lead.rawSnippets[]`** — verbatim text the agent saw.
- **`Lead.facts[]`** (new per commit `c17bffa`) — custom columns from the job's `outputSchema`, each a `{key, value, unit?, sourceUrl, confidence, raw?}`.
- **`Lead.emails[].source` + `confidence`** — whether an address came from a page, a PDF, SMTP-probed pattern, or inferred.
- **`Lead.phones[].source`** — same for phone numbers.

This is what makes the product sellable to regulated/auditable buyers. The agent is explicitly disallowed from writing a row it can't justify from tool output it observed this turn (system prompt rule 7). The downstream commercial move is **Evidence Graph Exports** — see `2026-04-21-b2b-sellability-roadmap.md` Phase 12 proposal.

---

## Verification

The verification layer (pillar 3 of the prior vision) is partially done:

- **Email** — `tools/verifyEmail.ts` wraps `permute_email` patterns through syntax → MX → SMTP-RCPT-TO. Standard 3-tier stack. **Gap:** catch-all detection. Currently any 250-OK is counted as verified; domains with accept-all SMTP produce misleading `verified: true` labels. Priority fix.
- **Phone** — `pipeline/phoneNormalizer.ts` uses `libphonenumber-js` with country hint from parsed intent. Normalizes to E.164, classifies `FIXED_LINE`/`MOBILE`/`FAX`. Missing country → degraded.
- **Cross-source confidence boost** — not implemented. Same email found in ≥2 independent sources should bump confidence; currently we keep max confidence per source.
- **Domain-level verification** — WHOIS / DNS / SSL enrichment is in `osintEnricher.ts` and runs per unique domain. Gives us nameservers, registrar, issuer, and SAN-revealed sibling domains.

---

## Concurrency & Scaling

The agent loop is **serial within a job** — one LLM turn at a time, 45s timeout per turn, ~5–15s typical latency. For jobs with `targetCount = 50+`, that's 5–25 minutes per job.

Worker-level concurrency: `env.WORKER_CONCURRENCY` (typically 3) concurrent jobs per worker process. The bottleneck is not CPU — it's the serial agent loop inside each job.

The forward-looking fix — **multi-agent parallel fan-out** (dispatcher agent does discovery, N per-company subagents do enrichment in parallel) — is the highest-leverage performance change on the roadmap. Proposed as Phase 14 in `2026-04-21-b2b-sellability-roadmap.md`. It also materially improves demo-time perception: 20-min batch job → 2-min "magic" job.

---

## Cost

The shipped engine **does not yet report per-job cost**. We have:

- Step count per job (`stepsUsed` in `JobAgentResult`).
- Wall-clock duration (from pub/sub start/complete events).
- Tool-call telemetry (via `logger.info('[jobAgent] tool call', ...)`).

We do **not** have aggregated per-job:

- LLM tokens × model × cache-hit status.
- SERP calls split by provider.
- File fetches split by cached vs. fresh.
- Transcription minutes.
- Page scrapes.

Closing this gap is **Phase 13** on the sellability roadmap and is treated there as a commercial blocker, not merely an internal concern. "Predictable per-job cost" is the single enterprise question neither Apollo nor Clay answers crisply.

---

## Remaining Gaps

Called out explicitly so new engineers don't rediscover them as surprises.

1. **Catch-all email detection** (see Verification above). `verify_email` over-reports success on catch-all domains. Commercial trust issue.
2. **Per-job cost telemetry** (see Cost above). Blocker for enterprise deals.
3. **Parallel per-company enrichment.** Serial agent loop is the throughput ceiling. Dispatcher + subagent fan-out is the architectural fix (Phase 14).
4. **Non-English registry coverage.** `list_companies` leans on Wikipedia categories + OpenCorporates + curated seed lists, all English-skewed. Weak for non-Anglophone markets — material for EU/LATAM/JP buyers.
5. **Proxy rotation in `scrape_page`.** The agent is told to avoid aggregator domains, which works most of the time. Cloudflare-/bot-protected sites that aren't aggregators will eventually get the worker rate-banned. `BuildPlan.md` listed `proxy-agent` as optional; that call should be revisited before a large customer runs scrape-heavy queries.
6. **Deduplication depth.** Two-pass: exact domain + fuzzy company name via `fuse.js`. Rebrands, acquisitions, holding-company/subsidiary cases, and law-firm/marketing-domain shared-domain cases leak through.
7. **Rank-score calibration.** The composite score from `ranker.ts` is plausible but unvalidated against reply-rate data. Until campaigns produce feedback loops (see `2026-04-21-campaign-system-plan.md`), treat it as a completeness score in the UI, not a predictive quality signal.

---

## Non-Goals (Unchanged)

- **Not** building a LinkedIn scraper — ToS risk, brittle selectors. We read LinkedIn *public* company pages via `fetch_url` as any other page; we don't authenticate and we don't scrape profile pages.
- **Not** competing with Apollo on US B2B coverage. Different game; different moat. See the sellability roadmap's positioning section.
- **Not** supporting every country registry on day one. Depth in 1–3 target geographies beats shallow global.
- **Not** removing SERP from the stack. Search is a first-class tool in the registry — the change from the prior era is that it's *one of many* sources, cost-ordered behind Library and Discovery.

---

## Reference: Pipeline Files

Current, as of 2026-04-21. For the old linear-pipeline file references, see the 2026-04-18 snapshot in git history — those files are largely still present but many are no longer on the hot path.

### Agent core

| File | Role |
|---|---|
| `workers/src/pipeline/jobAgent.ts` | The agent loop: system prompt, turn loop, critic, budget enforcement, termination reasons |
| `workers/src/pipeline/intentParser.ts` | Parses the raw NL query into `ParsedIntent`; called before the agent starts |
| `workers/src/pipeline/wallClockBudget.ts` | Per-job wall-clock budget estimation |

### Tool registry (entry point + 14 tools)

| File | Role |
|---|---|
| `workers/src/pipeline/tools/index.ts` | `TOOL_REGISTRY`, `executeTool`, `renderToolMenu` — the registry itself |
| `tools/readDocument.ts` | Library tier — workspace doc search |
| `tools/listCompanies.ts` | Discovery tier — registry-first candidate list |
| `tools/lookupRegistry.ts` | Discovery tier — targeted registry query |
| `tools/searchWeb.ts` | Search tier — multi-provider SERP |
| `tools/fetchUrl.ts` | Search tier — HTTP fetch of a page |
| `tools/fetchFile.ts` | Search tier — PDF/DOCX/XLSX/CSV/OCR ingestion with chunk cache |
| `tools/transcribeUrl.ts` | Search tier — audio/video transcription |
| `tools/scrapePage.ts` | Search tier (last-resort) — Playwright headless scrape |
| `tools/extractNamesFromUrls.ts` | Enrichment tier — named-contact extraction from SERP URL snippets |
| `tools/permuteEmail.ts` | Enrichment tier — common email patterns for a given `{domain, first, last}` |
| `tools/verifyEmail.ts` | Enrichment tier — syntax + MX + SMTP-RCPT-TO |
| `tools/scoreLead.ts` | Scoring — per-lead completeness/quality score |
| `tools/writeLead.ts` | Finalize — upsert on `(workspaceId, companyDomain)`, evidence-preserving |

### Discovery sources

| File | Role |
|---|---|
| `pipeline/searchProviders/{brave,serper,serpapi}.ts` | Per-provider SERP clients |
| `pipeline/searchProviders/router.ts` | Multi-provider routing + fallback |
| `pipeline/searchProviders/queryCache.ts` | 24h Redis cache on normalized queries |
| `pipeline/registryProviders/{seedList,wikipedia}.ts` | Curated + Wikipedia-category discovery |
| `pipeline/registryProviders/router.ts` | Registry merge + dedup + tag filtering |
| `pipeline/registries/opencorporates.ts` | OpenCorporates API adapter |

### Post-write / OSINT

| File | Role |
|---|---|
| `pipeline/osintEnricher.ts` | Per-domain WHOIS / DNS / SSL / LinkedIn public |
| `pipeline/emailDetector.ts` | Legacy email detection + MX checks (used by `verify_email`) |
| `pipeline/phoneNormalizer.ts` | `libphonenumber-js` normalization |
| `pipeline/deduplicator.ts` | Two-pass dedup (exact domain + fuzzy name) |
| `pipeline/ranker.ts` | Composite rank score |
| `pipeline/contactEnricher.ts` | Contact-level enrichment post-lead-write |
| `pipeline/aiContactExtractor.ts` | LLM-based contact extraction from HTML |
| `pipeline/aggregatorNameExtractor.ts` | Extract names from aggregator-site SERP URLs without scraping the paywalled content |

### Utilities

| File | Role |
|---|---|
| `workers/src/utils/llmClient.ts` | `callLlm` — OpenRouter / local-LLM abstraction with timeouts and JSON mode |
| `workers/src/services/transcription.ts` | Transcription backend (used by `transcribe_url`) |
| `workers/src/services/notificationEmitter.ts` | Job-completion notifications to the frontend |

---

## What Changed From The Prior Version Of This Doc

The prior version (undated, pre-2026-04-21) framed this architecture as a **future state** reached through "three pillars shipped in order." Those pillars have mostly landed:

- **Pillar 1 — LLM contact extraction.** Shipped as `pipeline/aiContactExtractor.ts` + `tools/extractNamesFromUrls.ts`.
- **Pillar 2 — Per-lead research agent.** Shipped as the whole `jobAgent.ts` loop + tool registry. The agent acts per-job, not strictly per-lead, but the original spirit — "each candidate company gets treated like a human analyst treats a lead" — holds through the two-pass strategy.
- **Pillar 3 — Multi-source discovery + real verification.** Multi-source discovery is done (search-provider router + registry-provider router + file + audio). Verification is partial — catch-all detection and cross-source confidence boost remain open (see Remaining Gaps).

The prior "cost model," "success metrics," and "rollout" sections described a speculative future. They're removed here because we now have lived production and speculation is no longer the right framing. Per-job cost telemetry (Phase 13 on the sellability roadmap) will replace the speculative cost model with actual numbers once shipped.
