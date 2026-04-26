# Quality-Gated Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the prospecting pipeline keep looping until it finds N *AI-verified* good leads, instead of stopping as soon as N leads have any contact data (most of which is noise or trash).

**Architecture:** Fix phone/email collection quality first (Tasks 1-2), then add an inline AI scorer called immediately after enriching each domain (Task 3), then rewire the intentParser stopping condition from `leadsWithContact >= target` to `verifiedLeads.length >= target` using the scorer (Task 4). The loop also tracks pass-rate and switches dork strategy if AI is rejecting >75% of leads.

**Tech Stack:** TypeScript, ioredis, Playwright/Cheerio (pageScraper), OpenRouter AI (existing `env.OPENROUTER_API_KEY`), Mongoose (workers inline model pattern)

---

## File Map

| File | Change |
|------|--------|
| `workers/src/pipeline/pageScraper.ts` | Remove `void PHONE_REGEX` suppression; add body-text phone regex extraction with false-positive filter |
| `workers/src/pipeline/emailDetector.ts` | Add NOISE_PREFIXES blocklist; lower confidence for generic; reject noise outright |
| `workers/src/pipeline/leadScorer.ts` | NEW — inline AI scorer returning `{score, reason, isVerified}` with heuristic fallback |
| `workers/src/pipeline/intentParser.ts` | Replace `leadsWithContact` stopping with `verifiedLeads.length`; call scorer inline; adaptive dork strategy |

---

### Task 1: Fix phone extraction in pageScraper.ts

**Files:**
- Modify: `workers/src/pipeline/pageScraper.ts:31` (PHONE_REGEX definition)
- Modify: `workers/src/pipeline/pageScraper.ts:160-166` (phone extraction block)
- Modify: `workers/src/pipeline/pageScraper.ts:257` (remove `void PHONE_REGEX`)

**Context:** `PHONE_REGEX` is defined at line 31 but suppressed with `void PHONE_REGEX` at line 257 (a lint workaround). Phones are currently extracted ONLY from `tel:` href links (lines 161-166). The body text regex is completely disabled. Most company pages don't use `tel:` links — they write phone numbers as plain text like `+234 1 234 5678`.

The regex `/(?:\+?[\d\s\-().]{7,20})/g` is too permissive — it matches zip codes, dates, prices. We need a tighter pattern and a false-positive filter.

- [ ] **Step 1: Update PHONE_REGEX at line 31 to a tighter pattern**

Replace line 31:
```typescript
const PHONE_REGEX = /(?:\+?[\d\s\-().]{7,20})/g;
```
With:
```typescript
const PHONE_REGEX = /(?:\+?[\d]{1,3}[\s\-.])?(?:\([\d]{1,4}\)[\s\-.])?[\d]{3,5}[\s\-.][\d]{3,5}(?:[\s\-.][\d]{2,5})?/g;
```

- [ ] **Step 2: Replace the phone extraction block (lines 160-166)**

Replace:
```typescript
    // Extract phones from tel: links (PHONE_REGEX kept for reference but tel: links are more reliable)
    const phoneMatches: string[] = [];
    $('a[href^="tel:"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const phone = href.replace('tel:', '');
      if (phone) phoneMatches.push(phone);
    });
```
With:
```typescript
    // Extract phones from tel: links (highest confidence) + body text regex
    const phoneSet = new Set<string>();
    $('a[href^="tel:"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const phone = href.replace('tel:', '').trim();
      if (phone && phone.replace(/\D/g, '').length >= 7) phoneSet.add(phone);
    });
    // Body text regex extraction — filter out obvious false positives (zip codes, years, prices)
    const bodyPhoneMatches = bodyText.match(PHONE_REGEX) ?? [];
    for (const raw of bodyPhoneMatches) {
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) continue;
      // Skip 4-digit years (1900-2099) and plain integers under 8 digits
      if (/^(19|20)\d{2}$/.test(digits)) continue;
      phoneSet.add(raw.trim());
    }
    const phoneMatches = [...phoneSet];
```

- [ ] **Step 3: Remove `void PHONE_REGEX` at line 257**

