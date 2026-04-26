# Pillar 3: Multi-Source Discovery + Real Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Stop relying on a single search engine + a broken email verifier. Add Bing & DuckDuckGo as SerpAPI fallback engines, add the OpenCorporates global business registry as a data source, and make email verification pluggable with a `reacher.email` provider replacing the unusable port-25 SMTP probe.

**Architecture:** Three independent additions:
1. Rewrite `serpScraper.ts` to call SerpAPI via `fetch` so we can switch the `engine` parameter; add `runMultiEngineSearch()` that tries Google → Bing → DuckDuckGo and merges.
2. Add `workers/src/pipeline/registries/opencorporates.ts` — free API that returns registered company name, address, officers. Integrate after entity resolution so the research agent gets director names to permute emails against.
3. Replace `tools/verifyEmail.ts` with a provider-dispatching version: `reacher` (HTTP call to self-hosted reacher.email) or `mx_only` (current fallback). Config-driven via env.

**Tech Stack:** native `fetch`, SerpAPI, OpenCorporates public API, optional reacher.email Docker container.

**Reference:** `docs/engine-architecture-vision.md` — Pillar 3 rationale.

---

## File Map

| File | Change |
|------|--------|
| `workers/src/pipeline/serpScraper.ts` | Rewrite with `fetch` + `engine` param; export `runMultiEngineSearch()` |
| `workers/src/config/env.ts` | Add `OPENCORPORATES_API_KEY`, `REACHER_URL`, `EMAIL_VERIFIER_PROVIDER` |
| `workers/src/pipeline/registries/opencorporates.ts` | **New.** Search + enrich via OpenCorporates |
| `workers/src/pipeline/intentParser.ts` | Call OpenCorporates after entity resolution; use multi-engine for round 2 |
| `workers/src/pipeline/tools/verifyEmail.ts` | Dispatch to provider (`reacher` or `mx_only`) |

---

### Task 1: Multi-engine SerpAPI

**Files:**
- Modify: `workers/src/pipeline/serpScraper.ts`

**Context:** Current implementation uses `google-search-results-nodejs` which is Google-only. Rewrite with `fetch` to hit `https://serpapi.com/search.json` directly — then `engine=google|bing|duckduckgo` is just a query parameter. Keep existing `runSerpSearch(queries)` signature for backward compat; add an optional engine param defaulting to `'google'`. Add new `runMultiEngineSearch()`.

All three engines return `organic_results: [{link, title, snippet}]`.

- [ ] **Step 1: Rewrite `serpScraper.ts`**

Replace the ENTIRE file contents with:

