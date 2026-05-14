# Pillar 2: Per-Lead Research Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** For each candidate domain that produced a "thin" lead (no named contacts, or missing a requested field), run an iterative AI agent with tools that researches the domain like a human analyst would — fetching specific pages, searching the web, permuting email patterns, verifying deliverability.

**Architecture:** ReAct-style loop. Agent receives initial scrape snapshot + domain + entity hint + desired fields. At each step it emits a JSON action (`{ "tool": "...", "args": {...} }` or `{ "done": true, "contacts": [...] }`). We execute the tool, append the result to history, call the LLM again. Max 6 tool calls or 60 seconds.

**Why ReAct over function-calling:** portable across OpenRouter providers (Gemini Flash doesn't have reliable function-calling via OpenRouter). Simpler to debug. JSON-only responses via `response_format: json_object`.

**Tech Stack:** OpenRouter Gemini Flash, existing Playwright/Cheerio, existing SerpAPI wrapper, native `dns.resolveMx`

**Reference:** `docs/engine-architecture-vision.md` — Pillar 2 rationale.

---

## File Map

| File | Change |
|------|--------|
| `workers/src/pipeline/tools/fetchUrl.ts` | **New.** Lightweight single-page fetch (no full browser) → cleaned text + JSON-LD |
| `workers/src/pipeline/tools/searchWeb.ts` | **New.** SerpAPI wrapper with optional site-restriction |
| `workers/src/pipeline/tools/permuteEmail.ts` | **New.** 12 common email pattern generator |
| `workers/src/pipeline/tools/verifyEmail.ts` | **New.** MX check + catch-all detection (SMTP probe disabled — see Pillar 3) |
| `workers/src/pipeline/researchAgent.ts` | **New.** ReAct loop, calls tools, emits `ContactCandidate[]` |
| `workers/src/pipeline/intentParser.ts` | Run agent on "thin" leads before scoring |

---

### Task 1: Create the 4 tool files

**Files:**
- Create: `workers/src/pipeline/tools/fetchUrl.ts`
- Create: `workers/src/pipeline/tools/searchWeb.ts`
- Create: `workers/src/pipeline/tools/permuteEmail.ts`
- Create: `workers/src/pipeline/tools/verifyEmail.ts`

**Context:** Each tool is a stateless async function. Return values are plain-string-or-JSON that gets fed back to the LLM as tool output. Keep output short (<2k chars per tool call) so we don't blow the context window.

- [ ] **Step 1: Create `tools/fetchUrl.ts`**

This is a LIGHT fetch (not Playwright) for speed — the research agent needs to be fast. For pages that need JS rendering, we already have the main scraper's Playwright output. This tool is for reading structured/text pages quickly.

```typescript
import * as cheerio from 'cheerio';
import { logger } from '../../utils/logger.js';

export interface FetchedPage {
  url: string;
  status: number;
  bodyText: string;
  jsonLd: unknown[];
  emails: string[];
  phones: string[];
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_TEXT = 6_000;
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

export async function fetchUrl(url: string): Promise<FetchedPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LeadreaiBot/1.0; +https://leadreai.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!res.ok) {
      return { url, status: res.status, bodyText: '', jsonLd: [], emails: [], phones: [] };
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const jsonLd: unknown[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).contents().text().trim();
      if (!raw) return;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) jsonLd.push(...parsed);
        else jsonLd.push(parsed);
      } catch { /* ignore */ }
    });

    $('script, style, nav, footer, svg').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

    const emailSet = new Set<string>(bodyText.match(EMAIL_REGEX) ?? []);
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const email = href.replace('mailto:', '').split('?')[0];
      if (email) emailSet.add(email);
    });

    const phones: string[] = [];
    $('a[href^="tel:"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const p = href.replace('tel:', '').trim();
      if (p && p.replace(/\D/g, '').length >= 7) phones.push(p);
    });

    return {
      url,
      status: res.status,
      bodyText,
      jsonLd,
      emails: [...emailSet].filter(e => !e.includes('example.com')),
      phones,
    };
  } catch (err) {
    logger.warn('[fetchUrl] failed', { url, err: err instanceof Error ? err.message : String(err) });
    return { url, status: 0, bodyText: '', jsonLd: [], emails: [], phones: [] };
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 2: Create `tools/searchWeb.ts`**

Thin wrapper over existing `serpScraper.ts`. Returns compact results for the agent.

```typescript
import { runSerpSearch } from '../serpScraper.js';
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
    return results.slice(0, limit).map(r => ({
      url: r.url,
      title: r.title,
      snippet: r.snippet,
    }));
  } catch (err) {
    logger.warn('[searchWeb] failed', { query: fullQuery, err: err instanceof Error ? err.message : String(err) });
    return [];
  }
}
```

- [ ] **Step 3: Create `tools/permuteEmail.ts`**

Generates 12 common email patterns given a domain and optional name. No I/O, pure string generation.

```typescript
export interface EmailPermutation {
  address: string;
  pattern: string;
}

