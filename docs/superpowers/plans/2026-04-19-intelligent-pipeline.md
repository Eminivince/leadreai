# Intelligent Prospecting Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the prospecting pipeline query-aware and iterative — detect named-entity queries, resolve them to specific companies, cache all SERP links and process them in batches until enough relevant leads are found, without wasting API calls.

**Architecture:** Three cooperating upgrades to the existing pipeline in `workers/src/pipeline/intentParser.ts`: (1) a new `queryType` field in `ParsedIntent` lets the AI parser flag "top N" queries, triggering entity resolution before dork building; (2) a Redis-backed `SerpCache` stores ALL fetched organic results and serves them in batches so nothing is discarded; (3) the main pipeline loop keeps pulling batches and scraping until `qualified leads ≥ targetCount`, generating new dork rounds only when the cache runs dry. A lightweight heuristic filter skips obvious directories before scraping. Existing `leadQualifier.ts` runs unchanged at the end as the final quality gate.

**Tech Stack:** TypeScript, ioredis (already in workers), OpenRouter AI (already wired), SerpAPI (existing), Mongoose (existing), BullMQ (existing)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `shared/src/types/job.ts` | Modify | Add `queryType` + `namedEntities` to `ParsedIntent` |
| `shared/src/schemas/zod/job.schemas.ts` | Modify | Add Zod fields for new `ParsedIntent` keys |
| `backend/src/services/ai/queryParser.ts` | Modify | Extend system prompt to extract `queryType` + `namedEntities` |
| `workers/src/utils/serpCache.ts` | **Create** | Redis-backed SERP link cache per jobId |
| `workers/src/pipeline/entityResolver.ts` | **Create** | Resolve "top N X" queries to specific company names via SerpAPI + AI |
| `workers/src/pipeline/heuristicFilter.ts` | **Create** | Fast, no-AI filter to skip directories and off-topic pages |
| `workers/src/pipeline/queryBuilder.ts` | Modify | Entity-targeted dork generation + round-2 dork strategy |
| `workers/src/pipeline/intentParser.ts` | Modify | Wire entity resolution, SerpCache, iterative batch loop |

---

### Task 1: Extend ParsedIntent shared type + Zod schema + AI prompt

**Files:**
- Modify: `shared/src/types/job.ts`
- Modify: `shared/src/schemas/zod/job.schemas.ts`
- Modify: `backend/src/services/ai/queryParser.ts`

Context: `ParsedIntent` currently has `industry`, `geography`, `targetCount`, `desiredFields`, `companySize`, `keywords`, `confidenceScore`. We add `queryType` and `namedEntities` so the pipeline knows the query style before choosing how to search.

- [ ] **Step 1: Add `queryType` and `namedEntities` to the `ParsedIntent` interface in `shared/src/types/job.ts`**

Find the existing `ParsedIntent` interface and replace it with:
```typescript
export interface ParsedIntent {
  industry: string;
  subIndustry?: string | null;
  geography: JobGeography;
  targetCount: number;
  desiredFields: string[];
  companySize?: string | null;
  keywords: string[];
  confidenceScore: number;
  /** 'named_entity_list' = "top 10 law firms in Nigeria"; 'contact_lookup' = asking for specific contact of a named org; 'demographic_filter' = filter-based prospecting */
  queryType: 'named_entity_list' | 'demographic_filter' | 'contact_lookup';
  /** For named_entity_list: specific company/org names mentioned or to be resolved. null = resolve via search. */
  namedEntities: string[] | null;
}
```

- [ ] **Step 2: Update Zod schema in `shared/src/schemas/zod/job.schemas.ts`**

Find `ParsedIntentSchema` and add the two new fields:
```typescript
export const ParsedIntentSchema = z.object({
  industry: z.string(),
  subIndustry: z.string().nullish(),
  geography: z.object({
    country: z.string().nullish(),
    state: z.string().nullish(),
    city: z.string().nullish(),
  }),
  targetCount: z.number().int().min(1).max(1000).default(50),
  desiredFields: z.array(z.enum(DESIRED_FIELDS)).default(['businessEmail']),
  companySize: z.string().nullish(),
  keywords: z.array(z.string()).default([]),
  confidenceScore: z.number().min(0).max(1).default(0.8),
  queryType: z.enum(['named_entity_list', 'demographic_filter', 'contact_lookup']).default('demographic_filter'),
  namedEntities: z.array(z.string()).nullable().default(null),
});
```

- [ ] **Step 3: Update PARSER_SYSTEM_PROMPT in `backend/src/services/ai/queryParser.ts`**

Replace the existing `PARSER_SYSTEM_PROMPT` constant with:
```typescript
export const PARSER_SYSTEM_PROMPT = `You are a lead-generation query parser. Your sole job is to extract structured intent from a natural-language prospecting query and return it as a single, valid JSON object with NO markdown formatting, NO code fences, and NO extra text before or after the JSON.