```typescript
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface SerpResult {
  url: string;
  title: string;
  snippet: string;
  isFilePath: boolean;
  engine?: 'google' | 'bing' | 'duckduckgo';
}

export type SerpEngine = 'google' | 'bing' | 'duckduckgo';

const FILE_EXTENSIONS = /\.(pdf|docx?|xlsx?)(\?.*)?$/i;
const SERPAPI_BASE = 'https://serpapi.com/search.json';
const QUERY_TIMEOUT_MS = 15_000;
const INTER_QUERY_DELAY_MS = 500;

interface SerpApiOrganic {
  link?: string;
  title?: string;
  snippet?: string;
}

async function callSerpApi(query: string, engine: SerpEngine): Promise<SerpApiOrganic[]> {
  const params = new URLSearchParams({
    engine,
    q: query,
    api_key: env.SERPAPI_KEY!,
  });
  // Engine-specific tuning
  if (engine === 'google') { params.set('num', '10'); params.set('hl', 'en'); }
  else if (engine === 'bing') { params.set('count', '10'); }
  else if (engine === 'duckduckgo') { params.set('kl', 'us-en'); }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
  try {
    const res = await fetch(`${SERPAPI_BASE}?${params.toString()}`, { signal: controller.signal });
    if (!res.ok) {
      logger.warn('[serpScraper] non-200', { engine, status: res.status });
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    return (data?.organic_results as SerpApiOrganic[] | undefined) ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function runSerpSearch(queries: string[], engine: SerpEngine = 'google'): Promise<SerpResult[]> {
  if (!env.SERPAPI_KEY) {
    logger.warn('SERPAPI_KEY not set — skipping SerpAPI search');
    return [];
  }

  const seen = new Set<string>();
  const results: SerpResult[] = [];

  for (const query of queries) {
    try {
      const organic = await callSerpApi(query, engine);
      for (const r of organic) {
        const url = r.link;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        results.push({
          url,
          title: r.title ?? '',
          snippet: r.snippet ?? '',
          isFilePath: FILE_EXTENSIONS.test(url),
          engine,
        });
      }
      await new Promise(resolve => setTimeout(resolve, INTER_QUERY_DELAY_MS));
    } catch (err) {
      logger.warn('SerpAPI query failed', { query, engine, err: err instanceof Error ? err.message : String(err) });
    }
  }

  logger.info('SerpAPI search complete', { queries: queries.length, results: results.length, engine });
  return results;
}

/**
 * Run the same queries across multiple engines, merging + deduping results.
 * Useful when Google returns few results (blocked, niche query, non-English market).
 * Engines are tried in order; if Google alone exceeds `sufficientCount`, the later engines are skipped.
 */
export async function runMultiEngineSearch(
  queries: string[],
  opts: { engines?: SerpEngine[]; sufficientCount?: number } = {},
): Promise<SerpResult[]> {
  const engines = opts.engines ?? ['google', 'bing', 'duckduckgo'];
  const sufficient = opts.sufficientCount ?? 15;

  const merged = new Map<string, SerpResult>();
  for (const engine of engines) {
    const batch = await runSerpSearch(queries, engine);
    for (const r of batch) {
      if (!merged.has(r.url)) merged.set(r.url, r);
    }
    if (merged.size >= sufficient) {
      logger.info('[serpScraper] multi-engine: sufficient results, skipping remaining engines', {
        stoppedAfter: engine, have: merged.size,
      });
      break;
    }
  }

  const results = [...merged.values()];
  logger.info('[serpScraper] multi-engine complete', {
    enginesTried: engines.slice(0, engines.indexOf(engines.find(e => merged.size > 0 ? e : engines[engines.length - 1])!) + 1).length,
    totalResults: results.length,
  });
  return results;
}
```

- [ ] **Step 2: Remove the `google-search-results-nodejs` dependency (optional)**

Since we no longer use the library, it can be removed. But leave it in `package.json` for now if removal needs extra verification — dead dependency is not a blocker. Skip this step.

- [ ] **Step 3: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors. Callers of `runSerpSearch(queries)` still work (engine defaults to google).

- [ ] **Step 4: Commit**
```bash
git add workers/src/pipeline/serpScraper.ts
git commit -m "feat: multi-engine SerpAPI (google/bing/duckduckgo) (Pillar 3)"
```

---

### Task 2: OpenCorporates registry adapter

**Files:**
- Modify: `workers/src/config/env.ts`
- Create: `workers/src/pipeline/registries/opencorporates.ts`
- Modify: `workers/src/pipeline/intentParser.ts`

**Context:** OpenCorporates exposes a free API (500/day unauthenticated, more with an API key) that returns registered company data across most jurisdictions. For every resolved named entity, we query OpenCorporates to get:
- Registered address
- Officers (directors) with names + positions
- Official company number

Officer names flow to the research agent's `knownContacts` — the agent can then permute their email patterns against the domain. This is the biggest contact-discovery lever we've added: human names matter.

- [ ] **Step 1: Add env vars**

Edit `workers/src/config/env.ts`. In the `envSchema = z.object({...})`, add these lines after the existing entries:

```typescript
  OPENCORPORATES_API_KEY: z.string().optional(),
  REACHER_URL: z.string().url().optional(),
  EMAIL_VERIFIER_PROVIDER: z.enum(['mx_only', 'reacher']).default('mx_only'),
```

