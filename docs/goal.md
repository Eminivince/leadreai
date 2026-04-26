# LeadreAI — Product Goal

_Date: 2026-04-22 · Status: draft, awaiting review + amendment_

This doc is the **single source of truth** for what we're building and why. When other docs disagree with this one, this one wins and they get updated or deleted.

It is intentionally opinionated. It is intentionally short. Where I've made assumptions you might want to change, open questions are listed at the bottom — edit freely.

---

## 1. What LeadreAI Is, in One Sentence

> **A programmable B2B data platform — pluggable data sources, flexible tables, evidence-preserving outputs, and an AI research agent that can drive the whole thing — focused on markets where big databases have thin coverage.**

Everything below elaborates, sharpens, or bounds that sentence.

**Previous framing** (superseded 2026-04-22): "An AI research agent that turns a natural-language brief into an evidence-backed lead table, with enough outreach automation built in to close the loop." This is still accurate as a *slice* of the product, but the broader positioning is the data platform.

---

## 2. Who It's For

**Primary — Agencies.**
Lead-gen agencies, outbound-as-a-service shops, B2B research consultancies. They run custom research projects for multiple clients, need repeatable workflows, want audit-grade outputs, and are priced on *quality of deliverable* more than raw volume. They already pay $800–$2k/month for Clay and similar tools. We win them by being better at markets Clay is thin on + having the outreach loop built in.

**Secondary — Solo researchers, founders, small outbound teams.**
The "I need a junior researcher but can't hire one" audience. 1–5 seats. Runs 2–10 research projects a month. Cost-sensitive but willing to pay for time saved. Typically targeting a specific market the big databases cover poorly.

**Tertiary — Regulated-industry research teams.**
Legal DD, financial services compliance, policy / government affairs, procurement research. Highest ACV, smallest volume. Adopt us specifically because we preserve evidence all the way through exports — something Clay and Apollo cannot do cleanly.

**Explicitly NOT for:**
- US B2B SDR teams with Apollo / ZoomInfo / Outreach already in place — different game, we'd lose on data breadth and sequencing depth.
- Consumer-contact use cases — retailers looking for customer lists, B2C demand-gen agencies. Targeting *private individuals* by inferred consumer intent is refused.
- Anyone looking for a Chrome extension or browser-based scraping tool. We're server-side.

**On LinkedIn specifically:** data that is publicly visible on LinkedIn (profiles or company pages, individual or company) is treated as public research data — we use it like any other public source. We do not authenticate / log in, we do not scrape walled content, and we do not ship a client-side LinkedIn scraper.

---

## 3. The Core Loop (What a User Does, End-to-End)

1. **Describe** a research target in natural language.
2. **Clarify** — the AI asks up to 6 sharpening questions. User answers what they want, skips the rest. A policy guardrail refuses the query if it falls outside B2B research norms, and suggests reframes.
3. **Dispatch** — an agent runs against a registry of tools in cost order (workspace library → discovery registries → SERP → file / audio / scrape), producing a table where every cell is evidence-backed and traceable.
4. **Refine** — the user inspects the table, verifies a spot sample via the cell-level source links, edits or tags as needed.
5. **Save as a Skill** (optional) — turn this research task into a reusable, shareable template.
6. **Launch a campaign** — pick a file of leads, author a sequence (with optional AI per-send personalization), activate. The system handles send windows, daily caps, suppression, unsubscribes.
7. **Receive outcomes in-app** — replies pause the sequence, bounces suppress the recipient, the dashboard shows cumulative sends / replies / bounces per campaign.
8. **Export with provenance** — when needed, export to formats that preserve every source URL.
9. **Rerun** the saved Skill next month with updated parameters — new data, same framework.

Six to nine steps, depending on how much the user engages. Steps 1–3 produce value on their own. Steps 4–9 are the expansion surface.

---

## 4. The Architectural Foundation

Three primitives underlie everything else. Every feature should strengthen or compose at least one of these.

### 4.1 — Research agent, not static database
Not a row in a table we bought and resold. A planned loop of tool calls against live sources, bounded by a per-job step + wall-clock budget, writing only what can be justified from observed tool output.

