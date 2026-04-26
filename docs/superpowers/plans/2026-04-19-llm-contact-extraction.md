# Pillar 1: LLM Contact Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace raw `EMAIL_REGEX` + `PHONE_REGEX` output with LLM-extracted structured contacts — each contact carries name, title, email, phone, department, and a per-contact confidence score driven by contextual understanding (not pattern matching).

**Architecture:** Per-page, after Cheerio parses the HTML, we send cleaned text + JSON-LD structured data + regex hints to Gemini Flash via OpenRouter. It returns a JSON array of `ContactCandidate` objects. Downstream `intentParser.ts` prefers this structured data over raw regex when building the `LeadRecord`.

**Tech Stack:** OpenRouter (Gemini Flash), Cheerio (JSON-LD parsing), existing `env.OPENROUTER_API_KEY`

**Reference:** `docs/engine-architecture-vision.md` — Pillar 1 rationale.

---

## File Map

| File | Change |
|------|--------|
| `workers/src/pipeline/aiContactExtractor.ts` | **New.** LLM extraction call + `ContactCandidate` type |
| `workers/src/pipeline/pageScraper.ts` | Parse JSON-LD; call extractor; add `extractedContacts` to `PageScrapedData` |
| `workers/src/pipeline/intentParser.ts` | Prefer `extractedContacts` over raw `emails`/`phones` when building `LeadRecord` |

---

### Task 1: Create `aiContactExtractor.ts`

**Files:**
- Create: `workers/src/pipeline/aiContactExtractor.ts`

**Context:** The extractor takes raw scrape output (HTML text + JSON-LD + regex hints) and returns structured contacts. OpenRouter pattern is already established in `workers/src/pipeline/leadScorer.ts` — copy that fetch/timeout/fallback structure.

The heuristic fallback (when AI is unavailable) just wraps the regex hints as low-confidence candidates so downstream code still gets something.

- [ ] **Step 1: Create the file**

```typescript
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export interface ContactCandidate {
  name?: string;
  title?: string;
  department?: string;
  email?: string;
  phone?: string;
  confidence: number;   // 0.0 - 1.0
  reasoning?: string;
  sourceType: 'structured_data' | 'staff_card' | 'contact_block' | 'body_text' | 'regex_fallback';
}

export interface ExtractInput {
  url: string;
  domain: string;
  bodyText: string;
  jsonLd?: unknown[];
  rawEmails: string[];
  rawPhones: string[];
  entityHint?: string;
}

const AI_TIMEOUT_MS = 12_000;
const MAX_TEXT_CHARS = 8_000;

const SYSTEM_PROMPT = `You extract real business contact data from scraped web pages.

You will receive:
- The page URL and domain
- Cleaned body text (first ~8k characters)
- Structured data from JSON-LD tags (schema.org Organization, Person, ContactPoint)
- Raw regex hits for emails and phones (may include noise, false positives, placeholders)
- An optional entity hint (the company we are researching)

Return a JSON object: { "contacts": [ContactCandidate, ...] }

Each ContactCandidate may include: name, title, department, email, phone, confidence (0-1), reasoning (one short phrase), sourceType (one of: structured_data, staff_card, contact_block, body_text, regex_fallback).

RULES:
- Only emit contacts where the data appears to be REAL and ASSOCIATED WITH THE COMPANY on this page.
- Reject placeholders: example.com, test@, firstname.lastname@, your@email.com, code-snippet strings.
- Reject noise prefixes: noreply, no-reply, bounce, newsletter, mailer-daemon, unsubscribe, privacy, legal, billing, hr, marketing, abuse, postmaster.
- Prefer named contacts (with title/name) over generic mailboxes. A CEO with name and email gets confidence 0.9+; a generic info@ gets 0.5-0.6.
- If the page is clearly a directory/list page featuring multiple organizations, only emit contacts that belong to the hinted entity (if given). Otherwise emit the most prominent company's contacts.
- If you cannot find any real contacts, return { "contacts": [] }.
- Return ONLY JSON, no markdown, no code fences.`;

function buildUserPrompt(input: ExtractInput): string {
  const text = input.bodyText.slice(0, MAX_TEXT_CHARS);
  const jsonLd = input.jsonLd && input.jsonLd.length > 0
    ? JSON.stringify(input.jsonLd).slice(0, 3000)
    : 'none';
  return `URL: ${input.url}