Remove this line entirely (it's now used in Step 2):
```typescript
// Suppress unused-variable warning for PHONE_REGEX — retained for future text-based extraction
void PHONE_REGEX;
```

- [ ] **Step 4: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 5: Commit**
```bash
git add workers/src/pipeline/pageScraper.ts
git commit -m "fix: re-enable body-text phone extraction in pageScraper"
```

---

### Task 2: Fix email noise filtering in emailDetector.ts

**Files:**
- Modify: `workers/src/pipeline/emailDetector.ts:12` (GENERIC_PREFIXES)
- Modify: `workers/src/pipeline/emailDetector.ts:26-38` (scraped email classification loop)

**Context:** Current `GENERIC_PREFIXES` has only 11 entries and misses common noise addresses. More critically: all scraped emails get `confidence: 0.95` regardless of type — so a `noreply@domain.com` looks as good as `john.smith@domain.com`. We need two changes: (1) add a NOISE blocklist that rejects addresses outright, (2) drop confidence for generic prefixes to 0.6.

- [ ] **Step 1: Add NOISE_PREFIXES constant after line 12**

Replace the `GENERIC_PREFIXES` line:
```typescript
const GENERIC_PREFIXES = ['info', 'contact', 'hello', 'admin', 'support', 'enquiries', 'enquiry', 'sales', 'office', 'mail', 'team'];
```
With:
```typescript
const GENERIC_PREFIXES = [
  'info', 'contact', 'hello', 'admin', 'support', 'enquiries', 'enquiry',
  'sales', 'office', 'mail', 'team', 'help', 'service', 'services',
];

const NOISE_PREFIXES = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'bounce', 'bounces', 'mailer-daemon', 'maildaemon',
  'newsletter', 'newsletters', 'unsubscribe',
  'privacy', 'legal', 'compliance', 'dpo',
  'billing', 'invoice', 'invoices', 'accounts', 'accounting',
  'hr', 'careers', 'jobs', 'recruitment', 'hiring',
  'marketing', 'notifications', 'notify', 'alerts',
  'webmaster', 'postmaster', 'abuse', 'spam',
  'security', 'cert', 'soc',
];
```

- [ ] **Step 2: Update the scraped email classification loop (lines 26-38)**

Replace:
```typescript
  // 1. Classify raw scraped emails
  for (const raw of rawEmails) {
    const addr = raw.toLowerCase().trim();
    if (!EMAIL_REGEX.test(addr) || seen.has(addr)) continue;
    seen.add(addr);
    const prefix = addr.split('@')[0] ?? '';
    const isGeneric = GENERIC_PREFIXES.some(p => prefix === p || prefix.startsWith(p));
    results.push({
      address: addr,
      type: isGeneric ? 'generic' : 'business',
      confidence: 0.95,
      source: 'scraped',
    });
  }
```
With:
```typescript
  // 1. Classify raw scraped emails
  for (const raw of rawEmails) {
    const addr = raw.toLowerCase().trim();
    if (!EMAIL_REGEX.test(addr) || seen.has(addr)) continue;
    seen.add(addr);
    const prefix = addr.split('@')[0] ?? '';
    // Reject noise addresses outright — they are never useful contacts
    if (NOISE_PREFIXES.some(p => prefix === p || prefix.startsWith(p + '-') || prefix.startsWith(p + '.'))) continue;
    const isGeneric = GENERIC_PREFIXES.some(p => prefix === p || prefix.startsWith(p));
    results.push({
      address: addr,
      type: isGeneric ? 'generic' : 'business',
      confidence: isGeneric ? 0.6 : 0.95,
      source: 'scraped',
    });
  }
```

- [ ] **Step 3: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 4: Commit**
```bash
git add workers/src/pipeline/emailDetector.ts
git commit -m "fix: add NOISE_PREFIXES blocklist and lower generic email confidence to 0.6"
```

---

### Task 3: Create inline lead scorer (leadScorer.ts)

**Files:**
- Create: `workers/src/pipeline/leadScorer.ts`

**Context:** Each domain gets enriched and produces a `LeadRecord`. Before deciding if this lead "counts" toward the target, we ask AI: "Is this actually a good lead given what the user asked for?" The scorer calls OpenRouter with a tight prompt and returns `{score, reason, isVerified}`. On any failure (timeout, quota, parse error), it falls back to a heuristic that checks email count, phone count, and completeness.

The OpenRouter base URL is `https://openrouter.ai/api/v1` and the key is in `env.OPENROUTER_API_KEY`. Use model `google/gemini-flash-1.5` (fast + cheap). The function must complete within 8 seconds.

The `ParsedIntent` import lives at `@leadreai/shared`. The `LeadRecord` type comes from `./deduplicator.js`.

- [ ] **Step 1: Create `workers/src/pipeline/leadScorer.ts`**

```typescript
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import type { ParsedIntent } from '@leadreai/shared';
import type { LeadRecord } from './deduplicator.js';

export interface LeadScore {
  score: number;      // 0.0 – 1.0
  reason: string;
  isVerified: boolean; // true if score >= VERIFY_THRESHOLD
}

const VERIFY_THRESHOLD = 0.65;
const AI_TIMEOUT_MS = 8_000;

const SYSTEM_PROMPT = `You are a B2B lead quality evaluator. Given a lead record and what the user was searching for, return a JSON object with:
- score: number 0.0-1.0 (probability this is a good, actionable lead for the user's query)
- reason: one sentence explaining the score

Scoring guide:
- 0.8-1.0: Directly matches the query, has real contact data (named email or phone)
- 0.5-0.79: Plausible match, some contact data present
- 0.2-0.49: Weak match or poor contact data
- 0.0-0.19: Spam, irrelevant, or no usable contact data

Respond ONLY with JSON, no markdown.`;

function buildUserPrompt(lead: LeadRecord, intent: ParsedIntent): string {
  const contacts = [
    lead.emails.map(e => e.address).join(', ') || 'none',
  ].join('; ');
  const phones = lead.phones.map(p => p.normalized ?? p.raw).join(', ') || 'none';

  return `User query intent:
- Industry: ${intent.industry}
- Geography: ${JSON.stringify(intent.geography)}
- Query type: ${intent.queryType}
- Desired fields: ${intent.desiredFields.join(', ')}

Lead data:
- Company: ${lead.companyName}
- Domain: ${lead.companyDomain}
- Emails: ${contacts}
- Phones: ${phones}
- Has LinkedIn: ${lead.socialProfiles?.linkedinUrl ? 'yes' : 'no'}
- Completeness score: ${lead.completenessScore}

Rate this lead's quality for this query.`;
}

function heuristicScore(lead: LeadRecord): LeadScore {
  let score = 0;
  if (lead.emails.some(e => e.type === 'business' && e.confidence >= 0.9)) score += 0.4;
  else if (lead.emails.length > 0) score += 0.2;
  if (lead.phones.length > 0) score += 0.25;
  if (lead.socialProfiles?.linkedinUrl) score += 0.1;
  if (lead.completenessScore >= 60) score += 0.1;
  if (lead.companyDomain && !lead.companyDomain.includes(' ')) score += 0.05;
  const capped = Math.min(score, 1.0);
  return {
    score: capped,
    reason: 'heuristic fallback (AI unavailable)',
    isVerified: capped >= VERIFY_THRESHOLD,
  };
}

export async function scoreLeadRelevance(
  lead: LeadRecord,
  intent: ParsedIntent,
): Promise<LeadScore> {
  if (!env.OPENROUTER_API_KEY) {
    return heuristicScore(lead);
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
          { role: 'user', content: buildUserPrompt(lead, intent) },
        ],
        max_tokens: 120,
        temperature: 0,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      logger.warn('[leadScorer] OpenRouter non-200', { status: res.status, domain: lead.companyDomain });
      return heuristicScore(lead);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const content: string = json?.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content) as { score?: number; reason?: string };
    const score = Math.max(0, Math.min(1, Number(parsed.score ?? 0)));
    const reason = String(parsed.reason ?? 'no reason given');

    logger.debug('[leadScorer] AI score', { domain: lead.companyDomain, score, reason });
    return { score, reason, isVerified: score >= VERIFY_THRESHOLD };
  } catch (err) {
    logger.warn('[leadScorer] AI scoring failed — using heuristic', {
      domain: lead.companyDomain,
      err: err instanceof Error ? err.message : String(err),
    });
    return heuristicScore(lead);
  }
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Commit**
```bash
git add workers/src/pipeline/leadScorer.ts
git commit -m "feat: add inline AI lead scorer with heuristic fallback"
```