- [ ] **Step 2: Create `workers/src/pipeline/registries/opencorporates.ts`**

```typescript
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

export interface RegistryOfficer {
  name: string;
  position?: string;
  startDate?: string;
  endDate?: string;
}

export interface RegistryCompany {
  name: string;
  companyNumber: string;
  jurisdictionCode: string;
  registeredAddress?: string;
  incorporationDate?: string;
  companyType?: string;
  status?: string;
  officers: RegistryOfficer[];
  openCorporatesUrl?: string;
}

const BASE = 'https://api.opencorporates.com/v0.4';
const TIMEOUT_MS = 10_000;

// Country name → ISO 3166 alpha-2 → OpenCorporates jurisdiction code (usually lowercase alpha-2)
const COUNTRY_TO_JURISDICTION: Record<string, string> = {
  nigeria: 'ng',
  'united kingdom': 'gb',
  uk: 'gb',
  britain: 'gb',
  'united states': 'us',
  usa: 'us',
  us: 'us',
  canada: 'ca',
  australia: 'au',
  india: 'in',
  germany: 'de',
  france: 'fr',
  spain: 'es',
  italy: 'it',
  'south africa': 'za',
  kenya: 'ke',
  ghana: 'gh',
  singapore: 'sg',
  'hong kong': 'hk',
};

function jurisdictionFromCountry(country?: string): string | undefined {
  if (!country) return undefined;
  return COUNTRY_TO_JURISDICTION[country.toLowerCase().trim()];
}

function withApiKey(params: URLSearchParams): URLSearchParams {
  if (env.OPENCORPORATES_API_KEY) params.set('api_token', env.OPENCORPORATES_API_KEY);
  return params;
}

async function httpJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      logger.debug('[opencorporates] non-200', { url, status: res.status });
      return null;
    }
    return await res.json() as T;
  } catch (err) {
    logger.debug('[opencorporates] request failed', { url, err: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCompany(raw: any): RegistryCompany | null {
  const c = raw?.company;
  if (!c?.name || !c?.company_number || !c?.jurisdiction_code) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const officers: RegistryOfficer[] = (c.officers ?? []).map((o: any) => ({
    name: o?.officer?.name ?? '',
    position: o?.officer?.position,
    startDate: o?.officer?.start_date,
    endDate: o?.officer?.end_date,
  })).filter((o: RegistryOfficer) => o.name);

  return {
    name: c.name,
    companyNumber: c.company_number,
    jurisdictionCode: c.jurisdiction_code,
    registeredAddress: c.registered_address_in_full,
    incorporationDate: c.incorporation_date,
    companyType: c.company_type,
    status: c.current_status,
    officers,
    openCorporatesUrl: c.opencorporates_url,
  };
}

/**
 * Search OpenCorporates for a company by name. Returns the best matches (up to `limit`),
 * optionally scoped to a country's jurisdiction code.
 */
export async function searchCompany(
  name: string,
  country?: string,
  limit = 3,
): Promise<RegistryCompany[]> {
  const params = withApiKey(new URLSearchParams({ q: name, per_page: String(limit) }));
  const juris = jurisdictionFromCountry(country);
  if (juris) params.set('jurisdiction_code', juris);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await httpJson<any>(`${BASE}/companies/search?${params.toString()}`);
  if (!data?.results?.companies) return [];

  const companies: RegistryCompany[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const entry of data.results.companies as any[]) {
    const norm = normalizeCompany(entry);
    if (norm) companies.push(norm);
    if (companies.length >= limit) break;
  }
  return companies;
}

/**
 * Fetch full company record including officers. The search endpoint doesn't always
 * populate officers — this endpoint does.
 */
export async function fetchCompanyDetails(
  jurisdictionCode: string,
  companyNumber: string,
): Promise<RegistryCompany | null> {
  const params = withApiKey(new URLSearchParams());
  const qs = params.toString();
  const url = `${BASE}/companies/${jurisdictionCode}/${encodeURIComponent(companyNumber)}${qs ? `?${qs}` : ''}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await httpJson<any>(url);
  if (!data?.results) return null;
  return normalizeCompany(data.results);
}

