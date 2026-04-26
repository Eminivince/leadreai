# Agent-Orchestrated Pipeline (Full Refactor)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Replace the 700-line procedural pipeline in `intentParser.ts` with a top-level AI agent that orchestrates tool calls. Every existing primitive (SERP, scrape, registry lookup, domain guess, email permutation, MX verification) becomes a tool the agent composes per-query. No more hardcoded dork templates, aggregator-regex patterns, or per-query-type branching.

**Architecture:** ReAct loop, one agent per job. System prompt describes tools + completion criteria. Agent picks tool → we execute → result feeds back. Every 5 steps a critic checkpoint reviews progress. Agent emits leads directly via `write_lead` tool; when `targetCount` is reached or budget exhausted, the job ends.

**Tech Stack:** Unchanged — `env.OPENROUTER_MODEL` (nvidia nemotron), OpenRouter API, existing Playwright/Cheerio/ioredis/Mongo. No new deps.

**Rollout:** Big-bang — replace `intentParser.ts` body entirely. Old helpers (pageScraper, serpScraper, aiContactExtractor, etc.) stay as implementation details behind tools. Hardcoded dork builders, heuristicFilter, entityWebsiteFinder become dead code (can be deleted in a follow-up PR).

**Reference:** `docs/engine-architecture-vision.md`

---

## File Map

| File | Change |
|------|--------|
| `workers/src/pipeline/tools/index.ts` | **New.** Tool registry + shared types (`ToolHandler`, `ToolContext`, `ToolDef`). |
| `workers/src/pipeline/tools/scrapePage.ts` | **New.** Wraps `runPageScraper` for single URLs + includes LLM extraction output. |
| `workers/src/pipeline/tools/lookupRegistry.ts` | **New.** Wraps `opencorporates.enrichEntity`. |
| `workers/src/pipeline/tools/guessDomains.ts` | **New.** Wraps `domainGuesser.guessCompanyDomains`. |
| `workers/src/pipeline/tools/extractNamesFromUrls.ts` | **New.** Wraps `aggregatorNameExtractor.collectAggregatorNames`. |
| `workers/src/pipeline/tools/scoreLead.ts` | **New.** Wraps `leadScorer.scoreLeadRelevance`. |
| `workers/src/pipeline/tools/writeLead.ts` | **New.** Persists a lead, publishes SSE, dedupes in-memory. |
| `workers/src/pipeline/tools/searchWeb.ts` | Modify: accept `ToolContext` shape, support engine + site restrict. |
| `workers/src/pipeline/tools/fetchUrl.ts` | Modify: accept `ToolContext` shape (no logic change). |
| `workers/src/pipeline/tools/permuteEmail.ts` | Modify: accept `ToolContext` shape (no logic change). |
| `workers/src/pipeline/tools/verifyEmail.ts` | Modify: accept `ToolContext` shape (no logic change). |
| `workers/src/pipeline/jobAgent.ts` | **New.** Top-level agent loop + critic. |
| `workers/src/pipeline/intentParser.ts` | **Shrink.** 700 → ~80 lines. Delegates everything to `jobAgent`. |

---

### Task 1: Tool layer — registry + wrappers

**Files:**
- Create: `workers/src/pipeline/tools/index.ts`
- Create: `workers/src/pipeline/tools/scrapePage.ts`
- Create: `workers/src/pipeline/tools/lookupRegistry.ts`
- Create: `workers/src/pipeline/tools/guessDomains.ts`
- Create: `workers/src/pipeline/tools/extractNamesFromUrls.ts`
- Create: `workers/src/pipeline/tools/scoreLead.ts`
- Create: `workers/src/pipeline/tools/writeLead.ts`
- Modify: `workers/src/pipeline/tools/searchWeb.ts`
- Modify: `workers/src/pipeline/tools/fetchUrl.ts`
- Modify: `workers/src/pipeline/tools/permuteEmail.ts`
- Modify: `workers/src/pipeline/tools/verifyEmail.ts`

**Context:** Unified tool contract. Every tool accepts `(args, ctx) => Promise<ToolResult>`. The `ctx` carries per-job state (jobId, workspaceId, publisher, parsedIntent, in-memory lead cache). `ToolResult` has a short `output` string (fed back to the LLM) and optional `meta` (our own telemetry). Tool results MUST be <4KB serialized — this prevents the agent's context window from exploding.

The registry exports a `TOOL_REGISTRY: ToolDef[]` array. Each `ToolDef` has `{name, description, parametersJsonSchema, handler}`. `jobAgent.ts` consumes this to render the system-prompt tool menu and to dispatch calls.

- [ ] **Step 1: Create `workers/src/pipeline/tools/index.ts`**