export function permuteEmail(
  domain: string,
  firstName?: string,
  lastName?: string,
): EmailPermutation[] {
  const d = domain.toLowerCase().replace(/^www\./, '');
  const generic: EmailPermutation[] = [
    { address: `info@${d}`, pattern: 'info' },
    { address: `contact@${d}`, pattern: 'contact' },
    { address: `hello@${d}`, pattern: 'hello' },
    { address: `sales@${d}`, pattern: 'sales' },
    { address: `office@${d}`, pattern: 'office' },
  ];

  if (!firstName || !lastName) return generic;

  const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const l = lastName.toLowerCase().replace(/[^a-z]/g, '');
  if (!f || !l) return generic;

  const named: EmailPermutation[] = [
    { address: `${f}@${d}`, pattern: 'first' },
    { address: `${f}.${l}@${d}`, pattern: 'first.last' },
    { address: `${f}${l}@${d}`, pattern: 'firstlast' },
    { address: `${f[0]}${l}@${d}`, pattern: 'flast' },
    { address: `${f[0]}.${l}@${d}`, pattern: 'f.last' },
    { address: `${f}_${l}@${d}`, pattern: 'first_last' },
    { address: `${f}-${l}@${d}`, pattern: 'first-last' },
    { address: `${l}@${d}`, pattern: 'last' },
    { address: `${l}.${f}@${d}`, pattern: 'last.first' },
    { address: `${l}${f}@${d}`, pattern: 'lastfirst' },
    { address: `${f}${l[0]}@${d}`, pattern: 'firstl' },
  ];

  return [...named, ...generic];
}
```

- [ ] **Step 4: Create `tools/verifyEmail.ts`**

MX record check only (SMTP probe is broken on port 25 from consumer networks — Pillar 3 will add a real verifier API).

```typescript
import { promises as dns } from 'dns';
import { logger } from '../../utils/logger.js';

export interface VerifyResult {
  address: string;
  hasMx: boolean;
  mxHost?: string;
  verdict: 'likely_valid' | 'likely_catch_all' | 'invalid_domain' | 'unknown';
}

const mxCache = new Map<string, { hasMx: boolean; mxHost?: string }>();