/**
 * Top-level helper: given a company name + optional country, find the best match
 * and return its enriched record with officers. Returns null if no match.
 */
export async function enrichEntity(
  name: string,
  country?: string,
): Promise<RegistryCompany | null> {
  const matches = await searchCompany(name, country, 3);
  if (matches.length === 0) {
    logger.debug('[opencorporates] no matches', { name, country });
    return null;
  }
  const top = matches[0]!;
  // If the search result already has officers, return it. Otherwise fetch details.
  if (top.officers.length > 0) return top;
  const detailed = await fetchCompanyDetails(top.jurisdictionCode, top.companyNumber);
  return detailed ?? top;
}
```

- [ ] **Step 3: Wire OpenCorporates into `intentParser.ts`**

After the entity-resolution stage (Stage 1), add a new Stage 1b: enrich each named entity via OpenCorporates. The enriched data (especially officer names) flows into the research agent later.

Read `workers/src/pipeline/intentParser.ts` to find the entity resolution block — it's the `if ((parsedIntent.queryType === 'named_entity_list' || parsedIntent.queryType === 'contact_lookup') && !parsedIntent.namedEntities?.length) {` block. AFTER that block closes (after its closing `}`), add:

```typescript
  // ── Stage 1b: Registry enrichment via OpenCorporates ─────────────────
  const registryEntities: Array<{ name: string; officers: string[]; address?: string }> = [];
  if (
    (parsedIntent.queryType === 'named_entity_list' || parsedIntent.queryType === 'contact_lookup') &&
    (parsedIntent.namedEntities?.length ?? 0) > 0
  ) {
    logger.info('[Pipeline] [1b] Querying OpenCorporates for registered officers', { jobId });
    for (const entityName of parsedIntent.namedEntities!.slice(0, 5)) {
      const enriched = await enrichEntity(entityName, parsedIntent.geography?.country).catch(() => null);
      if (enriched && enriched.officers.length > 0) {
        registryEntities.push({
          name: enriched.name,
          officers: enriched.officers.map(o => o.name).filter(Boolean),
          address: enriched.registeredAddress,
        });
        logger.info('[Pipeline] [1b] Registry hit', {
          jobId, entity: enriched.name, officers: enriched.officers.length,
        });
      }
    }
  }
```

Add the import at the top of `intentParser.ts`:
```typescript
import { enrichEntity } from './registries/opencorporates.js';
```

- [ ] **Step 4: Pass registry officers to the research agent**

Inside the inner domain loop, when the research agent is dispatched, find the `knownContacts: data.contacts,` line in the `researchDomain({...})` call. Augment the knownContacts with registry officers (matched by entity name roughly):

**Before** the `researchDomain({...})` call, build a merged knownContacts:
```typescript
        const matchingRegistryOfficers = registryEntities
          .filter(e => {
            const entityDomainHint = e.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const currentDomain = domain.toLowerCase().replace(/[^a-z0-9]/g, '');
            return currentDomain.includes(entityDomainHint.slice(0, Math.min(entityDomainHint.length, 12))) ||
                   entityDomainHint.includes(currentDomain.replace(/(com|net|org|io|co|ng|uk)$/, ''));
          })
          .flatMap(e => e.officers.slice(0, 6).map(name => ({
            name,
            confidence: 0.6,
            sourceType: 'structured_data' as const,
          })));
        const agentKnownContacts = [...data.contacts, ...matchingRegistryOfficers];
```

Then in the `researchDomain({...})` call, change:
```typescript
          knownContacts: data.contacts,
```
to:
```typescript
          knownContacts: agentKnownContacts,
```

- [ ] **Step 5: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -40`
Expected: No errors. If `ContactCandidate` type complains about the shape we're adding (no email/phone, just name), check its interface — the plan says name/email/phone are all optional, so this should work.