```typescript
import { Redis } from 'ioredis';
import type { ParsedIntent } from '@leadreai/shared';
import type { LeadRecord } from '../deduplicator.js';

export interface ToolContext {
  jobId: string;
  workspaceId: string;
  publisher: Redis;
  parsedIntent: ParsedIntent;
  leadsSoFar: LeadRecord[];       // mutable — write_lead pushes here
  pagesScrapedThisJob: Set<string>; // dedupe scrapes across the job
}

export interface ToolResult {
  ok: boolean;
  output: string;                 // short text fed back to the LLM (<4KB)
  meta?: Record<string, unknown>; // telemetry only, never shown to LLM
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolHandler = (args: any, ctx: ToolContext) => Promise<ToolResult>;

export interface ToolDef {
  name: string;
  description: string;           // one-line summary for the prompt
  parametersSchema: string;      // JSON-ish schema as a single string, rendered in prompt
  handler: ToolHandler;
}

// Re-export handlers from individual tool files
import { searchWebTool } from './searchWeb.js';
import { fetchUrlTool } from './fetchUrl.js';
import { scrapePageTool } from './scrapePage.js';
import { lookupRegistryTool } from './lookupRegistry.js';
import { guessDomainsTool } from './guessDomains.js';
import { extractNamesFromUrlsTool } from './extractNamesFromUrls.js';
import { permuteEmailTool } from './permuteEmail.js';
import { verifyEmailTool } from './verifyEmail.js';
import { scoreLeadTool } from './scoreLead.js';
import { writeLeadTool } from './writeLead.js';

export const TOOL_REGISTRY: ToolDef[] = [
  searchWebTool, fetchUrlTool, scrapePageTool, lookupRegistryTool,
  guessDomainsTool, extractNamesFromUrlsTool, permuteEmailTool,
  verifyEmailTool, scoreLeadTool, writeLeadTool,
];

export function renderToolMenu(): string {
  return TOOL_REGISTRY.map(t =>
    `- ${t.name}(${t.parametersSchema}) — ${t.description}`
  ).join('\n');
}

export async function executeTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any,
  ctx: ToolContext,
): Promise<ToolResult> {
  const def = TOOL_REGISTRY.find(t => t.name === name);
  if (!def) return { ok: false, output: `unknown tool: ${name}. Valid tools: ${TOOL_REGISTRY.map(t => t.name).join(', ')}` };
  try {
    return await def.handler(args ?? {}, ctx);
  } catch (err) {
    return { ok: false, output: `tool threw: ${err instanceof Error ? err.message : String(err)}` };
  }
}
```

- [ ] **Step 2: Refactor existing tools (searchWeb, fetchUrl, permuteEmail, verifyEmail)**

Each needs to export a `ToolDef` matching the new shape. Existing underlying functions stay, we wrap them.

**`workers/src/pipeline/tools/searchWeb.ts`** — REPLACE existing exports. Keep the current `searchWeb(query, site?, limit?)` helper, but also export `searchWebTool`:

```typescript
import { runSerpSearch, runMultiEngineSearch } from '../serpScraper.js';
import type { ToolDef } from './index.js';
import { logger } from '../../utils/logger.js';

export interface WebResult {
  url: string;
  title: string;
  snippet: string;
}

export async function searchWeb(query: string, site?: string, limit = 5): Promise<WebResult[]> {
  const fullQuery = site ? `${query} site:${site}` : query;
  try {
    const results = await runSerpSearch([fullQuery]);
    return results.slice(0, limit).map(r => ({ url: r.url, title: r.title, snippet: r.snippet }));
  } catch (err) {
    logger.warn('[searchWeb] failed', { query: fullQuery, err: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

export const searchWebTool: ToolDef = {
  name: 'search_web',
  description: 'Run a web search. Use site:X restriction to target a specific domain. Returns up to 8 url/title/snippet triples.',
  parametersSchema: '{"query": string, "site"?: string, "engines"?: ("google"|"bing"|"duckduckgo")[]}',
  handler: async (args) => {
    const q = String(args?.query ?? '').trim();
    if (!q) return { ok: false, output: 'query required' };
    const site = args?.site ? String(args.site) : undefined;
    const engines = Array.isArray(args?.engines) ? args.engines : undefined;
    const fullQ = site ? `${q} site:${site}` : q;
    const results = engines
      ? await runMultiEngineSearch([fullQ], { engines, sufficientCount: 8 })
      : await runSerpSearch([fullQ]);
    const compact = results.slice(0, 8).map(r => ({ url: r.url, title: r.title, snippet: r.snippet }));
    return { ok: true, output: JSON.stringify(compact), meta: { count: compact.length } };
  },
};
```

**`workers/src/pipeline/tools/fetchUrl.ts`** — add `fetchUrlTool` export after existing code:

```typescript
// (keep existing imports + fetchUrl function)
import type { ToolDef } from './index.js';

export const fetchUrlTool: ToolDef = {
  name: 'fetch_url',
  description: 'Fetch a specific URL (no JS execution). Returns short preview of text, plus emails/phones/JSON-LD extracted.',
  parametersSchema: '{"url": string}',
  handler: async (args) => {
    const url = String(args?.url ?? '').trim();
    if (!url.startsWith('http')) return { ok: false, output: 'absolute URL required' };
    const r = await fetchUrl(url);
    return {
      ok: r.status > 0 && r.status < 400,
      output: JSON.stringify({
        status: r.status,
        emails: r.emails,
        phones: r.phones,
        jsonLdCount: r.jsonLd.length,
        bodyTextPreview: r.bodyText.slice(0, 1800),
      }),
    };
  },
};
```

**`workers/src/pipeline/tools/permuteEmail.ts`** — add `permuteEmailTool` export after existing code:

```typescript
// (keep existing code above)
import type { ToolDef } from './index.js';

export const permuteEmailTool: ToolDef = {
  name: 'permute_email',
  description: 'Generate up to 12 common email patterns for a domain, optionally scoped to a named person. You MUST verify_email each pattern before emitting as a contact.',
  parametersSchema: '{"domain": string, "firstName"?: string, "lastName"?: string}',
  handler: async (args) => {
    const domain = String(args?.domain ?? '').trim();
    if (!domain) return { ok: false, output: 'domain required' };
    const patterns = permuteEmail(domain, args?.firstName, args?.lastName);
    return { ok: true, output: JSON.stringify(patterns) };
  },
};
```

**`workers/src/pipeline/tools/verifyEmail.ts`** — add `verifyEmailTool` at the end. Existing `verifyEmail` function stays untouched:

```typescript
// (existing code above — unchanged)
import type { ToolDef } from './index.js';

export const verifyEmailTool: ToolDef = {
  name: 'verify_email',
  description: 'Verify an email via MX lookup (+ SMTP probe if reacher.email is configured). Returns { hasMx, verdict }.',
  parametersSchema: '{"address": string}',
  handler: async (args) => {
    const address = String(args?.address ?? '').trim();
    if (!address.includes('@')) return { ok: false, output: 'valid email required' };
    const result = await verifyEmail(address);
    return { ok: true, output: JSON.stringify(result) };
  },
};
```

- [ ] **Step 3: Create `workers/src/pipeline/tools/scrapePage.ts`**

```typescript
import { chromium } from 'playwright';
import { runPageScraper } from '../pageScraper.js';
import type { ToolDef } from './index.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

export const scrapePageTool: ToolDef = {
  name: 'scrape_page',
  description: 'Deep scrape a URL with a headless browser + LLM contact extraction. Heavy (~10-30s). Use sparingly on high-signal pages only.',
  parametersSchema: '{"url": string}',
  handler: async (args, ctx) => {
    const url = String(args?.url ?? '').trim();
    if (!url.startsWith('http')) return { ok: false, output: 'absolute URL required' };
    if (ctx.pagesScrapedThisJob.has(url)) {
      return { ok: true, output: JSON.stringify({ cached: true, reason: 'already scraped in this job' }) };
    }
    ctx.pagesScrapedThisJob.add(url);

    try {
      const results = await runPageScraper(
        [{ url, title: '', snippet: '', isFilePath: false }],
        ctx.publisher,
        ctx.jobId,
      );
      const page = results[0];
      if (!page) return { ok: false, output: 'scrape returned nothing' };
      return {
        ok: true,
        output: JSON.stringify({
          url: page.url,
          companyName: page.companyName,
          linkedinUrl: page.linkedinUrl,
          extractedContacts: page.extractedContacts,
          rawEmailCount: page.emails.length,
          rawPhoneCount: page.phones.length,
          textPreview: page.pageText.slice(0, 800),
        }),
        meta: { contactsFound: page.extractedContacts.length },
      };
    } catch (err) {
      logger.warn('[scrapePageTool] failed', { url, err: err instanceof Error ? err.message : String(err) });
      return { ok: false, output: `scrape failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};

// Keep a singleton browser launched lazily — repeatedly launching/closing is expensive
// (not implemented in v1; runPageScraper already handles its own browser lifecycle)
void chromium; // suppress unused import warning — runPageScraper handles Playwright
void env;
```

- [ ] **Step 4: Create `workers/src/pipeline/tools/lookupRegistry.ts`**

```typescript
import { enrichEntity } from '../registries/opencorporates.js';
import type { ToolDef } from './index.js';

export const lookupRegistryTool: ToolDef = {
  name: 'lookup_registry',
  description: 'Look up a company in the OpenCorporates global business registry. Returns registered name, address, and officer names. Excellent source of director names when you need emails via permute_email.',
  parametersSchema: '{"name": string, "country"?: string}',
  handler: async (args) => {
    const name = String(args?.name ?? '').trim();
    if (!name) return { ok: false, output: 'name required' };
    const country = args?.country ? String(args.country) : undefined;
    const result = await enrichEntity(name, country);
    if (!result) return { ok: true, output: JSON.stringify({ found: false }) };
    return {
      ok: true,
      output: JSON.stringify({
        found: true,
        name: result.name,
        companyNumber: result.companyNumber,
        jurisdictionCode: result.jurisdictionCode,
        registeredAddress: result.registeredAddress,
        officers: result.officers.slice(0, 10),
      }),
    };
  },
};
```

- [ ] **Step 5: Create `workers/src/pipeline/tools/guessDomains.ts`**

```typescript
import { guessCompanyDomains } from '../domainGuesser.js';
import type { ToolDef } from './index.js';

export const guessDomainsTool: ToolDef = {
  name: 'guess_domains',
  description: 'Given a company name (and optional country), produce ranked candidate domain strings. Combine with verify_email to find which ones have MX records.',
  parametersSchema: '{"entity": string, "country"?: string}',
  handler: async (args) => {
    const entity = String(args?.entity ?? '').trim();
    if (!entity) return { ok: false, output: 'entity required' };
    const country = args?.country ? String(args.country) : undefined;
    const candidates = guessCompanyDomains(entity, country);
    return { ok: true, output: JSON.stringify({ candidates }) };
  },
};
```

- [ ] **Step 6: Create `workers/src/pipeline/tools/extractNamesFromUrls.ts`**

```typescript
import { extractAggregatorName } from '../aggregatorNameExtractor.js';
import type { ToolDef } from './index.js';