Domain: ${input.domain}
Entity hint: ${input.entityHint ?? 'none'}

Regex-matched emails (hints, may contain noise): ${input.rawEmails.slice(0, 30).join(', ') || 'none'}
Regex-matched phones (hints, may contain noise): ${input.rawPhones.slice(0, 30).join(', ') || 'none'}

JSON-LD structured data: ${jsonLd}

Page body text:
${text}`;
}

function fallbackFromHints(input: ExtractInput): ContactCandidate[] {
  const out: ContactCandidate[] = [];
  for (const email of input.rawEmails.slice(0, 10)) {
    out.push({ email, confidence: 0.4, sourceType: 'regex_fallback' });
  }
  for (const phone of input.rawPhones.slice(0, 10)) {
    out.push({ phone, confidence: 0.4, sourceType: 'regex_fallback' });
  }
  return out;
}

export async function extractContacts(input: ExtractInput): Promise<ContactCandidate[]> {
  if (!env.OPENROUTER_API_KEY) {
    return fallbackFromHints(input);
  }
  if (!input.bodyText.trim() && input.rawEmails.length === 0 && input.rawPhones.length === 0) {
    return [];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://leadreai.app',
      },
      body: JSON.stringify({
        model: 'google/gemini-flash-1.5',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(input) },
        ],
        max_tokens: 1200,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      logger.warn('[aiContactExtractor] OpenRouter non-200', { status: res.status, domain: input.domain });
      return fallbackFromHints(input);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const content: string = json?.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as { contacts?: ContactCandidate[] };
    const contacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];

    const cleaned = contacts
      .filter(c => c && (c.email || c.phone || c.name))
      .map(c => ({
        ...c,
        confidence: Math.max(0, Math.min(1, Number(c.confidence ?? 0.5))),
        sourceType: c.sourceType ?? 'body_text',
      }));

    logger.info('[aiContactExtractor] extracted', {
      domain: input.domain,
      count: cleaned.length,
      rawEmails: input.rawEmails.length,
      rawPhones: input.rawPhones.length,
    });
    return cleaned;
  } catch (err) {
    logger.warn('[aiContactExtractor] extraction failed — using regex fallback', {
      domain: input.domain,
      err: err instanceof Error ? err.message : String(err),
    });
    return fallbackFromHints(input);
  }
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**
```bash
git add workers/src/pipeline/aiContactExtractor.ts
git commit -m "feat: LLM contact extractor with regex fallback (Pillar 1)"
```

---

### Task 2: Integrate extractor into `pageScraper.ts`

**Files:**
- Modify: `workers/src/pipeline/pageScraper.ts`

**Context:** After Cheerio parses the HTML (around line 143), we also need to:
1. Extract JSON-LD blobs from `<script type="application/ld+json">` tags
2. Call `extractContacts()` with all the collected data
3. Add the result to `PageScrapedData.extractedContacts`

We keep the existing `emails` and `phones` fields populated from regex (backward-compat + used as hints for the AI).

- [ ] **Step 1: Add import (at top of file, after existing imports)**

Add:
```typescript
import { extractContacts, type ContactCandidate } from './aiContactExtractor.js';
```

- [ ] **Step 2: Add `extractedContacts` to `PageScrapedData` interface (around line 35)**

Change:
```typescript
export interface PageScrapedData {
  url: string;
  emails: string[];
  phones: string[];
  fileUrls: string[];
  companyName?: string;
  linkedinUrl?: string;
  pageText: string;
}
```
To:
```typescript
export interface PageScrapedData {
  url: string;
  emails: string[];
  phones: string[];
  fileUrls: string[];
  companyName?: string;
  linkedinUrl?: string;
  pageText: string;
  extractedContacts: ContactCandidate[];
}
```

- [ ] **Step 3: Parse JSON-LD inside `scrapePage()` (after `const $ = cheerioLoad(html);` at ~line 143)**

After the line `$('script, style, nav, footer').remove();` (which removes script tags!), we need to extract JSON-LD FIRST, before removal. Find this block:
```typescript
    const html = await page.content();
    const $ = cheerioLoad(html);

    // Remove script/style noise
    $('script, style, nav, footer').remove();