export async function verifyEmail(address: string): Promise<VerifyResult> {
  const addr = address.toLowerCase().trim();
  const parts = addr.split('@');
  if (parts.length !== 2) {
    return { address: addr, hasMx: false, verdict: 'invalid_domain' };
  }
  const domain = parts[1];
  if (!domain) {
    return { address: addr, hasMx: false, verdict: 'invalid_domain' };
  }

  const cached = mxCache.get(domain);
  if (cached) {
    return { address: addr, ...cached, verdict: cached.hasMx ? 'likely_valid' : 'invalid_domain' };
  }

  try {
    const records = await dns.resolveMx(domain);
    if (records.length === 0) {
      mxCache.set(domain, { hasMx: false });
      return { address: addr, hasMx: false, verdict: 'invalid_domain' };
    }
    const mxHost = records.sort((a, b) => a.priority - b.priority)[0]?.exchange;
    mxCache.set(domain, { hasMx: true, mxHost });
    return { address: addr, hasMx: true, mxHost, verdict: 'likely_valid' };
  } catch (err) {
    logger.debug('[verifyEmail] MX lookup failed', { domain, err: err instanceof Error ? err.message : String(err) });
    mxCache.set(domain, { hasMx: false });
    return { address: addr, hasMx: false, verdict: 'unknown' };
  }
}
```

- [ ] **Step 5: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

If cheerio import errors — read `workers/src/pipeline/pageScraper.ts` to see how it imports cheerio (likely `import { load as cheerioLoad } from 'cheerio';`) and match that style.

- [ ] **Step 6: Commit**
```bash
git add workers/src/pipeline/tools/
git commit -m "feat: research agent tools — fetchUrl, searchWeb, permuteEmail, verifyEmail (Pillar 2)"
```

---

### Task 2: Create `researchAgent.ts` with ReAct loop

**Files:**
- Create: `workers/src/pipeline/researchAgent.ts`

**Context:** The ReAct loop is the brain. It feeds the LLM a history of (user → assistant → tool result → assistant → ...) and expects JSON actions back. Max 6 steps + 60s wall time.

The agent's job: given a domain that produced a thin lead, try to find named contacts with real emails/phones. It should NOT hallucinate — if it generates an email pattern, it must verify via `verify_email` before emitting.

- [ ] **Step 1: Create the file**

```typescript
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import type { ContactCandidate } from './aiContactExtractor.js';
import { fetchUrl } from './tools/fetchUrl.js';
import { searchWeb } from './tools/searchWeb.js';
import { permuteEmail } from './tools/permuteEmail.js';
import { verifyEmail } from './tools/verifyEmail.js';

export interface AgentInput {
  domain: string;
  entityName?: string;
  desiredFields: string[];
  knownContacts: ContactCandidate[];
  pagesAlreadyScraped: string[];
}

export interface AgentResult {
  additionalContacts: ContactCandidate[];
  toolCallsUsed: number;
  stopReason: 'done' | 'max_steps' | 'timeout' | 'error';
  transcript: string;
}

const MAX_STEPS = 6;
const MAX_WALL_MS = 60_000;
const AI_TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT = `You are an autonomous lead-research agent. You are given a company domain and a list of what the user wants (emails, phones, named contacts). You have a small toolkit and a strict step budget.

Tools you can call (respond with EXACTLY ONE of these JSON forms each turn, no markdown, no prose):

{ "tool": "fetch_url", "args": { "url": "https://..." }, "thought": "..." }
  → Fetch a specific page (contact page, staff page, about page). Returns cleaned text + emails/phones/JSON-LD.

{ "tool": "search_web", "args": { "query": "...", "site": "linkedin.com" (optional) }, "thought": "..." }
  → Web search. Use 'site' to restrict to a specific domain. Returns 5 title/snippet/url triples.

{ "tool": "permute_email", "args": { "firstName": "...", "lastName": "..." }, "thought": "..." }
  → Generate 12 common email patterns for a named person. Returns a list; you must verify_email each before emitting as a contact.

{ "tool": "verify_email", "args": { "address": "..." }, "thought": "..." }
  → MX lookup. Returns { hasMx, verdict }. 'invalid_domain' means reject. 'likely_valid' means domain accepts mail (not a deliverability guarantee).

{ "done": true, "contacts": [ContactCandidate, ...], "summary": "..." }
  → Emit final contacts and stop. Use when you have everything, or when further tool calls would be wasteful.

ContactCandidate shape: { name?, title?, department?, email?, phone?, confidence (0-1), sourceType }

STRATEGY:
1. If knownContacts already has a named contact with verified email → emit done immediately.
2. Start by fetching '/contact', '/about', '/team', or '/leadership' on the target domain if not already scraped.
3. If you find a name but no email → search_web for "<name>" "<company>" to find LinkedIn/bio pages.
4. If you have a name and domain but no email → permute_email then verify_email on top candidates.
5. Only emit contacts you can justify: at minimum, email must have hasMx=true. Confidence 0.9+ for verified named contacts; 0.6 for unverified patterns.
6. BUDGET IS 6 STEPS. Spend them wisely. Prefer targeted single pages over broad searches.
7. Never fabricate names or addresses. If you can't find real data, return { "done": true, "contacts": [] }.

RETURN ONLY JSON. NO MARKDOWN FENCES.`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HistoryMsg = { role: 'system' | 'user' | 'assistant'; content: string };