export const extractNamesFromUrlsTool: ToolDef = {
  name: 'extract_names_from_urls',
  description: 'Given a list of URLs, extract person names embedded in aggregator profile paths (zoominfo, rocketreach, contactout, datanyze, linkedin). Free signal — no network calls.',
  parametersSchema: '{"urls": string[]}',
  handler: async (args) => {
    const urls: string[] = Array.isArray(args?.urls) ? args.urls : [];
    const names = urls
      .map(u => extractAggregatorName(u))
      .filter((n): n is NonNullable<typeof n> => n !== null);
    const deduped = new Map<string, typeof names[0]>();
    for (const n of names) {
      const key = n.fullName.toLowerCase();
      if (!deduped.has(key)) deduped.set(key, n);
    }
    return {
      ok: true,
      output: JSON.stringify([...deduped.values()]),
      meta: { count: deduped.size },
    };
  },
};
```

- [ ] **Step 7: Create `workers/src/pipeline/tools/scoreLead.ts`**

```typescript
import { scoreLeadRelevance } from '../leadScorer.js';
import type { ToolDef } from './index.js';
import type { LeadRecord } from '../deduplicator.js';

export const scoreLeadTool: ToolDef = {
  name: 'score_lead',
  description: 'Score a lead candidate against the user query (AI relevance check). Returns {score 0-1, isVerified, reason}. Use before write_lead to filter noise.',
  parametersSchema: '{"companyName": string, "companyDomain": string, "emails": [{address,type,confidence}], "phones": [{raw}], "topContactName"?: string, "topContactTitle"?: string}',
  handler: async (args, ctx) => {
    const stub: LeadRecord = {
      workspaceId: ctx.workspaceId,
      jobId: ctx.jobId,
      companyName: String(args?.companyName ?? ''),
      companyDomain: String(args?.companyDomain ?? ''),
      industry: ctx.parsedIntent.industry,
      address: {
        country: ctx.parsedIntent.geography?.country ?? undefined,
        city: ctx.parsedIntent.geography?.city ?? undefined,
        state: ctx.parsedIntent.geography?.state ?? undefined,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emails: (args?.emails ?? []) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      phones: (args?.phones ?? []) as any,
      socialProfiles: undefined,
      osint: {} as Record<string, unknown>,
      sources: [],
      rawSnippets: [],
      rankScore: 0,
      completenessScore: 0,
      isDuplicate: false,
      tags: [],
    };
    const result = await scoreLeadRelevance(stub, ctx.parsedIntent);
    return {
      ok: true,
      output: JSON.stringify(result),
      meta: { score: result.score, isVerified: result.isVerified },
    };
  },
};
```

- [ ] **Step 8: Create `workers/src/pipeline/tools/writeLead.ts`**

```typescript
import type { ToolDef } from './index.js';
import type { LeadRecord } from '../deduplicator.js';
import { logger } from '../../utils/logger.js';

export const writeLeadTool: ToolDef = {
  name: 'write_lead',
  description: 'Commit a lead to the job results. Deduplicates on companyDomain + primary email within this job. Call this ONLY for leads you are confident in (ideally after score_lead returns isVerified:true).',
  parametersSchema: '{"companyName": string, "companyDomain": string, "website"?: string, "emails": [{address,type?,confidence,name?,title?,department?,source?}], "phones": [{raw,normalized?,source?}], "topContact"?: {fullName,title?,seniority?}, "rankScore"?: number, "sources"?: [{url,type?}], "reasoning"?: string}',
  handler: async (args, ctx) => {
    const companyName = String(args?.companyName ?? '').trim();
    const companyDomain = String(args?.companyDomain ?? '').trim().toLowerCase().replace(/^www\./, '');
    if (!companyName || !companyDomain) return { ok: false, output: 'companyName and companyDomain required' };

    const primaryEmail = Array.isArray(args?.emails) && args.emails[0]?.address ? String(args.emails[0].address).toLowerCase() : '';
    const dedupeKey = `${companyDomain}|${primaryEmail}`;
    if (ctx.leadsSoFar.some(l => `${l.companyDomain}|${(l.emails[0]?.address ?? '').toLowerCase()}` === dedupeKey)) {
      return { ok: true, output: JSON.stringify({ skipped: true, reason: 'duplicate in this job' }) };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emails = Array.isArray(args?.emails) ? args.emails.map((e: any) => ({
      address: String(e.address ?? '').toLowerCase().trim(),
      type: (e.type ?? (e.name ? 'business' : 'generic')) as 'business' | 'generic',
      confidence: Math.max(0, Math.min(1, Number(e.confidence ?? 0.6))),
      source: String(e.source ?? 'ai_extracted'),
      name: e.name ? String(e.name) : undefined,
      title: e.title ? String(e.title) : undefined,
      department: e.department ? String(e.department) : undefined,
    })).filter((e: { address: string }) => e.address.includes('@')) : [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const phones = Array.isArray(args?.phones) ? args.phones.map((p: any) => ({
      raw: String(p.raw ?? ''),
      normalized: p.normalized ? String(p.normalized) : undefined,
      type: p.type ? String(p.type) : undefined,
      countryCode: p.countryCode ? String(p.countryCode) : undefined,
      source: String(p.source ?? 'ai_extracted'),
    })).filter((p: { raw: string }) => p.raw) : [];

    const lead: LeadRecord = {
      workspaceId: ctx.workspaceId,
      jobId: ctx.jobId,
      companyName,
      companyDomain,
      website: args?.website ? String(args.website) : `https://${companyDomain}`,
      industry: ctx.parsedIntent.industry,
      address: {
        country: ctx.parsedIntent.geography?.country ?? undefined,
        city: ctx.parsedIntent.geography?.city ?? undefined,
        state: ctx.parsedIntent.geography?.state ?? undefined,
      },
      emails,
      phones,
      socialProfiles: undefined,
      osint: { viaAgent: true } as Record<string, unknown>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sources: Array.isArray(args?.sources) ? args.sources.map((s: any) => ({
        url: String(s.url ?? ''),
        type: (s.type ?? 'scraped_page') as 'scraped_page',
        scrapedAt: new Date(),
        confidence: 0.6,
      })) : [],
      rawSnippets: [],
      rankScore: Math.max(0, Math.min(100, Number(args?.rankScore ?? 70))),
      completenessScore: 0,
      isDuplicate: false,
      tags: ['agent_emitted'],
      contactSummary: args?.topContact ? {
        totalContacts: 1,
        topContact: {
          fullName: String(args.topContact.fullName ?? ''),
          title: String(args.topContact.title ?? ''),
          seniority: String(args.topContact.seniority ?? ''),
        },
      } : undefined,
    };

    ctx.leadsSoFar.push(lead);

    await ctx.publisher.publish(
      `job:progress:${ctx.jobId}`,
      JSON.stringify({ type: 'progress', leadsFoundSoFar: ctx.leadsSoFar.length }),
    );
    await ctx.publisher.publish(
      `job:progress:${ctx.jobId}`,
      JSON.stringify({
        type: 'activity', stage: 'agent', ts: Date.now(),
        title: `Agent emitted lead: ${companyName}`,
        meta: { domain: companyDomain, emails: emails.length, phones: phones.length, reasoning: args?.reasoning },
      }),
    );

    logger.info('[writeLead] lead emitted by agent', {
      jobId: ctx.jobId, companyName, companyDomain, emailCount: emails.length, phoneCount: phones.length,
    });

    return {
      ok: true,
      output: JSON.stringify({
        written: true,
        totalLeadsSoFar: ctx.leadsSoFar.length,
        targetCount: ctx.parsedIntent.targetCount,
      }),
    };
  },
};
```

- [ ] **Step 9: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -40`
Expected: No errors. If errors reference `LeadRecord` missing fields, check `deduplicator.ts` for the canonical type and adjust tools to match.

- [ ] **Step 10: Commit**
```bash
git add workers/src/pipeline/tools/
git commit -m "feat: unified tool registry + new tool wrappers (scrapePage, lookupRegistry, guessDomains, extractNamesFromUrls, scoreLead, writeLead)"
```

---

### Task 2: `jobAgent.ts` — top-level ReAct loop with critic

**Files:**
- Create: `workers/src/pipeline/jobAgent.ts`

**Context:** The agent replaces ALL procedural orchestration. Given `parsedIntent` and `ctx`, it runs a ReAct loop with the full tool registry until either `ctx.leadsSoFar.length >= targetCount` or budget exhausted. Every 5 tool calls, a critic is invoked: it inspects progress, decides continue/replan/stop, and may inject guidance into the history.

Budget: 30 tool calls max, 5 minutes wall-clock, 20k tokens per LLM call.

- [ ] **Step 1: Create the file**

```typescript
import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import type { ParsedIntent } from '@leadreai/shared';
import type { LeadRecord } from './deduplicator.js';
import {
  TOOL_REGISTRY, executeTool, renderToolMenu,
  type ToolContext,
} from './tools/index.js';

export interface JobAgentInput {
  jobId: string;
  workspaceId: string;
  parsedIntent: ParsedIntent;
  publisher: Redis;
}

export interface JobAgentResult {
  leads: LeadRecord[];
  stepsUsed: number;
  stopReason: 'target_reached' | 'max_steps' | 'wall_clock' | 'agent_done' | 'error';
  transcript: string[];
}

const MAX_STEPS = 30;
const MAX_WALL_MS = 5 * 60 * 1000;
const LLM_TIMEOUT_MS = 25_000;
const CRITIC_INTERVAL = 5;

type HistoryMsg = { role: 'system' | 'user' | 'assistant'; content: string };

function buildSystemPrompt(): string {
  return `You are an autonomous lead-research agent. Given a user query, you drive a tool-using research process that ends with one or more qualified leads written via the write_lead tool.

## Available tools

${renderToolMenu()}

## Response format

On every turn, respond with EXACTLY ONE JSON object matching one of these shapes (no markdown, no prose, no code fences):

  { "thought": "…", "tool": "<tool_name>", "args": {…} }
    → Call one tool. Thought is private (for your own reasoning).

  { "thought": "…", "done": true, "summary": "…" }
    → Stop. Use when you have already written enough leads via write_lead, or when further work is futile.

## Core strategy

1. PLAN briefly before your first action. What does the user want? How many? What fields?
2. Cheap first: lookup_registry, guess_domains, search_web, extract_names_from_urls, verify_email — these are fast & low-cost. Exhaust these before scrape_page (heavy).
3. For a named-entity query ("find contacts at <company>"): start with lookup_registry + guess_domains + verify_email to pin down the real domain and officers. Use search_web for aggregator profile URLs and extract_names_from_urls to mine names. Then permute_email + verify_email for each name on the real domain. write_lead per verified contact.
4. For a demographic query ("find 50 <role> at <industry> in <geo>"): use search_web to find candidate companies, score each via quick search before committing to scrape_page. Loop.
5. Never fabricate data. Only write_lead records you can justify from tool output you've seen.
6. Watch your budget (${MAX_STEPS} tool calls, ${MAX_WALL_MS / 1000}s wall-clock). Prefer cheap tools. Don't scrape aggregator domains (zoominfo.com, rocketreach.co, contactout.com, signalhire.com, datanyze.com, apollo.io, hunter.io, lusha.com) — they're paywalled junk; use extract_names_from_urls on their SERP URLs instead.

## Completion criteria

You must stop when either:
- You have written \`targetCount\` leads via write_lead, OR
- No further productive action remains (emit done:true)

Return ONLY JSON. No markdown fences.`;
}

function buildInitialUserPrompt(intent: ParsedIntent): string {
  const parts = [
    `Query type: ${intent.queryType}`,
    `Target count: ${intent.targetCount}`,
    `Industry: ${intent.industry}`,
    `Geography: ${JSON.stringify(intent.geography)}`,
    `Desired fields: ${intent.desiredFields.join(', ') || '(none specified → any business contact data)'}`,
    `Keywords: ${intent.keywords?.join(', ') || '(none)'}`,
  ];
  if (intent.namedEntities?.length) {
    parts.push(`Named entities: ${intent.namedEntities.join(', ')}`);
  }
  parts.push(`\nWhat is your first action? Plan briefly in the "thought" field, then call one tool.`);
  return parts.join('\n');
}

async function callLLM(history: HistoryMsg[]): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://leadreai.app',
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        messages: history,
        max_tokens: 1200,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM status ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    return json?.choices?.[0]?.message?.content ?? '{}';
  } finally {
    clearTimeout(timeout);
  }
}