---

### Task 4: Rewire intentParser.ts — quality-gated stopping + adaptive dorks

**Files:**
- Modify: `workers/src/pipeline/intentParser.ts:13` (add import)
- Modify: `workers/src/pipeline/intentParser.ts:169-324` (main loop + stopping logic)
- Modify: `workers/src/pipeline/intentParser.ts:327-343` (dedup/rank/write/qualify calls)

**Context:** The current stopping condition at line 301 is `leadsWithContact >= STOP_THRESHOLD`. This counts ANY lead that has an email or phone, even if it's `noreply@domain.com` or a garbage domain. We replace this with `verifiedLeads.length >= STOP_THRESHOLD`, where a lead is "verified" only if `scoreLeadRelevance()` returns `isVerified: true`.

We also track `passRate = verifiedLeads.length / domainsProcessed`. If passRate drops below 0.25 AND we've processed at least 5 domains, we switch dork strategy — instead of the next-batch from SerpCache, we run `buildRound2Dorks` immediately to try a different angle.

The verified leads array replaces `accumulatedLeads` as the thing we pass to dedup/rank/write. Non-verified leads are still deduped/ranked/written but with a lower priority (they end up at the bottom of the ranked list naturally since AI score feeds into rankScore).

**Current relevant lines in intentParser.ts:**
- Line 13: imports end — add `scoreLeadRelevance` import
- Lines 169-170: `accumulatedLeads` and `leadsWithContact` declarations
- Lines 258-308: inner domain processing loop (add scorer call here)
- Lines 301-307: stopping condition (`leadsWithContact >= STOP_THRESHOLD`)
- Lines 327-343: dedup/rank/write/qualify calls