```

Replace with:
```typescript
    const html = await page.content();
    const $ = cheerioLoad(html);

    // Extract JSON-LD structured data BEFORE stripping script tags
    const jsonLdBlobs: unknown[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).contents().text().trim();
      if (!raw) return;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) jsonLdBlobs.push(...parsed);
        else jsonLdBlobs.push(parsed);
      } catch { /* ignore malformed JSON-LD */ }
    });

    // Remove script/style noise for text extraction
    $('script, style, nav, footer').remove();
```

- [ ] **Step 4: Call the extractor before `return` (around line 204)**

Find the block that returns `PageScrapedData`:
```typescript
    // Small rate-limit delay
    await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS));

    return {
      url,
      emails: emailMatches.filter(e => e.includes('@') && !e.includes('example.com')),
      phones: phoneMatches,
      fileUrls: foundFileUrls,
      companyName,
      linkedinUrl,
      pageText: bodyText.slice(0, 2000),
    };
```

Replace with:
```typescript
    // Small rate-limit delay
    await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS));

    const cleanEmails = emailMatches.filter(e => e.includes('@') && !e.includes('example.com'));

    // LLM contact extraction — understands context, filters noise, pulls from JSON-LD + staff cards
    const extractedContacts = await extractContacts({
      url,
      domain: new URL(url).hostname.replace(/^www\./, ''),
      bodyText,
      jsonLd: jsonLdBlobs,
      rawEmails: cleanEmails,
      rawPhones: phoneMatches,
    }).catch((err) => {
      logger.warn('pageScraper: extractContacts threw', { url, err: err instanceof Error ? err.message : String(err) });
      return [] as ContactCandidate[];
    });

    return {
      url,
      emails: cleanEmails,
      phones: phoneMatches,
      fileUrls: foundFileUrls,
      companyName,
      linkedinUrl,
      pageText: bodyText.slice(0, 2000),
      extractedContacts,
    };
```

- [ ] **Step 5: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 6: Commit**
```bash
git add workers/src/pipeline/pageScraper.ts
git commit -m "feat: pageScraper emits JSON-LD + AI-extracted contacts (Pillar 1)"
```

---

### Task 3: Use extracted contacts in `intentParser.ts`

**Files:**
- Modify: `workers/src/pipeline/intentParser.ts`

**Context:** `intentParser.ts` aggregates per-domain scrape data into a `batchDomainMap`, then builds `LeadRecord` with regex-derived `emails` and `phones`. We now also aggregate the LLM-extracted `ContactCandidate[]` per domain, and when building the `LeadRecord` we:
1. **If the extractor returned named contacts with emails**: use those as the primary `emails` array with their confidence scores.
2. **Phones similarly.**
3. **Regex-derived emails/phones become secondary fallback**, merged in only for addresses/numbers the AI missed.

The `emails` field on `LeadRecord` has shape `{address, type, confidence, source}`. We map `ContactCandidate → email` with:
- `address` = `candidate.email`
- `type` = infer: if `name` present → `business`; else `generic`
- `confidence` = `candidate.confidence`
- `source` = `'ai_extracted'`

Named candidates also populate `LeadRecord.contactSummary` (already a field — see `frontend/src/components/leads/LeadTable.tsx:35`).

- [ ] **Step 1: Find the domain aggregation loop and the `LeadRecord` build block**

Around line 260-290 the file has:
```typescript
    const batchDomainMap = new Map<string, {
      emails: string[]; phones: string[]; pageUrls: string[];
      linkedinUrl?: string; companyName?: string;
    }>();

    for (const page of pageData) {
      // aggregate...
    }