### 4.2 — Evidence graph
Every fact on a lead — name, email, phone, funding amount, custom column — carries `{sourceUrl, confidence, scrapedAt}`. Exports preserve it. The UI surfaces it. The product is legible because the reasoning is legible.

### 4.3 — Cost bounded and visible
Every job has a known cap. Every job reports what it actually cost. Customers should never be surprised by a bill, and should always be able to tell their own clients "this query cost $X" with receipts.

### 4.4 — Programmable data source registry
Every external data provider (Apollo, Hunter, ZeroBounce, SerpAPI, our own built-ins) is a first-class citizen in a pluggable registry. Per-workspace credentials (BYOK for licensed providers, metered-through-us for commoditized ones). Every invocation is logged with input, output, latency, status, cost. Users compose sources into table columns; the agent composes them into research loops. Adding a new provider is a single file + registry entry.

This primitive is what lets us rival Clay: the same data-source layer that makes Clay programmable, with our agent + evidence + cost primitives already attached.

These four together are what makes the product sellable to agencies (reusable workflows + BYOK economics), to regulated buyers (provenance + invocation log), and to enterprise procurement (cost predictability).

---

## 5. What Makes Us Different (in Plain Competitive Terms)

| Competitor | Their strength | Where we win |
|---|---|---|
| **Apollo / ZoomInfo** | Broad US B2B coverage | Markets they undercover (African fintech, EU SMB, niche verticals, regulated industry) + live research on-demand |
| **Clay** | Arbitrary columns with provenance | Registry-first discovery for thin-coverage markets + native outreach loop (Clay requires export-to-other-tool) + audio/file as first-class research |
| **Outreach / Salesloft / Lemlist** | Mature sequencing + deliverability | Combined with research; we don't have to win sequencing depth, we just have to be "enough" to close the loop |
| **Hunter / Snov.io** | Quick email finders | Not competing — they're point tools, we're a workflow |

**The one-line competitive positioning:**

> Clay for markets Apollo doesn't cover, with the outreach loop built in.

---

## 6. Product Principles (How We Decide When It's Unclear)

These are the decision rules for the ambiguous cases. When a choice presents itself and the spec doesn't answer it, these do.

### 6.1 — Evidence over inference
If the agent can't justify a value from tool output, it doesn't write it. "Probably has this email" is a worse output than "don't know." Evidence-only is non-negotiable.

### 6.2 — Bounded cost over unbounded quality
A job that takes 25 minutes and produces a marginally better table than one that takes 3 minutes is still the wrong choice. Predictability beats asymptotic quality.

### 6.3 — Reframe over refuse
When we can't honor a query (policy, capability, scope), we explain why and suggest how to reframe it. A flat "no" is lazy.

### 6.4 — Small user burden over big-bang automation
A 30-second clarifier dialog that saves 10 minutes of wasted research is worth it. An "autopilot" that runs wrong for an hour isn't. Ask; don't guess silently.

### 6.5 — Structured sources over brittle scraping
Registries, filings, directories, APIs, public PDFs — these are durable. Rendering a React page with anti-bot defenses is a last resort. The tool registry is ordered accordingly.

### 6.6 — Workflow scale over contact scale
We price and position around "how often you run this" rather than "how many contacts you pull." Skills-per-month, jobs-per-week, recurring-research is the unit of value, not contact count.

### 6.7 — Agency-scale from day one
Multi-client workspaces, per-client reporting, white-label exports, Skills as distribution units — these aren't upsells. They're foundational because agencies are the primary ICP.

---

## 7. What We're NOT Building

Called out explicitly so we don't accidentally drift. Anything here needs a deliberate product decision to move into scope.

- **Consumer contact harvesting**. Ever. The guardrail refuses. This is a legal, ethical, and data-quality commitment.
- **Sensitive-attribute targeting** (health, religion, politics, sexuality, immigration status). Same.
- **A Chrome extension**. Not planned.
- **A full competitor to Outreach on sequencing depth**. We do "enough" — multi-step, send windows, suppression, reply-pause. We don't do A/B splits, branching workflows, call scripts, dialers.
- **Per-contact pricing**. Apollo-style metered contacts is the wrong commercial model for a workflow product.
- **Mobile apps**. The product is desk work; mobile is out of scope.
- **A marketplace for human researchers** (Clay-style "managed tables"). We build the tool; customers or their agencies run it.