async function runCritic(history: HistoryMsg[], ctx: ToolContext): Promise<string | null> {
  const criticHistory: HistoryMsg[] = [
    {
      role: 'system',
      content: `You are a research-quality critic. Review the agent's progress so far and decide whether to continue, replan, or stop.

Respond with exactly one JSON object:
  { "decision": "continue" | "replan" | "stop", "reasoning": "…", "suggestion"?: "…" }

Decide:
- continue: agent is making progress, no intervention needed
- replan: agent is stuck or wasting budget — include "suggestion" pointing to a better strategy
- stop: agent has enough data OR further work is futile`,
    },
    {
      role: 'user',
      content: `Target: ${ctx.parsedIntent.targetCount} leads. Written so far: ${ctx.leadsSoFar.length}. Recent agent activity:\n${history.slice(-10).map(m => `[${m.role}] ${m.content.slice(0, 400)}`).join('\n\n')}`,
    },
  ];
  try {
    const raw = await callLLM(criticHistory);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse(raw) as any;
    logger.info('[jobAgent][critic]', { decision: parsed?.decision, reasoning: parsed?.reasoning });
    if (parsed?.decision === 'stop') return 'STOP';
    if (parsed?.decision === 'replan' && parsed?.suggestion) {
      return `REPLAN: ${parsed.suggestion}`;
    }
  } catch (err) {
    logger.warn('[jobAgent][critic] failed', { err: err instanceof Error ? err.message : String(err) });
  }
  return null;
}