function buildInitialContext(input: AgentInput): string {
  const knownSummary = input.knownContacts.length > 0
    ? input.knownContacts.map(c => `- ${c.name ?? '(no name)'} | ${c.title ?? '(no title)'} | ${c.email ?? '—'} | ${c.phone ?? '—'} | conf ${c.confidence}`).join('\n')
    : '(none)';
  return `Target domain: ${input.domain}
Entity name: ${input.entityName ?? 'unknown — infer from the domain'}
Desired fields: ${input.desiredFields.join(', ') || 'any business contact data'}

Already-scraped pages:
${input.pagesAlreadyScraped.slice(0, 10).join('\n') || '(none)'}

Known contacts so far:
${knownSummary}

What is your first action?`;
}

async function callLLM(history: HistoryMsg[]): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://leadreai.app',
      },
      body: JSON.stringify({
        model: 'google/gemini-flash-1.5',
        messages: history,
        max_tokens: 800,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeTool(tool: string, args: any, domain: string): Promise<string> {
  switch (tool) {
    case 'fetch_url': {
      const result = await fetchUrl(String(args?.url ?? ''));
      return JSON.stringify({
        status: result.status,
        emails: result.emails,
        phones: result.phones,
        jsonLdCount: result.jsonLd.length,
        bodyTextPreview: result.bodyText.slice(0, 2000),
      });
    }
    case 'search_web': {
      const results = await searchWeb(String(args?.query ?? ''), args?.site, 5);
      return JSON.stringify(results);
    }
    case 'permute_email': {
      const patterns = permuteEmail(domain, args?.firstName, args?.lastName);
      return JSON.stringify(patterns);
    }
    case 'verify_email': {
      const result = await verifyEmail(String(args?.address ?? ''));
      return JSON.stringify(result);
    }
    default:
      return JSON.stringify({ error: `unknown tool: ${tool}` });
  }
}

export async function researchDomain(input: AgentInput): Promise<AgentResult> {
  if (!env.OPENROUTER_API_KEY) {
    return { additionalContacts: [], toolCallsUsed: 0, stopReason: 'error', transcript: 'no OPENROUTER_API_KEY' };
  }

  const startedAt = Date.now();
  const transcriptLines: string[] = [];
  const history: HistoryMsg[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildInitialContext(input) },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    if (Date.now() - startedAt > MAX_WALL_MS) {
      return {
        additionalContacts: [], toolCallsUsed: step, stopReason: 'timeout',
        transcript: transcriptLines.join('\n'),
      };
    }

    let raw: string;
    try {
      raw = await callLLM(history);
    } catch (err) {
      logger.warn('[researchAgent] LLM call failed', { domain: input.domain, step, err: err instanceof Error ? err.message : String(err) });
      return {
        additionalContacts: [], toolCallsUsed: step, stopReason: 'error',
        transcript: transcriptLines.join('\n'),
      };
    }

    transcriptLines.push(`[${step}] ← ${raw.slice(0, 300)}`);
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
      const contacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];
      const cleaned: ContactCandidate[] = contacts
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((c: any) => c && (c.email || c.phone || c.name))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((c: any) => ({
          ...c,
          confidence: Math.max(0, Math.min(1, Number(c.confidence ?? 0.6))),
          sourceType: c.sourceType ?? 'body_text',
        }));
      logger.info('[researchAgent] done', {
        domain: input.domain, step, emitted: cleaned.length, summary: parsed.summary,
      });
      return {
        additionalContacts: cleaned, toolCallsUsed: step,
        stopReason: 'done', transcript: transcriptLines.join('\n'),
      };
    }

    if (!parsed?.tool) {
      history.push({ role: 'user', content: 'Your response must include either a "tool" field or a "done": true field.' });
      continue;
    }

    const toolResult = await executeTool(parsed.tool, parsed.args ?? {}, input.domain);
    transcriptLines.push(`[${step}] → ${parsed.tool} → ${toolResult.slice(0, 200)}`);
    history.push({ role: 'user', content: `Tool ${parsed.tool} result:\n${toolResult}` });
  }

  logger.info('[researchAgent] max steps reached', { domain: input.domain });
  return {
    additionalContacts: [], toolCallsUsed: MAX_STEPS, stopReason: 'max_steps',
    transcript: transcriptLines.join('\n'),
  };
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -40`
Expected: No errors.

- [ ] **Step 3: Commit**
```bash
git add workers/src/pipeline/researchAgent.ts
git commit -m "feat: per-lead research agent ReAct loop (Pillar 2)"
```

---

### Task 3: Integrate agent into `intentParser.ts`

**Files:**
- Modify: `workers/src/pipeline/intentParser.ts`

**Context:** After scraping + extracting contacts per domain, BEFORE calling `scoreLeadRelevance`, check if the lead is "thin":

- No named contact (`!data.contacts.some(c => c.name)`) — the UI will show nothing meaningful
- OR desiredFields includes email/phone but mergedEmails/mergedPhones is empty

If thin, call `researchDomain()`. Merge its `additionalContacts` into the lead's emails/phones the same way Pillar 1 merges AI vs regex. Cap the number of agent runs per batch at 4 concurrent (the agent takes 20–40s, don't serialize them).

**But** simplifying for first iteration: run agent serially, cap at 3 runs per batch. Optimization comes later.

- [ ] **Step 1: Add import**

```typescript
import { researchDomain } from './researchAgent.js';
```

- [ ] **Step 2: Introduce a per-batch agent budget**

Find the inner `for (const [domain, data] of batchDomainMap.entries())` loop. Just before it, declare:
```typescript
    let agentRunsThisBatch = 0;
    const AGENT_BUDGET_PER_BATCH = 3;