- [ ] **Step 6: Commit**
```bash
git add workers/src/config/env.ts workers/src/pipeline/registries/ workers/src/pipeline/intentParser.ts
git commit -m "feat: OpenCorporates registry enrichment — officer names feed research agent (Pillar 3)"
```

---

### Task 3: Pluggable email verifier with reacher.email

**Files:**
- Modify: `workers/src/pipeline/tools/verifyEmail.ts`

**Context:** The current `verifyEmail` does MX-only (bulletproof but doesn't confirm the mailbox exists). Add a `reacher` provider that calls a self-hosted reacher.email instance. The reacher service runs as a Docker container that SMTP-probes the target mail server from infrastructure with whitelisted outbound port 25.

Selection is env-driven:
- `EMAIL_VERIFIER_PROVIDER=mx_only` (default) — current behavior
- `EMAIL_VERIFIER_PROVIDER=reacher` + `REACHER_URL=http://localhost:8080` — call reacher

Reacher's API: `POST /v0/check_email` with `{to_email, from_email?, hello_name?}`. Response has `is_reachable: 'safe' | 'risky' | 'invalid' | 'unknown'` plus granular MX/SMTP details.

- [ ] **Step 1: Replace `workers/src/pipeline/tools/verifyEmail.ts`**

Full replacement:

```typescript
import { promises as dns } from 'dns';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export interface VerifyResult {
  address: string;
  hasMx: boolean;
  mxHost?: string;
  verdict: 'likely_valid' | 'likely_catch_all' | 'invalid_domain' | 'undeliverable' | 'risky' | 'unknown';
  provider: 'mx_only' | 'reacher';
  reasoning?: string;
}

const mxCache = new Map<string, { hasMx: boolean; mxHost?: string }>();
const REACHER_TIMEOUT_MS = 20_000;

async function verifyMxOnly(address: string): Promise<VerifyResult> {
  const addr = address.toLowerCase().trim();
  const parts = addr.split('@');
  if (parts.length !== 2 || !parts[1]) {
    return { address: addr, hasMx: false, verdict: 'invalid_domain', provider: 'mx_only' };
  }
  const domain = parts[1];

  const cached = mxCache.get(domain);
  if (cached) {
    return {
      address: addr, ...cached,
      verdict: cached.hasMx ? 'likely_valid' : 'invalid_domain',
      provider: 'mx_only',
    };
  }

  try {
    const records = await dns.resolveMx(domain);
    if (records.length === 0) {
      mxCache.set(domain, { hasMx: false });
      return { address: addr, hasMx: false, verdict: 'invalid_domain', provider: 'mx_only' };
    }
    const mxHost = records.sort((a, b) => a.priority - b.priority)[0]?.exchange;
    mxCache.set(domain, { hasMx: true, mxHost });
    return { address: addr, hasMx: true, mxHost, verdict: 'likely_valid', provider: 'mx_only' };
  } catch (err) {
    logger.debug('[verifyEmail:mx_only] MX lookup failed', {
      domain, err: err instanceof Error ? err.message : String(err),
    });
    mxCache.set(domain, { hasMx: false });
    return { address: addr, hasMx: false, verdict: 'unknown', provider: 'mx_only' };
  }
}

async function verifyReacher(address: string, reacherUrl: string): Promise<VerifyResult> {
  const addr = address.toLowerCase().trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REACHER_TIMEOUT_MS);
  try {
    const res = await fetch(`${reacherUrl.replace(/\/$/, '')}/v0/check_email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_email: addr }),
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn('[verifyEmail:reacher] non-200, falling back to mx_only', { status: res.status });
      return verifyMxOnly(address);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    const reachable: string = data?.is_reachable ?? 'unknown';
    const mxAccepts: boolean = Boolean(data?.mx?.accepts_mail);
    const mxHost: string | undefined = data?.mx?.records?.[0];

    const verdictMap: Record<string, VerifyResult['verdict']> = {
      safe: 'likely_valid',
      risky: 'risky',
      invalid: 'undeliverable',
      unknown: 'unknown',
    };
    const verdict = verdictMap[reachable] ?? 'unknown';

    return {
      address: addr,
      hasMx: mxAccepts,
      mxHost,
      verdict,
      provider: 'reacher',
      reasoning: typeof data?.smtp?.description === 'string' ? data.smtp.description : undefined,
    };
  } catch (err) {
    logger.warn('[verifyEmail:reacher] request failed, falling back to mx_only', {
      err: err instanceof Error ? err.message : String(err),
    });
    return verifyMxOnly(address);
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyEmail(address: string): Promise<VerifyResult> {
  if (env.EMAIL_VERIFIER_PROVIDER === 'reacher' && env.REACHER_URL) {
    return verifyReacher(address, env.REACHER_URL);
  }
  return verifyMxOnly(address);
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Commit**
```bash
git add workers/src/pipeline/tools/verifyEmail.ts workers/src/config/env.ts
git commit -m "feat: pluggable email verifier with reacher.email support (Pillar 3)"
```

---

## Post-Task: Wire multi-engine search into entity discovery (optional but recommended)

Once Task 1 ships, update `workers/src/pipeline/entityWebsiteFinder.ts` to call `runMultiEngineSearch` instead of `runSerpSearch` — this is where single-source blindspots hurt most. Leave this as a follow-up unless the user asks for it.

---

## Verification

### Task 1 (multi-engine)
1. In `.env`, ensure `SERPAPI_KEY` is set.
2. Submit a query. Confirm logs show `SerpAPI search complete { engine: 'google' }`.
3. Temporarily edit a round-2 adaptive dork call in `intentParser.ts` to use `runMultiEngineSearch([...])` and watch for `[serpScraper] multi-engine complete`. Revert after testing.

### Task 2 (OpenCorporates)
1. Optional: set `OPENCORPORATES_API_KEY` in `.env` (500/day without key, much higher with).
2. Submit "fur alle limited in Nigeria".
3. Look for `[Pipeline] [1b] Registry hit` in logs. If found, officer names should appear in the next research agent run's known contacts.
4. No API key required for the default anonymous tier — but rate limits may kick in. If you see repeated `403`s, get an API key.

### Task 3 (verifier)
1. Default mode (no env changes): `EMAIL_VERIFIER_PROVIDER=mx_only`. Existing behavior.
2. Test reacher: `docker run -p 8080:8080 reacherhq/backend:latest` then set `EMAIL_VERIFIER_PROVIDER=reacher` and `REACHER_URL=http://localhost:8080`. Research agent `verify_email` calls should return `provider: 'reacher'` and include a `risky`/`safe` verdict.
3. If reacher is unreachable, verify falls back to `mx_only` automatically (logs warning).

---

## Cost & Rate Limit Notes

| Source | Cost | Rate Limit |
|---|---|---|
| SerpAPI (all engines) | Same as existing plan | Existing quota |
| OpenCorporates (no key) | Free | 500/day, 50/min |
| OpenCorporates (API key) | Free tier 500/day → paid plans | 5000/day on entry-level paid |
| reacher.email (self-hosted) | Free (your infra) | Rate-limited by target mail servers |
| reacher.email (SaaS) | ~$0.01 per check | Their plan |

---

## Rollback

- **Task 1**: `git revert` the commit. Callers still use `runSerpSearch(queries)` which still defaults to Google.
- **Task 2**: `git revert`. Registry enrichment is additive; removing it leaves entity resolution intact.
- **Task 3**: Set `EMAIL_VERIFIER_PROVIDER=mx_only` (or unset) — falls back to MX-only, same as before.

---

## What's Next After Pillar 3

- Tune research agent prompts based on real-run transcripts.
- Add per-domain scrape pattern cache (`workers/src/utils/domainPatternCache.ts`) — learn "apple.com puts contacts on /about".
- Add user feedback loop: "this lead was bad" → record and adjust scoring.
- Add Linear/Asana-style lead enrichment scheduler (enrich after hours, not in critical path).