- [ ] **Step 1: Add scoreLeadRelevance import**

Add after the existing imports (after line 22 `import { SerpCache } from '../utils/serpCache.js';`):
```typescript
import { scoreLeadRelevance } from './leadScorer.js';
```

- [ ] **Step 2: Replace accumulatedLeads + leadsWithContact declarations (lines 169-170)**

Replace:
```typescript
  const accumulatedLeads: LeadRecord[] = [];
  const processedDomains = new Set<string>();
  let serpRound = 1;
  let shouldStop = false;
  let leadsWithContact = 0;
```
With:
```typescript
  const allLeads: LeadRecord[] = [];
  const verifiedLeads: LeadRecord[] = [];
  const processedDomains = new Set<string>();
  let serpRound = 1;
  let shouldStop = false;
  let domainsScored = 0;
  let adaptiveDorkFired = false;
```

- [ ] **Step 3: Replace the inner domain processing block (the for loop at ~line 258)**

In the inner `for (const [domain, data] of batchDomainMap.entries())` loop, replace the block that builds `lead` and pushes to `accumulatedLeads`:

Replace from `const lead: LeadRecord = {` through `if (leadsWithContact >= STOP_THRESHOLD) {` — i.e., replace:
```typescript
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
      if (lead.emails.length > 0 || lead.phones.length > 0) leadsWithContact++;

      if (leadsWithContact >= STOP_THRESHOLD) {
        logger.info('[Pipeline] Target count reached — stopping loop', {
          jobId, leadsWithContact, STOP_THRESHOLD,
        });
        shouldStop = true;
        break;
      }
```
With:
```typescript
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

      // Inline AI quality gate — only count leads the AI believes are good
      const aiScore = await scoreLeadRelevance(lead, parsedIntent);
      lead.rankScore = Math.round(aiScore.score * 100);
      allLeads.push(lead);
      domainsScored++;

      if (aiScore.isVerified) {
        verifiedLeads.push(lead);
        logger.info('[Pipeline] Lead verified by AI', {
          jobId, domain, score: aiScore.score, reason: aiScore.reason,
          verifiedCount: verifiedLeads.length, target: STOP_THRESHOLD,
        });
      } else {
        logger.debug('[Pipeline] Lead rejected by AI', {
          jobId, domain, score: aiScore.score, reason: aiScore.reason,
        });
      }

      // Adaptive strategy: if pass rate < 25% after 5+ domains, fire round2 dorks immediately
      const passRate = domainsScored >= 5 ? verifiedLeads.length / domainsScored : 1;
      if (!adaptiveDorkFired && domainsScored >= 5 && passRate < 0.25) {
        adaptiveDorkFired = true;
        logger.info('[Pipeline] Low AI pass rate — firing adaptive round2 dorks', {
          jobId, passRate, domainsScored, verifiedLeads: verifiedLeads.length,
        });
        const adaptiveQueries = buildRound2Dorks(parsedIntent);
        const adaptiveResults = await runSerpSearch(adaptiveQueries).catch(() => []);
        if (adaptiveResults.length > 0) {
          await serpCache.addLinks(jobId, adaptiveResults);
        }
      }

      if (verifiedLeads.length >= STOP_THRESHOLD) {
        logger.info('[Pipeline] Quality target reached — stopping loop', {
          jobId, verifiedLeads: verifiedLeads.length, STOP_THRESHOLD,
        });
        shouldStop = true;
        break;
      }
```