```

- [ ] **Step 3: Run the agent for thin leads**

This goes AFTER the Pillar 1 merge block (after `mergedEmails`, `mergedPhones`, `contactSummary` are built) but BEFORE the `const lead: LeadRecord = {` assignment.

Insert:
```typescript
      // Pillar 2: if the lead is thin, dispatch the research agent
      const hasNamedContact = data.contacts.some(c => c.name && c.email);
      const wantsEmail = parsedIntent.desiredFields.includes('businessEmail') || parsedIntent.desiredFields.length === 0;
      const wantsPhone = parsedIntent.desiredFields.some(f => f === 'officePhone' || f === 'mobilePhone');
      const missingWanted = (wantsEmail && mergedEmails.length === 0) || (wantsPhone && mergedPhones.length === 0);
      const isThin = !hasNamedContact || missingWanted;

      let agentContacts: typeof mergedEmails = [];
      let agentPhones: typeof mergedPhones = [];
      let agentContactSummary = contactSummary;

      if (isThin && agentRunsThisBatch < AGENT_BUDGET_PER_BATCH) {
        agentRunsThisBatch++;
        logger.info('[Pipeline] Dispatching research agent', {
          jobId, domain, reason: !hasNamedContact ? 'no_named_contact' : 'missing_field',
        });
        const agentResult = await researchDomain({
          domain,
          entityName: parsedIntent.namedEntities?.[0],
          desiredFields: parsedIntent.desiredFields,
          knownContacts: data.contacts,
          pagesAlreadyScraped: data.pageUrls,
        }).catch((err) => {
          logger.warn('[Pipeline] research agent threw', { jobId, domain, err: err instanceof Error ? err.message : String(err) });
          return null;
        });

        if (agentResult && agentResult.additionalContacts.length > 0) {
          const newAiEmailAddrs = new Set(mergedEmails.map(e => e.address.toLowerCase()));
          agentContacts = agentResult.additionalContacts
            .filter(c => c.email && c.confidence >= 0.5 && !newAiEmailAddrs.has(c.email.toLowerCase()))
            .map(c => ({
              address: c.email!.toLowerCase().trim(),
              type: (c.name ? 'business' : 'generic') as 'business' | 'generic',
              confidence: c.confidence,
              source: 'ai_extracted' as const,
              name: c.name,
              title: c.title,
              department: c.department,
            }));

          const newAiPhoneDigits = new Set(mergedPhones.map(p => (p.normalized ?? p.raw).replace(/\D/g, '')));
          agentPhones = agentResult.additionalContacts
            .filter(c => c.phone && c.confidence >= 0.5 && !newAiPhoneDigits.has(c.phone.replace(/\D/g, '')))
            .map(c => ({
              raw: c.phone!,
              normalized: undefined as string | undefined,
              type: undefined as string | undefined,
              countryCode: undefined as string | undefined,
              source: 'ai_extracted' as const,
            }));

          const agentNamed = agentResult.additionalContacts.filter(c => c.name && c.name.length > 1);
          if (agentNamed.length > 0 && !agentContactSummary) {
            agentContactSummary = {
              totalContacts: agentNamed.length,
              topContact: agentNamed[0] ? {
                fullName: agentNamed[0].name!,
                title: agentNamed[0].title ?? '',
                seniority: '',
              } : undefined,
            };
          }

          logger.info('[Pipeline] Research agent enriched lead', {
            jobId, domain, addedEmails: agentContacts.length, addedPhones: agentPhones.length,
            stopReason: agentResult.stopReason, steps: agentResult.toolCallsUsed,
          });
        }
      }

      const finalEmails = [...mergedEmails, ...agentContacts];
      const finalPhones = [...mergedPhones, ...agentPhones];
      const finalContactSummary = agentContactSummary;
```

- [ ] **Step 4: Update the `const lead: LeadRecord = {` block**

Replace:
```typescript
        emails: mergedEmails,
        phones: mergedPhones,
        contactSummary,
```
with:
```typescript
        emails: finalEmails,
        phones: finalPhones,
        contactSummary: finalContactSummary,
```

- [ ] **Step 5: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -40`
Expected: No errors.

- [ ] **Step 6: Commit**
```bash
git add workers/src/pipeline/intentParser.ts
git commit -m "feat: dispatch research agent for thin leads (Pillar 2)"
```

---

## Verification

1. Start the stack: `pnpm turbo dev`
2. Submit: "get me phone number and email of someone at fur alle limited"
3. Watch worker logs. You should see:
   - `[aiContactExtractor] extracted` per scraped page (Pillar 1)
   - `[Pipeline] Dispatching research agent` when a lead has no named contact
   - `[researchAgent] done` with step count and summary
   - `[Pipeline] Research agent enriched lead` with the count of added emails/phones
4. Check the final leads in Mongo — thin leads should now have `contactSummary.topContact` populated with a real person name + title when the agent found one.
5. Open the dashboard, check a lead's drawer — the named contact should appear.

**Success signals:**
- At least 30% of thin leads get enriched with a named contact by the agent.
- Average agent run stays under 4 tool calls (it either finds data fast or gives up).
- Zero hallucinated emails (verify by checking `hasMx: true` in logs for each agent-emitted address).

**Cost check:**
- Per-domain agent run: ~$0.02–0.05 at Gemini Flash rates.
- Budget 3 runs per batch × ~10 batches per job = ~30 runs = ~$0.60–1.50 extra per job.

**Rollback:**
- Set `AGENT_BUDGET_PER_BATCH = 0` to disable.
- Or revert the Task 3 commit.

---

## Next

Pillar 3 — multi-source discovery + real verification:
- Bing + DuckDuckGo fallbacks in `serpScraper.ts`
- OpenCorporates + CAC registry adapters
- Replace broken SMTP probe with reacher.email or ZeroBounce