```

Read the full block — the exact shape varies. We need to add a `contacts: ContactCandidate[]` field to the aggregation.

- [ ] **Step 2: Update the map value type and aggregation**

Find:
```typescript
    const batchDomainMap = new Map<string, {
      emails: string[]; phones: string[]; pageUrls: string[];
      linkedinUrl?: string; companyName?: string;
    }>();
```

Replace with:
```typescript
    const batchDomainMap = new Map<string, {
      emails: string[]; phones: string[]; pageUrls: string[];
      linkedinUrl?: string; companyName?: string;
      contacts: ContactCandidate[];
    }>();
```

Add import at the top:
```typescript
import type { ContactCandidate } from './aiContactExtractor.js';
```

- [ ] **Step 3: Populate `contacts` in the aggregation loop**

Find the page-aggregation block:
```typescript
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
```

Replace with:
```typescript
    for (const page of pageData) {
      if (page.url === 'collected-files') continue;
      const domain = getDomain(page.url);
      if (processedDomains.has(domain)) continue;
      const existing = batchDomainMap.get(domain) ?? { emails: [], phones: [], pageUrls: [], contacts: [] };
      existing.emails.push(...page.emails);
      existing.phones.push(...page.phones);
      existing.pageUrls.push(page.url);
      existing.contacts.push(...page.extractedContacts);
      if (page.linkedinUrl && !existing.linkedinUrl) existing.linkedinUrl = page.linkedinUrl;
      if (page.companyName && !existing.companyName) existing.companyName = page.companyName;
      batchDomainMap.set(domain, existing);
    }