- [ ] **Step 4: Update batch-level progress publishing (~line 311)**

Replace:
```typescript
    await ProspectingJob.findByIdAndUpdate(jobId, {
      'progress.leadsFoundSoFar': accumulatedLeads.length,
    });
    await publisher.publish(
      `job:progress:${jobId}`,
      JSON.stringify({ type: 'progress', leadsFoundSoFar: accumulatedLeads.length })
    );
```
With:
```typescript
    await ProspectingJob.findByIdAndUpdate(jobId, {
      'progress.leadsFoundSoFar': verifiedLeads.length,
    });
    await publisher.publish(
      `job:progress:${jobId}`,
      JSON.stringify({ type: 'progress', leadsFoundSoFar: verifiedLeads.length })
    );
```

- [ ] **Step 5: Update dedup/rank/write calls (~lines 327-343)**

Replace:
```typescript
  // ── Stage 8: Deduplication ───────────────────────────────────────────
  logger.info('[Pipeline] Deduplication starting', { jobId, total: accumulatedLeads.length });
  await progress(jobId, publisher, 'deduplicating', 85, 'deduplication');
  const deduped = deduplicateLeads(accumulatedLeads);
```
With:
```typescript
  // ── Stage 8: Deduplication ───────────────────────────────────────────
  // Use allLeads (not just verifiedLeads) so near-misses are still deduplicated and
  // written — they just rank lower since their rankScore was set by the AI scorer.
  logger.info('[Pipeline] Deduplication starting', {
    jobId, total: allLeads.length, verified: verifiedLeads.length,
  });
  await progress(jobId, publisher, 'deduplicating', 85, 'deduplication');
  const deduped = deduplicateLeads(allLeads);
```

- [ ] **Step 6: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -40`
Expected: No errors in intentParser.ts or leadScorer.ts.

- [ ] **Step 7: Commit**
```bash
git add workers/src/pipeline/intentParser.ts workers/src/pipeline/leadScorer.ts
git commit -m "feat: quality-gated pipeline — AI scorer inline, stop when N verified leads found"
```

---

## Verification

1. Start workers: `cd workers && npm run dev`
2. Run a prospecting job with target 5 leads — watch logs for `[leadScorer] AI score` entries per domain
3. Confirm the pipeline does NOT stop when it hits 5 domains — only when 5 domains pass the AI gate
4. If OpenRouter is unreachable, heuristic fallback kicks in automatically (check logs for `AI scoring failed — using heuristic`)
5. Check final leads in DB: `rankScore` field should now reflect AI confidence (0-100), not the old heuristic rank
6. Verify `leadsFoundSoFar` in SSE progress events increments only when a lead passes the AI gate