Output EXACTLY this JSON schema (all keys required unless marked optional):

{
  "industry": "<string> — primary industry, e.g. 'fintech', 'law firms', 'accounting'",
  "subIndustry": "<string | null> — more specific vertical if mentioned, otherwise null",
  "geography": {
    "country": "<string | null> — country if mentioned, otherwise null",
    "state": "<string | null> — US state or equivalent if mentioned, otherwise null",
    "city": "<string | null> — city if mentioned, otherwise null"
  },
  "targetCount": "<number> — how many leads were requested; default 50 if not specified",
  "desiredFields": "<array of strings> — data fields inferred from the query context; pick any subset of: 'businessEmail', 'officePhone', 'mobilePhone', 'address', 'website', 'linkedin', 'whois', 'techStack'; default to ['businessEmail'] if none are implied",
  "companySize": "<string | null> — e.g. '50-200', 'startup', 'enterprise', or null if unspecified",
  "keywords": "<string[]> — relevant search terms extracted from the query",
  "confidenceScore": "<number 0–1> — your confidence that you have correctly parsed the intent",
  "queryType": "<string> — classify the query as one of: 'named_entity_list' (user wants top-N or specific named organizations, e.g. 'top 10 law firms in Nigeria', 'biggest banks in Ghana'), 'contact_lookup' (user wants contact info for a specific known company, e.g. 'phone number of Aluko and Oyebode'), or 'demographic_filter' (filter-based prospecting, e.g. 'Series B fintechs in NYC using Salesforce')",
  "namedEntities": "<string[] | null> — ONLY for named_entity_list or contact_lookup: list specific company or organization names explicitly mentioned in the query (e.g. ['Aluko & Oyebode', 'Templars']); use null if no specific names are mentioned (they will be resolved via search)"
}

Rules:
- Output ONLY the JSON object. No markdown, no code fences, no preamble, no explanation.
- Use null (not the string "null") for missing optional fields.
- targetCount must be an integer between 1 and 1000.
- confidenceScore must be a decimal between 0 and 1.
- desiredFields must be a non-empty array; default to ["businessEmail"] when the query gives no field hints.
- For named_entity_list queries: if the user says 'top 10' set targetCount=10. namedEntities is null if no specific names are mentioned.
- For contact_lookup queries: if specific companies ARE named in the query, list them in namedEntities.`;
```

- [ ] **Step 4: Verify TypeScript builds cleanly**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
npx tsc --build packages/shared/tsconfig.json 2>&1 | head -30
cd backend && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors. If shared package re-export doesn't include new fields, check `shared/src/index.ts` exports `ParsedIntent`.

- [ ] **Step 5: Commit**
```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add shared/src/types/job.ts shared/src/schemas/zod/job.schemas.ts backend/src/services/ai/queryParser.ts
git commit -m "feat: add queryType + namedEntities to ParsedIntent for query classification"
```

---

### Task 2: SerpCache utility

**Files:**
- Create: `workers/src/utils/serpCache.ts`

Context: Currently `runSerpSearch` fetches up to 150 URLs and all are processed immediately. This utility stores them in a Redis list (FIFO queue per job). Keys expire after 2 hours so they don't leak. The iterative pipeline pops batches from the front.

- [ ] **Step 1: Create `workers/src/utils/serpCache.ts`**

```typescript
import { Redis } from 'ioredis';
import { logger } from './logger.js';
import type { SerpResult } from '../pipeline/serpScraper.js';

const CACHE_TTL_SECONDS = 7200; // 2 hours

export class SerpCache {
  private readonly redis: Redis;
  private readonly keyPrefix = 'serp:links';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  private key(jobId: string): string {
    return `${this.keyPrefix}:${jobId}`;
  }

  /** Push links to the tail of the queue (RPUSH). Resets TTL. */
  async addLinks(jobId: string, links: SerpResult[]): Promise<void> {
    if (links.length === 0) return;
    const k = this.key(jobId);
    await this.redis.rpush(k, ...links.map(l => JSON.stringify(l)));
    await this.redis.expire(k, CACHE_TTL_SECONDS);
    logger.debug('[SerpCache] addLinks', { jobId, added: links.length });
  }

  /** Pop up to `batchSize` links from the head of the queue (LPOP). */
  async getNextBatch(jobId: string, batchSize: number): Promise<SerpResult[]> {
    const k = this.key(jobId);
    const batch: SerpResult[] = [];
    for (let i = 0; i < batchSize; i++) {
      const raw = await this.redis.lpop(k);
      if (!raw) break;
      try {
        batch.push(JSON.parse(raw) as SerpResult);
      } catch {
        logger.warn('[SerpCache] Failed to parse cached link', { jobId });
      }
    }
    return batch;
  }

  /** Number of links remaining in cache. */
  async size(jobId: string): Promise<number> {
    return this.redis.llen(this.key(jobId));
  }

  /** Remove cache for a job (call when job completes or fails). */
  async clear(jobId: string): Promise<void> {
    await this.redis.del(this.key(jobId));
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/workers
npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add workers/src/utils/serpCache.ts
git commit -m "feat: Redis-backed SerpCache for iterative SERP link processing"
```