---

## 8. The Shape of "Done" — Three Horizons

### Horizon 1 — Launch-ready (0–3 months)
A single agency can run their entire week's client work on LeadreAI without reaching for other tools.

**Measurable:**
- Onboard on Monday, three distinct client research projects by Friday.
- A job's cost is visible and predictable before and after each run.
- Researched leads flow into a campaign that sends, handles replies / bounces, and shows outcomes in-app.
- Exports preserve provenance for clients who ask.

**Currently in flight (as of 2026-04-22):**
- Campaign system M1–M4 (core loop) — ✅ shipped.
- Clarifier + policy guardrail — ✅ shipped.
- Cost explainer — planned (Phase 13).
- Research Skills v0 — planned (Phase 11).
- Evidence-graph exports — planned (Phase 12).
- Inbound reply correlation — outstanding gap.
- Parallel fan-out — planned (Phase 14), performance not correctness.

### Horizon 2 — Retention + scale (3–9 months)
Agencies extend into their teams' everyday workflow. Regulated-industry teams start adopting.

**Measurable:**
- Skills published / installed across workspaces, with attribution.
- Proof-bundle exports used by ≥ 5 customers (proxy for regulated-industry adoption).
- Jobs-per-week per workspace trends up (customers get value from running more).
- Multi-client agency workspaces used by ≥ 3 customers with ≥ 3 clients each.

**Likely builds:**
- Skills marketplace v1 (shareable, with light attribution).
- Agency mode (multi-client workspaces, white-label exports, client-facing dashboards).
- Reply classification (positive/out-of-office/bounce).
- Saved searches / trigger automation (scheduled Skills).
- HubSpot sync re-shipped (only if customer demand justifies).

### Horizon 3 — Platform + upmarket (9–24 months)
LeadreAI becomes a layer other tools integrate with. Enterprise deals close.

**Measurable:**
- Public API with real customers using it (not just scripts).
- Enterprise-grade trust stack: SSO/SAML, SCIM, audit retention, data residency.
- At least one second SKU (Signal Monitor, Enrichment API, etc.) in production.
- Skills marketplace with paid / shared-revenue Skills from external authors.

**Likely builds:**
- Full Phase 9 (enterprise admin / billing / API).
- Buying-signal monitoring as its own SKU (Phase 10 territory).
- TAM / territory planning workspaces.
- Connector framework for third-party CRM / data.

Nothing in Horizon 3 is a commitment — it's a fork. Some of these happen, some get replaced by things we learn from Horizon 2 customers.

---

## 9. Commercial Shape

### The pricing philosophy
- **Charge for workflow value, not contact volume.** Seats + included credits + credits for heavy work.
- **Keep agency + white-label features paid.** They're the high-ACV segment.
- **Reserve SSO / audit / residency for enterprise.** Standard tiering.
- **Do not charge per contact.** That's Apollo's model; wrong shape for on-demand research.

### Draft tiers (placeholder, not binding)
| Tier | Target buyer | Draft price |
|---|---|---:|
| **Team** | Small outbound teams | $349 / mo |
| **Growth** | Serious outbound teams | $999 / mo |
| **Agency** | Lead-gen agencies | $1,999 / mo |
| **Enterprise** | Larger B2B orgs / regulated teams | Custom, $4k–8k / mo+ |

Specific feature gating is downstream — the gating should follow from which primitives each tier unlocks (Skills publish, evidence exports, multi-client, API, etc.).

---

## 10. Open Questions for Amendment

Please edit / decide / push back on these before we regenerate the roadmap.

1. **Is agencies truly primary?** The alternative is leading with solo researchers for simpler UX / faster PLG. Each implies different priorities. Agencies primary.

2. **Do we want the regulated-industry segment at all?** High ACV but slow sales cycles, different product demands (SSO, audit retention, data residency). Could be a distraction from the primary B2B agency play. B2B.