export async function runJobAgent(input: JobAgentInput): Promise<JobAgentResult> {
  const { jobId, workspaceId, parsedIntent, publisher } = input;

  if (!env.OPENROUTER_API_KEY) {
    logger.error('[jobAgent] OPENROUTER_API_KEY missing — cannot run');
    return { leads: [], stepsUsed: 0, stopReason: 'error', transcript: ['missing API key'] };
  }

  const ctx: ToolContext = {
    jobId, workspaceId, publisher, parsedIntent,
    leadsSoFar: [],
    pagesScrapedThisJob: new Set<string>(),
  };

  const history: HistoryMsg[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildInitialUserPrompt(parsedIntent) },
  ];
  const transcript: string[] = [];
  const startedAt = Date.now();
  const targetCount = parsedIntent.targetCount;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (ctx.leadsSoFar.length >= targetCount) {
      logger.info('[jobAgent] target reached', { step, leads: ctx.leadsSoFar.length });
      return { leads: ctx.leadsSoFar, stepsUsed: step, stopReason: 'target_reached', transcript };
    }
    if (Date.now() - startedAt > MAX_WALL_MS) {
      logger.info('[jobAgent] wall-clock budget exhausted', { step });
      return { leads: ctx.leadsSoFar, stepsUsed: step, stopReason: 'wall_clock', transcript };
    }

    let raw: string;
    try {
      raw = await callLLM(history);
    } catch (err) {
      logger.warn('[jobAgent] LLM call failed', { step, err: err instanceof Error ? err.message : String(err) });
      return { leads: ctx.leadsSoFar, stepsUsed: step, stopReason: 'error', transcript };
    }
    transcript.push(`[${step}] ← ${raw.slice(0, 400)}`);
    history.push({ role: 'assistant', content: raw });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      history.push({ role: 'user', content: 'Your previous response was not valid JSON. Return exactly one JSON object per the system prompt.' });
      continue;
    }

    if (parsed?.done === true) {
      logger.info('[jobAgent] agent signaled done', { step, leads: ctx.leadsSoFar.length, summary: parsed.summary });
      return { leads: ctx.leadsSoFar, stepsUsed: step, stopReason: 'agent_done', transcript };
    }

    const toolName = parsed?.tool;
    if (!toolName || !TOOL_REGISTRY.find(t => t.name === toolName)) {
      history.push({
        role: 'user',
        content: `Your response must include "tool": "<one of ${TOOL_REGISTRY.map(t => t.name).join(', ')}>" or "done": true. Try again.`,
      });
      continue;
    }

    logger.info('[jobAgent] tool call', { step, tool: toolName, thought: parsed.thought?.slice(0, 200) });
    await publisher.publish(
      `job:progress:${jobId}`,
      JSON.stringify({
        type: 'activity', stage: 'agent', ts: Date.now(),
        title: `Agent step ${step + 1}: ${toolName}`,
        meta: { thought: parsed.thought?.slice(0, 200) },
      }),
    );

    const toolResult = await executeTool(toolName, parsed.args ?? {}, ctx);
    transcript.push(`[${step}] → ${toolName} → ${toolResult.output.slice(0, 300)}`);
    history.push({ role: 'user', content: `Tool ${toolName} result (ok=${toolResult.ok}):\n${toolResult.output}` });

    // Critic checkpoint
    if ((step + 1) % CRITIC_INTERVAL === 0 && ctx.leadsSoFar.length < targetCount) {
      const criticVerdict = await runCritic(history, ctx);
      if (criticVerdict === 'STOP') {
        logger.info('[jobAgent] critic stopped run', { step, leads: ctx.leadsSoFar.length });
        return { leads: ctx.leadsSoFar, stepsUsed: step, stopReason: 'agent_done', transcript };
      }
      if (criticVerdict?.startsWith('REPLAN:')) {
        history.push({ role: 'user', content: `CRITIC FEEDBACK: ${criticVerdict.slice(7).trim()}` });
      }
    }
  }

  logger.info('[jobAgent] max steps reached', { leads: ctx.leadsSoFar.length });
  return { leads: ctx.leadsSoFar, stepsUsed: MAX_STEPS, stopReason: 'max_steps', transcript };
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -40`
Expected: No errors.

- [ ] **Step 3: Commit**
```bash
git add workers/src/pipeline/jobAgent.ts
git commit -m "feat: top-level JobAgent — ReAct loop with critic, replaces procedural pipeline"
```

---

### Task 3: Rewire `intentParser.ts` — big-bang cutover

**Files:**
- Modify: `workers/src/pipeline/intentParser.ts`

**Context:** The whole 700-line procedural body gets replaced with: (1) load job doc, (2) dispatch JobAgent, (3) dedup/rank/write results, (4) cleanup. The existing helpers (pageScraper, serpScraper, aiContactExtractor, entityResolver, opencorporates, domainGuesser, aggregatorNameExtractor, leadScorer) stay — they're imported by the tool wrappers. Dead files (heuristicFilter, entityWebsiteFinder, queryBuilder, leadQualifier) stay on disk for this PR — they can be deleted in a follow-up.

The agent writes leads directly via `write_lead` tool, so `intentParser.ts` just needs to forward those leads to the existing `deduplicateLeads` + `rankLeads` + `writeLeads` pipeline for final persistence/ranking.

- [ ] **Step 1: Replace `workers/src/pipeline/intentParser.ts` contents**

```typescript
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';
import { JOB_STATUSES } from '@leadreai/shared';
import type { ParsedIntent } from '@leadreai/shared';
import { deduplicateLeads } from './deduplicator.js';
import { rankLeads } from './ranker.js';
import { writeLeads } from './leadWriter.js';
import { runJobAgent } from './jobAgent.js';

const prospectingJobSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId },
    status: { type: String, enum: JOB_STATUSES },
    parsedIntent: { type: mongoose.Schema.Types.Mixed },
    progress: {
      percentage: { type: Number, default: 0 },
      currentStage: { type: String, default: '' },
      stagesComplete: [String],
      leadsFoundSoFar: { type: Number, default: 0 },
    },
    error: { message: String, stack: String, stage: String },
    startedAt: Date,
    activityLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true, strict: false },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ProspectingJob: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['ProspectingJob'] as mongoose.Model<any> | undefined) ??
  mongoose.model('ProspectingJob', prospectingJobSchema);

async function pushProgress(
  jobId: string,
  publisher: Redis,
  status: string,
  percentage: number,
  stage: string,
): Promise<void> {
  await ProspectingJob.findByIdAndUpdate(jobId, {
    status,
    'progress.percentage': percentage,
    'progress.currentStage': stage,
    $push: { 'progress.stagesComplete': stage },
  });
  await publisher.publish(
    `job:progress:${jobId}`,
    JSON.stringify({ type: 'status', status, percentage, stage }),
  );
}

export async function runIntentParser(
  jobId: string,
  workspaceId: string,
  publisher: Redis,
): Promise<void> {
  logger.info('[Pipeline] Starting job (agent-orchestrated)', { jobId, workspaceId });

  await ProspectingJob.findByIdAndUpdate(jobId, {
    status: 'parsing',
    startedAt: new Date(),
    'progress.percentage': 3,
    'progress.currentStage': 'parsing',
  });
  await publisher.publish(
    `job:progress:${jobId}`,
    JSON.stringify({ type: 'status', status: 'parsing', percentage: 3, stage: 'parsing' }),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobDoc = await ProspectingJob.findById(jobId).lean() as any;
  if (!jobDoc) throw new Error(`Job ${jobId} not found`);
  const parsedIntent = jobDoc.parsedIntent as ParsedIntent;
  if (!parsedIntent) throw new Error(`Job ${jobId} has no parsedIntent`);

  logger.info('[Pipeline] parsedIntent loaded', {
    jobId, queryType: parsedIntent.queryType,
    industry: parsedIntent.industry, targetCount: parsedIntent.targetCount,
  });

  await pushProgress(jobId, publisher, 'collecting', 10, 'jobAgentStart');

  // ── AGENT OWNS THE PIPELINE ───────────────────────────────────────────
  const agentResult = await runJobAgent({
    jobId, workspaceId, parsedIntent, publisher,
  });

  logger.info('[Pipeline] JobAgent finished', {
    jobId,
    leadsEmitted: agentResult.leads.length,
    stepsUsed: agentResult.stepsUsed,
    stopReason: agentResult.stopReason,
  });

  // ── Dedup + Rank + Persist ───────────────────────────────────────────
  await pushProgress(jobId, publisher, 'deduplicating', 85, 'deduplication');
  const deduped = deduplicateLeads(agentResult.leads);

  await pushProgress(jobId, publisher, 'deduplicating', 92, 'ranking');
  const ranked = rankLeads(deduped, parsedIntent.desiredFields);

  await pushProgress(jobId, publisher, 'deduplicating', 97, 'leadWrite');
  await writeLeads(ranked, jobId, workspaceId, publisher);

  await pushProgress(jobId, publisher, 'complete', 100, 'done');

  // Persist a compact agent transcript for post-hoc debugging
  await ProspectingJob.findByIdAndUpdate(jobId, {
    'progress.leadsFoundSoFar': ranked.length,
    agentTranscript: agentResult.transcript.slice(-40),
    agentStopReason: agentResult.stopReason,
    agentStepsUsed: agentResult.stepsUsed,
  });

  logger.info('[Pipeline] Job complete', { jobId, totalLeads: ranked.length });
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -40`
Expected: No errors.

Expected warnings about unused imports in other files (e.g., `entityWebsiteFinder.ts` imports that nothing uses now). Those are cosmetic — ignore for now.

- [ ] **Step 3: Commit**
```bash
git add workers/src/pipeline/intentParser.ts
git commit -m "refactor: intentParser.ts is now a ~90-line shell — JobAgent owns the pipeline (big-bang cutover)"
```

---

## Verification

1. `pnpm turbo dev`
2. Submit: "get me phone number and email of someone at fur alle limited"
3. Watch worker logs for:
   - `[jobAgent] tool call { step: 0, tool: 'lookup_registry', thought: "…" }`
   - `[jobAgent] tool call { step: 1, tool: 'guess_domains', ... }`
   - `[jobAgent] tool call { step: 2, tool: 'verify_email', ... }`
   - `[writeLead] lead emitted by agent { ... }`
   - `[jobAgent] target reached` OR `[jobAgent] agent signaled done`
4. Check Mongo `prospectingJob.agentTranscript` for the full decision trail.
5. Check leads in DB — should have real `topContact.fullName` populated and `tags: ['agent_emitted']`.

**Success signals:**
- Agent does NOT call `scrape_page` on zoominfo/rocketreach — the system prompt warns it.
- Agent calls `lookup_registry` early in the run.
- Agent calls `verify_email` before writing any lead with an email.
- Per-job cost stays under $0.80 at nvidia:free pricing.

**Failure modes to debug:**
- Agent outputs non-JSON → check for markdown fences; nudge is automatic.
- Agent loops on the same tool → critic should replan at step 5/10/15. If not, add an explicit "don't repeat calls with identical args" line to the system prompt.
- Agent emits 0 leads → check the transcript; usually indicates the model doesn't trust anything it found. Tune the `write_lead` tool description.

---

## Rollback

```bash
git revert 3acf810..HEAD  # reverts the three Pillar 2/3 commits + Task 1-3 above
```

Old procedural pipeline still exists on the prior commit.

---

## Follow-up cleanup (separate PR, not this one)

After this ships and is stable:
- Delete `workers/src/pipeline/heuristicFilter.ts` (agent decides what to filter)
- Delete `workers/src/pipeline/entityWebsiteFinder.ts` (agent finds websites via search_web + guess_domains)
- Delete `workers/src/pipeline/queryBuilder.ts` dork templates (agent composes queries)
- Delete `workers/src/pipeline/leadQualifier.ts` (score_lead tool replaces it)
- Remove unused imports from `intentParser.ts` dependencies