---

### Task 3: Entity resolver

**Files:**
- Create: `workers/src/pipeline/entityResolver.ts`

Context: When `queryType === 'named_entity_list'` and `namedEntities` is `null`, the pipeline doesn't know which specific companies to target. This stage runs ONE SerpAPI query ("top N [industry] in [location]") and uses OpenRouter AI to extract company names from the organic snippets. The result populates `namedEntities` on the parsed intent before dork building.

- [ ] **Step 1: Create `workers/src/pipeline/entityResolver.ts`**

```typescript
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { runSerpSearch } from './serpScraper.js';
import type { ParsedIntent } from '@leadreai/shared';

const ENTITY_EXTRACT_PROMPT = `You are an expert at identifying company or organization names from web search results.

Given a search query and a list of result snippets, extract the specific company or organization names that directly answer the query. 

Rules:
- Return ONLY a JSON array of strings: ["Company A", "Company B", ...]
- Include only actual company/organization names (not generic terms, adjectives, or descriptions)
- Prefer official/registered names over common abbreviations
- Include at most ${20} names (the top ones by apparent prominence)
- If no specific companies can be identified, return []
- Output ONLY the JSON array, no markdown, no explanation`;

async function extractEntityNamesWithAI(
  searchQuery: string,
  snippets: string[],
  targetCount: number,
): Promise<string[]> {
  if (!env.OPENROUTER_API_KEY || snippets.length === 0) {
    logger.warn('[entityResolver] No API key or snippets — skipping AI extraction');
    return [];
  }

  const userMessage = `Search query: "${searchQuery}"\n\nSearch result snippets:\n${snippets.slice(0, 15).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nExtract the top ${targetCount * 2} company/organization names from these results.`;

  let res: Response;
  try {
    res = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://leadreai.app',
        'X-Title': 'LeadreAI',
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        max_tokens: 512,
        messages: [
          { role: 'system', content: ENTITY_EXTRACT_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }),
    });
  } catch (err) {
    logger.warn('[entityResolver] OpenRouter fetch failed', { err });
    return [];
  }

  if (!res.ok) {
    logger.warn('[entityResolver] OpenRouter non-OK response', { status: res.status });
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json().catch(() => null);
  const content: string = json?.choices?.[0]?.message?.content ?? '';

  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, targetCount * 2);
  } catch {
    return [];
  }
}

/**
 * For named_entity_list queries with namedEntities === null:
 * Run a SerpAPI search to discover the specific companies matching the query,
 * then use AI to extract their names from the snippets.
 *
 * Returns a list of resolved company names (may be empty if lookup fails — pipeline continues gracefully).
 */
export async function resolveNamedEntities(intent: ParsedIntent): Promise<string[]> {
  if (intent.queryType !== 'named_entity_list') return [];
  // If names were already specified in the query, use them directly
  if (intent.namedEntities && intent.namedEntities.length > 0) {
    logger.info('[entityResolver] Named entities already provided — skipping resolution', {
      count: intent.namedEntities.length,
    });
    return intent.namedEntities;
  }

  const { industry, geography, targetCount } = intent;
  const location = [geography.city, geography.state, geography.country].filter(Boolean).join(', ');
  const searchQuery = `top ${targetCount} ${industry} in ${location}`;

  logger.info('[entityResolver] Resolving named entities via SerpAPI', { searchQuery });

  const results = await runSerpSearch([searchQuery]).catch((err) => {
    logger.warn('[entityResolver] SerpAPI failed during entity resolution', { err });
    return [];
  });

  if (results.length === 0) {
    logger.warn('[entityResolver] No SerpAPI results for entity resolution');
    return [];
  }

  const snippets = results.map(r => `${r.title}: ${r.snippet}`);
  const names = await extractEntityNamesWithAI(searchQuery, snippets, targetCount);

  logger.info('[entityResolver] Resolved entity names', { count: names.length, names });
  return names;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/workers
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add workers/src/pipeline/entityResolver.ts
git commit -m "feat: entity resolver — discover specific company names for named_entity_list queries"
```

---

### Task 4: Heuristic pre-scrape filter

**Files:**
- Create: `workers/src/pipeline/heuristicFilter.ts`

Context: Before spending Playwright + OSINT resources on a URL, a fast keyword check rejects obvious directories, social networks, and pages that don't mention the industry or geography. This runs synchronously in ~1ms per URL. No AI cost.

- [ ] **Step 1: Create `workers/src/pipeline/heuristicFilter.ts`**

```typescript
import type { SerpResult } from './serpScraper.js';
import type { ParsedIntent } from '@leadreai/shared';

// Domains that are aggregators/directories, never direct company pages
const SKIP_DOMAIN_FRAGMENTS = [
  'wikipedia.org', 'linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com',
  'youtube.com', 'yelp.com', 'yellowpages', 'tripadvisor', 'glassdoor', 'indeed.com',
  'crunchbase.com', 'bloomberg.com', 'reuters.com', 'forbes.com', 'statista.com',
  'quora.com', 'reddit.com', 'trustpilot', 'clutch.co', 'g2.com', 'capterra.com',
];

// Title/snippet patterns that indicate aggregator pages rather than company homepages
const SKIP_TITLE_PATTERNS = [
  /\btop \d+\b/i,       // "Top 10 law firms"
  /\bbest \d+\b/i,
  /\blist of\b/i,
  /\bdirectory\b/i,
  /\bassociation\b/i,
  /\bwikipedia\b/i,
  /\breviews?\b/i,
];

function getDomain(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); }
  catch { return url.toLowerCase(); }
}

/**
 * Returns true if the SerpResult is worth scraping given the parsed intent.
 * This is a fast, zero-cost pre-filter — not a quality gate.
 */
export function passesHeuristicFilter(
  result: SerpResult,
  intent: ParsedIntent,
): boolean {
  const domain = getDomain(result.url);
  const text = `${result.title} ${result.snippet}`.toLowerCase();

  // Reject known aggregator domains
  if (SKIP_DOMAIN_FRAGMENTS.some(frag => domain.includes(frag))) return false;

  // Reject aggregator-style titles (unless we're doing entity dorks where the URL IS the entity)
  if (intent.queryType !== 'named_entity_list') {
    if (SKIP_TITLE_PATTERNS.some(pat => pat.test(result.title))) return false;
  }

  // For named_entity_list: require at least one entity name to appear in the text OR the domain
  if (intent.queryType === 'named_entity_list' && intent.namedEntities && intent.namedEntities.length > 0) {
    const entityMatch = intent.namedEntities.some(name => {
      const nameLower = name.toLowerCase();
      return text.includes(nameLower) || domain.includes(nameLower.replace(/[^a-z0-9]/g, ''));
    });
    if (!entityMatch) return false;
  }

  // For all query types: skip if neither industry keyword nor geographic hint appears in text
  const industryWords = intent.industry.toLowerCase().split(/\s+/);
  const geo = [intent.geography.country, intent.geography.city, intent.geography.state]
    .filter(Boolean)
    .map(s => s!.toLowerCase());

  const industryHit = industryWords.some(w => w.length > 3 && text.includes(w));
  const geoHit = geo.some(g => text.includes(g));

  // Require EITHER industry OR geo keyword in the snippet/title
  if (!industryHit && !geoHit) return false;

  return true;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/workers
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add workers/src/pipeline/heuristicFilter.ts
git commit -m "feat: heuristic pre-scrape filter — skip directories and off-topic pages"
```

---

### Task 5: Enhanced queryBuilder

**Files:**
- Modify: `workers/src/pipeline/queryBuilder.ts`

Context: The current builder generates 15 generic dorks. We add two new capabilities: (1) entity-targeted dorks that search for specific company names when `namedEntities` is set; (2) a `buildRound2Dorks` function that generates different-angle queries for use when the cache runs dry and the loop needs more links.

- [ ] **Step 1: Replace `workers/src/pipeline/queryBuilder.ts` entirely**

```typescript
import type { ParsedIntent } from '@leadreai/shared';

/** Build dorks targeting specific named entities (for named_entity_list queries). */
function buildEntityDorks(entityNames: string[], geography: ParsedIntent['geography'], desiredFields: string[]): string[] {
  const country = geography.country ?? '';
  const city = geography.city ?? geography.state ?? '';
  const queries: string[] = [];

  for (const name of entityNames.slice(0, 10)) {
    // Direct company website contact page
    queries.push(`"${name}" contact email`);
    if (country) queries.push(`"${name}" "${country}" contact`);
    // Try to find their domain
    queries.push(`"${name}" official website ${city || country}`);
    if (desiredFields.includes('officePhone') || desiredFields.includes('mobilePhone')) {
      queries.push(`"${name}" phone number ${country}`);
    }
  }

  return [...new Set(queries)].slice(0, 20);
}

/** Round 1 dorks — contact pages, directories, files. */
function buildRound1Dorks(intent: ParsedIntent): string[] {
  const { industry, geography, keywords, desiredFields } = intent;
  const country = geography.country ?? '';
  const city = geography.city ?? geography.state ?? '';
  const loc = city || country;
  const queries: string[] = [];

  queries.push(`"${industry}" "${country}" "contact us" email`);
  if (city) queries.push(`"${industry}" "${city}" contact email`);
  queries.push(`"${industry}" "${country}" "contact" "@"`);
  queries.push(`"${industry}" directory "${country}" members`);
  queries.push(`"${industry}" association members "${country}"`);
  queries.push(`inurl:directory "${industry}" "${country}"`);
  queries.push(`inurl:staff "${industry}" "${country}"`);
  queries.push(`inurl:team "${industry}" "${loc || country}"`);
  queries.push(`"${industry}" "${country}" "our team" email`);

  if (desiredFields.includes('businessEmail') || desiredFields.includes('officePhone')) {
    queries.push(`"${industry}" "${country}" contact email filetype:pdf`);
    queries.push(`"${industry}" directory "${country}" filetype:xls`);
    queries.push(`"${industry}" "${country}" filetype:xlsx`);
  }

  queries.push(`site:linkedin.com/company "${industry}" "${country}"`);

  for (const kw of keywords.slice(0, 2)) {
    queries.push(`"${kw}" "${country}" contact email`);
  }

  if (desiredFields.includes('officePhone') || desiredFields.includes('mobilePhone')) {
    queries.push(`"${industry}" "${country}" "phone" "address" -site:linkedin.com`);
  }

  return [...new Set(queries)].slice(0, 15);
}

/** Round 2 dorks — different angles: news, press releases, regulatory filings. */
export function buildRound2Dorks(intent: ParsedIntent): string[] {
  const { industry, geography, keywords } = intent;
  const country = geography.country ?? '';
  const city = geography.city ?? geography.state ?? '';
  const queries: string[] = [];

  // News/press release sources often list company contact details
  queries.push(`"${industry}" "${country}" "press release" email`);
  queries.push(`"${industry}" "${country}" news contact`);
  queries.push(`site:prnewswire.com "${industry}" "${country}"`);
  queries.push(`site:businesswire.com "${industry}" "${country}"`);

  // Government / regulatory filings with contact data
  queries.push(`"${industry}" "${country}" "registered" contact filetype:pdf`);
  queries.push(`"${industry}" regulation "${country}" members list`);

  // Event / conference attendee lists
  queries.push(`"${industry}" conference "${country}" attendees speakers`);
  queries.push(`"${industry}" summit "${country}" participants contact`);

  // Trade publications
  queries.push(`"${industry}" magazine "${country}" companies`);
  queries.push(`"${industry}" "${country}" annual report contacts`);

  if (city) {
    queries.push(`"${industry}" "${city}" business directory`);
    queries.push(`"${industry}" "${city}" companies list`);
  }

  for (const kw of keywords.slice(0, 3)) {
    queries.push(`"${kw}" "${country}" company email contact`);
  }

  return [...new Set(queries)].slice(0, 12);
}

/**
 * Main entry point. Builds the first-round dork queries.
 * For named_entity_list with resolved entities, uses entity-targeted dorks.
 * For demographic queries, uses the keyword/geography dork approach.
 */
export function buildDorkQueries(intent: ParsedIntent): string[] {
  if (
    (intent.queryType === 'named_entity_list' || intent.queryType === 'contact_lookup') &&
    intent.namedEntities && intent.namedEntities.length > 0
  ) {
    return buildEntityDorks(intent.namedEntities, intent.geography, intent.desiredFields);
  }
  return buildRound1Dorks(intent);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/workers
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add workers/src/pipeline/queryBuilder.ts
git commit -m "feat: entity-targeted dork generation + round-2 dork strategy in queryBuilder"
```

---

### Task 6: Refactor intentParser.ts — iterative pipeline with caching

**Files:**
- Modify: `workers/src/pipeline/intentParser.ts`

Context: This is the main orchestration file. The current pipeline runs all stages in one pass without checking if enough leads have been found. We introduce: (1) entity resolution before dork building; (2) SerpCache stores all fetched links; (3) a `while` loop that processes batches of 8 links at a time, stopping when qualified leads reach targetCount or cache is exhausted; (4) a round-2 SERP replenishment when cache runs empty; (5) heuristic filter before scraping. The existing leadQualifier.ts at the end is unchanged.

**Important:** The iterative loop processes domains one batch at a time. The stopping condition is `uniqueLeadsWithContact >= targetCount` where "contact" means at least one email OR phone number. This is checked after each batch. We do NOT stop early from the qualifiedLeads (AI qualification happens at the end).

- [ ] **Step 1: Add imports at the top of `workers/src/pipeline/intentParser.ts`**

Add these imports after existing imports:
```typescript
import { resolveNamedEntities } from './entityResolver.js';
import { buildRound2Dorks } from './queryBuilder.js';
import { passesHeuristicFilter } from './heuristicFilter.js';
import { SerpCache } from '../utils/serpCache.js';
```

- [ ] **Step 2: Replace the entire `runIntentParser` function**

The full replacement (this is a complete rewrite of the function body, keeping the same signature):

```typescript
export async function runIntentParser(
  jobId: string,
  workspaceId: string,
  publisher: Redis,
): Promise<void> {
  logger.info('[Pipeline] Starting job', { jobId, workspaceId });

  // ── Stage 0: Mark parsing started ───────────────────────────────────
  await ProspectingJob.findByIdAndUpdate(jobId, {
    status: 'parsing',
    startedAt: new Date(),
    'progress.percentage': 3,
    'progress.currentStage': 'parsing',
  });
  await publisher.publish(
    `job:progress:${jobId}`,
    JSON.stringify({ type: 'status', status: 'parsing', percentage: 3, stage: 'parsing' })
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobDoc = await ProspectingJob.findById(jobId).lean() as any;
  if (!jobDoc) throw new Error(`Job ${jobId} not found`);
  let parsedIntent = jobDoc.parsedIntent as ParsedIntent;
  if (!parsedIntent) throw new Error(`Job ${jobId} has no parsedIntent`);

  logger.info('[Pipeline] parsedIntent loaded', {
    jobId, queryType: parsedIntent.queryType,
    industry: parsedIntent.industry, targetCount: parsedIntent.targetCount,
  });

  // ── Stage 1: Entity resolution (named_entity_list only) ─────────────
  if (parsedIntent.queryType === 'named_entity_list' && !parsedIntent.namedEntities?.length) {
    await progress(jobId, publisher, 'parsing', 7, 'parsing');
    logger.info('[Pipeline] [1] Resolving named entities', { jobId });
    const resolvedEntities = await resolveNamedEntities(parsedIntent).catch((err) => {
      logger.warn('[Pipeline] Entity resolution failed — continuing without entities', { jobId, err });
      return [] as string[];
    });
    if (resolvedEntities.length > 0) {
      parsedIntent = { ...parsedIntent, namedEntities: resolvedEntities };
      // Persist resolved entities back to the job document
      await ProspectingJob.findByIdAndUpdate(jobId, {
        'parsedIntent.namedEntities': resolvedEntities,
      });
    }
    logger.info('[Pipeline] [1] Entity resolution done', { jobId, count: parsedIntent.namedEntities?.length ?? 0 });
  }

  // ── Stage 2: Build initial dork queries ─────────────────────────────
  await progress(jobId, publisher, 'collecting', 10, 'queryBuilder');
  let t = timer();
  const round1Queries = buildDorkQueries(parsedIntent);
  logger.info('[Pipeline] [2] queryBuilder done', { jobId, ms: t(), count: round1Queries.length });

  // ── Stage 3: SERP initial round → populate cache ─────────────────────
  await progress(jobId, publisher, 'collecting', 18, 'serpSearch');
  t = timer();

  // Create a dedicated Redis connection for the cache (separate from publisher)
  const { Redis: RedisClient } = await import('ioredis');
  const cacheRedis = new RedisClient(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  const serpCache = new SerpCache(cacheRedis);

  let serpResults = await runSerpSearch(round1Queries);
  await serpCache.addLinks(jobId, serpResults);
  logger.info('[Pipeline] [3] SERP round 1 done → cached', {
    jobId, ms: t(), fetched: serpResults.length, cached: await serpCache.size(jobId),
  });

  // ── Stage 4–7: Iterative batch loop ─────────────────────────────────
  const BATCH_SIZE = 8;
  const MAX_SERP_ROUNDS = 3;
  const STOP_THRESHOLD = Math.max(1, parsedIntent.targetCount);
  const countryHint = countryNameToCode(parsedIntent.geography?.country);

  const accumulatedLeads: LeadRecord[] = [];
  const processedDomains = new Set<string>();
  let serpRound = 1;
  let batchNum = 0;
  let shouldStop = false;

  const enrichPct = (done: number, total: number) =>
    Math.round(20 + (done / Math.max(1, total)) * 60);

  await progress(jobId, publisher, 'enriching', 22, 'osintEnrichment');

  while (!shouldStop) {
    // Pop next batch from cache
    const batch = await serpCache.getNextBatch(jobId, BATCH_SIZE);

    if (batch.length === 0) {
      // Cache exhausted — try another SERP round
      if (serpRound >= MAX_SERP_ROUNDS) {
        logger.info('[Pipeline] Max SERP rounds reached — stopping', { jobId, serpRound });
        break;
      }
      serpRound++;
      logger.info('[Pipeline] Cache empty — running SERP round', { jobId, serpRound });

      await progress(jobId, publisher, 'collecting', 18, 'serpSearch');
      const round2Queries = buildRound2Dorks(parsedIntent);
      const newResults = await runSerpSearch(round2Queries);
      if (newResults.length === 0) {
        logger.info('[Pipeline] SERP round returned nothing — stopping', { jobId, serpRound });
        break;
      }
      await serpCache.addLinks(jobId, newResults);
      logger.info('[Pipeline] SERP replenished cache', { jobId, serpRound, added: newResults.length });
      await progress(jobId, publisher, 'enriching', 22, 'osintEnrichment');
      continue; // loop again to pop from newly populated cache
    }

    batchNum++;
    logger.info(`[Pipeline] Processing batch ${batchNum}`, { jobId, batchSize: batch.length });

    // Apply heuristic filter before scraping
    const filtered = batch.filter(r => passesHeuristicFilter(r, parsedIntent));
    logger.info(`[Pipeline] Batch ${batchNum} heuristic filter`, {
      jobId, before: batch.length, after: filtered.length,
    });

    // Skip scraping if no links passed the filter
    if (filtered.length === 0) continue;

    // Scrape batch
    let pageData: Awaited<ReturnType<typeof runPageScraper>> = [];
    try {
      pageData = await runPageScraper(filtered, publisher, jobId);
    } catch (err) {
      logger.warn(`[Pipeline] Batch ${batchNum} pageScraper failed`, {
        jobId, err: err instanceof Error ? err.message : String(err),
      });
    }

    // File extraction on this batch
    const fileUrls = pageData.flatMap(p => p.fileUrls);
    let fileData: Awaited<ReturnType<typeof runFileExtractor>> = [];
    if (fileUrls.length > 0) {
      try {
        fileData = await runFileExtractor(fileUrls);
      } catch { /* non-fatal */ }
    }

    // Aggregate domains from this batch
    const batchDomainMap = new Map<string, {
      emails: string[]; phones: string[]; pageUrls: string[];
      linkedinUrl?: string; companyName?: string;
    }>();

    for (const page of pageData) {
      if (page.url === 'collected-files') continue;
      const domain = getDomain(page.url);
      if (processedDomains.has(domain)) continue;
      const existing = batchDomainMap.get(domain) ?? { emails: [], phones: [], pageUrls: [] };
      existing.emails.push(...page.emails);
      existing.phones.push(...page.phones);
      existing.pageUrls.push(page.url);
      if (page.linkedinUrl && !existing.linkedinUrl) existing.linkedinUrl = page.linkedinUrl;
      if (page.companyName && !existing.companyName) existing.companyName = page.companyName;
      batchDomainMap.set(domain, existing);
    }
    for (const file of fileData) {
      const domain = getDomain(file.url);
      if (processedDomains.has(domain)) continue;
      const existing = batchDomainMap.get(domain) ?? { emails: [], phones: [], pageUrls: [] };
      existing.emails.push(...file.emails);
      existing.phones.push(...file.phones);
      batchDomainMap.set(domain, existing);
    }

    // Enrich each new domain
    for (const [domain, data] of batchDomainMap.entries()) {
      processedDomains.add(domain);

      const osint = await enrichDomain(domain).catch(() => ({}));
      const detectedEmails = await detectEmails(
        domain, data.emails, (osint as { hasMx?: boolean }).hasMx ?? false
      ).catch(() => []);
      const normalizedPhones = normalizePhones([...new Set(data.phones)], countryHint);

      const lead: LeadRecord = {
        workspaceId,
        jobId,
        companyName: data.companyName ?? domain,
        companyDomain: domain,
        website: data.pageUrls[0],
        industry: parsedIntent.industry,
        address: {
          country: parsedIntent.geography?.country ?? undefined,
          city: parsedIntent.geography?.city ?? undefined,
          state: parsedIntent.geography?.state ?? undefined,
        },
        emails: detectedEmails.map(e => ({
          address: e.address, type: e.type, confidence: e.confidence, source: e.source,
        })),
        phones: normalizedPhones.filter(p => p.isValid).map(p => ({
          raw: p.raw, normalized: p.normalized, type: p.type,
          countryCode: p.countryCode, source: 'scraped',
        })),
        socialProfiles: data.linkedinUrl ? { linkedinUrl: data.linkedinUrl } : undefined,
        osint: osint as Record<string, unknown>,
        sources: data.pageUrls.map(url => ({
          url, type: 'scraped_page' as const, scrapedAt: new Date(), confidence: 0.7,
        })),
        rawSnippets: [],
        rankScore: 0,
        completenessScore: 0,
        isDuplicate: false,
        tags: [],
      };

      accumulatedLeads.push(lead);

      const leadsWithContact = accumulatedLeads.filter(
        l => l.emails.length > 0 || l.phones.length > 0
      ).length;

      // Publish progress
      await ProspectingJob.findByIdAndUpdate(jobId, {
        'progress.leadsFoundSoFar': accumulatedLeads.length,
      });
      await publisher.publish(
        `job:progress:${jobId}`,
        JSON.stringify({ type: 'progress', leadsFoundSoFar: accumulatedLeads.length })
      );

      const pct = enrichPct(processedDomains.size, Math.max(processedDomains.size, STOP_THRESHOLD * 3));
      await publisher.publish(
        `job:progress:${jobId}`,
        JSON.stringify({ type: 'status', status: 'enriching', percentage: pct, stage: 'osintEnrichment' })
      );

      // Stopping condition: enough leads with contact data
      if (leadsWithContact >= STOP_THRESHOLD) {
        logger.info('[Pipeline] Target count reached — stopping loop', {
          jobId, leadsWithContact, STOP_THRESHOLD,
        });
        shouldStop = true;
        break;
      }
    }
  }

  // ── Stage 8: Deduplication ───────────────────────────────────────────
  logger.info('[Pipeline] Deduplication starting', { jobId, total: accumulatedLeads.length });
  await progress(jobId, publisher, 'deduplicating', 85, 'deduplication');
  const deduped = deduplicateLeads(accumulatedLeads);

  // ── Stage 9: Ranking ─────────────────────────────────────────────────
  await progress(jobId, publisher, 'deduplicating', 92, 'ranking');
  const ranked = rankLeads(deduped, parsedIntent.desiredFields);

  // ── Stage 10: Write to DB ────────────────────────────────────────────
  await progress(jobId, publisher, 'deduplicating', 97, 'leadWrite');
  await writeLeads(ranked, jobId, workspaceId, publisher);

  // ── Stage 11: AI Qualification ───────────────────────────────────────
  await progress(jobId, publisher, 'complete', 99, 'qualification');
  await runLeadQualifier(jobId, workspaceId, publisher);

  // ── Cleanup ──────────────────────────────────────────────────────────
  await serpCache.clear(jobId);
  cacheRedis.quit().catch(() => {});

  logger.info('[Pipeline] Job complete', { jobId, totalLeads: ranked.length });
}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/workers
npx tsc --noEmit 2>&1 | head -40
```

Fix any errors. Common issues:
- `SerpResult` import: `import type { SerpResult } from './serpScraper.js'` may be needed in serpCache — already done in Task 2
- `RedisClient` instantiation: if `process.env['REDIS_URL']` is undefined, use `env.REDIS_URL` instead (import `env` from `'../config/env.js'`)
- The `parsedIntent` re-spread: TypeScript may complain about spreading `ParsedIntent` if it has required fields with no default; add `as ParsedIntent` cast if needed

If `env.REDIS_URL` is the correct import path, replace the `process.env` reference in the cacheRedis instantiation with:
```typescript
const cacheRedis = new RedisClient(env.REDIS_URL, { maxRetriesPerRequest: null });
```
And add `import { env } from '../config/env.js';` at the top.

- [ ] **Step 4: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add workers/src/pipeline/intentParser.ts
git commit -m "feat: iterative pipeline with SerpCache, entity resolution, heuristic filter, early stopping"
```

---

## Verification

### Manual test flow

1. Start the backend and workers:
```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
# Terminal 1
cd backend && npm run dev
# Terminal 2
cd workers && npm run dev
```

2. Open the frontend and submit a **named_entity_list** query:
   > "Get me the contact details of the top 5 law firms in Nigeria"

   Expected behavior:
   - SSE stream shows stage `parsing` → then `osintEnrichment`
   - In workers logs: `[entityResolver] Resolved entity names` with 5-10 firm names
   - `[Pipeline] [2] queryBuilder done` shows entity-targeted dorks like `"Aluko & Oyebode" contact email`
   - Loop batches with heuristic filter: `before: 8, after: 3` (directories rejected)
   - Loop stops when 5 leads with contact data found
   - AI qualifier runs at end, marks irrelevant ones as "dust"

3. Submit a **demographic_filter** query:
   > "Series B SaaS companies in UK with 50-200 employees, hiring engineers"

   Expected behavior:
   - No entity resolution stage
   - Round-1 demographic dorks run
   - Cache populated, batches processed
   - If cache exhausted before 50 leads, round-2 dorks run
   - Stops at 50 leads with contact data

4. Verify SerpCache is used:
   - In Redis: `redis-cli llen "serp:links:<jobId>"` should show remaining cached links mid-job
   - After job completes: key should be deleted (cache cleared)

### What success looks like

| Before | After |
|--------|-------|
| "top 10 law firms" returns generic law-adjacent domains | Returns domains of actual named Nigerian law firms |
| Pipeline always processes all 150 SERP URLs | Stops as soon as enough qualified leads found |
| Unused SERP links discarded | Cached in Redis, replenished from new dork round if needed |
| Directories and Wikipedia pages scraped | Rejected by heuristic filter before scraping |
| `targetCount` ignored | Pipeline halts when `leadsWithContact >= targetCount` |