3. **"Enough" sequencing or more?** Today we're shipping multi-step + send window + suppression + pause-on-reply. Do we go deeper (A/B splits, branching, call scripts) or keep this surface thin on purpose? thin on purpose

4. **Skills: shareable copies (our current design) or live-linked (update upstream → downstream sees changes)?** Each is a different product.

5. **HubSpot sync — re-ship now, defer indefinitely, or kill entirely?** Currently reverted on this branch; the old roadmap treated it as Phase 1. re-ship now.

6. **Inbound reply handling — own it (IMAP + webhook) or defer to customer's own tools?** Deep commitment either way. figure out best approach.

7. **"Markets Apollo doesn't cover" — which ones do we claim?** I've been using Africa / EU SMB / niche verticals as placeholder. Are we committing to any of those specifically, or is that still directional? Africa.

8. **Build-versus-integrate on evidence exports.** Full in-house PDF rendering + proof bundles is ~1 week of work. Alternative: export JSON and let customers use their own report tooling. First is premium-feeling, second is faster to ship. First.

9. **Is there a "no-AI mode" we should support?** Some buyers fundamentally distrust LLM output. Could we ship a "template-only" path for them? Or do we own the position that AI is the product? AI is the product.

10. **Are we okay with being opinionated about queries we refuse?** The guardrail refuses consumer-targeting queries. Some customers will push back — is the refusal policy a principle we defend or a setting they can override? Principle we defend.

---

## 11. Working Definition of "Success"

Not measurable KPIs (those are per-horizon above). Just the feeling we want the product to produce.

- A user types a brief and gets a table. The table is correct. They know why each cell is there.
- They run the same brief next quarter. The workspace has learned — they don't start from scratch.
- They launch a campaign and replies show up. The system pauses what should be paused.
- When a client asks "where did this lead come from?", the user can click once and answer.
- When a CFO asks "what did this cost us?", the user can click once and answer.

If all five of these are true for most users, the product is working.

---

## Process Note

Once this doc is amended to your satisfaction, we:
1. Rebuild the roadmap docs against it (consolidate v1 + v2 + phase specs into a single clean tree).
2. Delete anything that contradicts it (old roadmaps, stale phase docs, the campaign plan once its work is absorbed into the new roadmap).
3. Cross-link every downstream spec back to the relevant section of this doc, so every choice is traceable to a stated goal.

Until then, this is a draft. Mark sections you want changed and we iterate.

---

## Decisions Log

Live record of settled product/architecture decisions. Oldest first.

### 2026-04-22 — Data source platform (Clay-parity)

Framed in Phase 15 spec at `docs/sellability_road_map/phase-15-data-source-platform.md`. Five decisions locked in:

1. **Credential model**: **BYOK** for licensed providers (Apollo, ZoomInfo, Crunchbase, any future paid-tier integration); **metered-through-us** for commoditized ones we already aggregate (SerpAPI, Brave, Serper). Simplest legal, lowest adoption friction, marketplace-metering layers on later.

2. **Agent integration**: **Hybrid**. Data sources auto-register as agent tools (the agent's tool menu becomes a view over the data source registry, per-workspace). The primary user-facing surface is explicit per-row / per-column enrichment through tables, not agent-driven-only.

3. **Table shape**: **Add `DataTable`** alongside `Lead`. Rows typed (`company` | `person` | `url` | `custom`). Columns user-defined. Agent-produced `Lead` records continue to work, but the richer workflow is table-based.

4. **Waterfalls** (source A → source B → source C fallback per column): **deferred to v2**. v1 = one source per column.

5. **Column formulas / expression language**: **deferred to v2 (safe subset) / v3 (fuller)**. v1 = a column references at most one other column of the same row as its input.

### 2026-04-22 — LinkedIn policy

Public LinkedIn data — profiles or company pages, individual or organization — is treated as public research data. We use it like any other public source. We do not authenticate / log in, do not scrape walled content, do not ship a client-side LinkedIn scraper. The guardrail refuses consumer-contact-harvesting queries regardless of data source; LinkedIn is not the discriminator.