```

The `fileData` loop (file-extracted content) that follows needs to also create entries with a `contacts: []` default. Find:
```typescript
    for (const file of fileData) {
      const domain = getDomain(file.url);
      if (processedDomains.has(domain)) continue;
      const existing = batchDomainMap.get(domain) ?? { emails: [], phones: [], pageUrls: [] };
```

Replace the default-object literal with `{ emails: [], phones: [], pageUrls: [], contacts: [] }`.

- [ ] **Step 4: Use AI contacts when building the LeadRecord**

Find the `const lead: LeadRecord = { ... }` block. Look specifically at the `emails:` and `phones:` assignments:

```typescript
        emails: detectedEmails.map(e => ({
          address: e.address, type: e.type, confidence: e.confidence, source: e.source,
        })),
        phones: normalizedPhones.filter(p => p.isValid).map(p => ({
          raw: p.raw, normalized: p.normalized, type: p.type,
          countryCode: p.countryCode, source: 'scraped',
        })),
```

Just BEFORE the `const lead: LeadRecord = {` line, add:

```typescript
      // Build AI-extracted email set (takes precedence over regex hits)
      const aiEmails = data.contacts
        .filter(c => c.email && c.confidence >= 0.4)
        .map(c => ({
          address: c.email!.toLowerCase().trim(),
          type: (c.name ? 'business' : 'generic') as 'business' | 'generic',
          confidence: c.confidence,
          source: 'ai_extracted' as const,
          name: c.name,
          title: c.title,
          department: c.department,
        }));
      // Merge: prefer AI emails; add regex emails the AI missed (marked lower confidence)
      const aiEmailAddrs = new Set(aiEmails.map(e => e.address));
      const regexEmails = detectedEmails
        .filter(e => !aiEmailAddrs.has(e.address.toLowerCase()))
        .map(e => ({ address: e.address, type: e.type, confidence: e.confidence, source: e.source }));
      const mergedEmails = [...aiEmails, ...regexEmails];

      // Same strategy for phones
      const aiPhones = data.contacts
        .filter(c => c.phone && c.confidence >= 0.4)
        .map(c => ({
          raw: c.phone!,
          normalized: undefined,
          type: undefined,
          countryCode: undefined,
          source: 'ai_extracted' as const,
        }));
      const aiPhoneRaws = new Set(aiPhones.map(p => p.raw.replace(/\D/g, '')));
      const regexPhones = normalizedPhones
        .filter(p => p.isValid && !aiPhoneRaws.has((p.normalized ?? p.raw).replace(/\D/g, '')))
        .map(p => ({ raw: p.raw, normalized: p.normalized, type: p.type, countryCode: p.countryCode, source: 'scraped' as const }));
      const mergedPhones = [...aiPhones, ...regexPhones];

      // Build contactSummary from AI-extracted named contacts (used by UI LeadDetailDrawer)
      const namedContacts = data.contacts.filter(c => c.name && c.name.length > 1);
      const contactSummary = namedContacts.length > 0 ? {
        totalContacts: namedContacts.length,
        topContact: namedContacts[0] ? {
          fullName: namedContacts[0].name!,
          title: namedContacts[0].title ?? '',
          seniority: '',
        } : undefined,
      } : undefined;
```

Then in the `const lead: LeadRecord = {` block, replace:

```typescript
        emails: detectedEmails.map(e => ({
          address: e.address, type: e.type, confidence: e.confidence, source: e.source,
        })),
        phones: normalizedPhones.filter(p => p.isValid).map(p => ({
          raw: p.raw, normalized: p.normalized, type: p.type,
          countryCode: p.countryCode, source: 'scraped',
        })),
```

With:
```typescript
        emails: mergedEmails,
        phones: mergedPhones,
        contactSummary,
```

- [ ] **Step 5: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -40`
Expected: No errors. If the `LeadRecord` type complains about `contactSummary` or the new email shape, read `workers/src/pipeline/deduplicator.ts` to see the actual `LeadRecord` type and adjust. The schema is `strict: false` on the Mongo side, so extra fields pass through; the TS type is the gate.

If the TS error is that `LeadRecord.emails` has a narrower type, update the `LeadRecord` interface in `deduplicator.ts` to include optional `name?`, `title?`, `department?` on emails, and support `'ai_extracted'` on source.

- [ ] **Step 6: Commit**
```bash
git add workers/src/pipeline/intentParser.ts workers/src/pipeline/deduplicator.ts
git commit -m "feat: intentParser prefers AI-extracted contacts over regex (Pillar 1)"
```

---

## Verification

1. Start the stack: `pnpm turbo dev`
2. Submit a query like: **"get me phone number and email of someone at fur alle limited"**
3. Watch worker logs for `[aiContactExtractor] extracted` entries — each page scrape should produce one.
4. On the leads page, hover/open a lead. Named contacts (with title) should appear in the drawer.
5. Confirm regex false positives (noreply, example.com, code-snippet strings) no longer reach the final lead.

**Success signals:**
- `extractedContacts` field populates with 1+ real contacts per real company page.
- Named contacts (CEO, founder, partner) appear with titles.
- Email noise (`donotreply@`, `bounce@`) is filtered before hitting the DB.
- Leads now show `topContact.fullName` in the UI.

**Rollback:** Remove the `extractContacts()` call in `pageScraper.ts:Step 4` — regex path still works since `emails` and `phones` fields are still populated.

---

## Next Pillars

After Pillar 1 ships and is stable:
- **Pillar 2**: Per-lead research agent (`workers/src/pipeline/researchAgent.ts` with tool loop)
- **Pillar 3**: Multi-source discovery (Bing + DuckDuckGo + OpenCorporates + CAC) + real verification (reacher.email / ZeroBounce)

See `docs/engine-architecture-vision.md` for full scope.
