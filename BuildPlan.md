# LeadreAI — Comprehensive Build Plan

## One-Line Description
A TypeScript monorepo web platform that turns natural-language prospecting requests into structured, OSINT-enriched business lead records with AI-generated outreach, powered by Google dorking, headless scraping, file extraction, and Claude AI.

---

## Monorepo Structure

```
leadreai/
├── CLAUDE.md
├── ASSUMPTIONS.md
├── BuildPlan.md
├── .env.example
├── .gitignore
├── package.json                    # pnpm workspace root
├── turbo.json                      # Turborepo config
├── tsconfig.base.json
│
├── frontend/                       # Next.js 14 App Router
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   ├── components.json             # shadcn/ui config
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx            # Landing page
│       │   ├── (auth)/
│       │   │   ├── login/page.tsx
│       │   │   └── register/page.tsx
│       │   └── (dashboard)/
│       │       ├── layout.tsx
│       │       ├── page.tsx        # Prospecting workspace
│       │       ├── leads/
│       │       │   ├── page.tsx
│       │       │   └── [jobId]/page.tsx
│       │       ├── campaigns/
│       │       │   ├── page.tsx
│       │       │   └── [campaignId]/page.tsx
│       │       └── settings/page.tsx
│       ├── components/
│       │   ├── ui/                 # shadcn/ui primitives
│       │   ├── layout/             # Sidebar, Topbar, DashboardShell
│       │   ├── prospecting/        # QueryInput, JobProgress, ParsedIntentPreview
│       │   ├── leads/              # LeadTable, LeadDetailDrawer, LeadFilters, ExportMenu
│       │   ├── outreach/           # OutreachDraftEditor, TemplateSelector, SendDialog
│       │   └── shared/             # LoadingSpinner, EmptyState, ConfirmDialog
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   ├── useJob.ts           # Polls job status via SSE
│       │   ├── useLeads.ts
│       │   └── useCampaign.ts
│       ├── lib/
│       │   ├── api.ts              # Typed fetch wrapper
│       │   ├── auth.ts             # NextAuth config
│       │   └── utils.ts
│       └── store/
│           └── useAppStore.ts      # Zustand global store
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                # Entry point
│       ├── app.ts                  # Express setup + middleware
│       ├── config/
│       │   ├── env.ts              # Zod-validated env
│       │   ├── database.ts         # Mongoose connect
│       │   └── redis.ts            # IORedis singleton
│       ├── models/
│       │   ├── User.ts
│       │   ├── Workspace.ts
│       │   ├── ProspectingJob.ts
│       │   ├── Lead.ts
│       │   ├── Campaign.ts
│       │   ├── OutreachDraft.ts
│       │   └── AuditLog.ts
│       ├── routes/                 # auth, workspace, jobs, leads, campaigns, outreach, export
│       ├── controllers/            # mirrors routes
│       ├── middleware/             # authenticate, authorize, rateLimiter, validate, errorHandler
│       ├── services/
│       │   ├── ai/
│       │   │   ├── queryParser.ts
│       │   │   └── outreachGenerator.ts
│       │   ├── queue/
│       │   │   ├── queues.ts
│       │   │   └── jobDispatcher.ts
│       │   └── export/
│       │       ├── csvExporter.ts
│       │       └── xlsxExporter.ts
│       ├── sse/
│       │   └── jobProgressStream.ts
│       └── utils/
│           ├── logger.ts
│           ├── asyncHandler.ts
│           └── ApiError.ts
│
├── workers/                        # BullMQ worker processes (separate Node process)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── prospecting.worker.ts
│       └── pipeline/
│           ├── intentParser.ts
│           ├── queryBuilder.ts     # Dork query template engine
│           ├── serpScraper.ts      # SerpAPI wrapper
│           ├── pageScraper.ts      # Playwright headless browser
│           ├── fileExtractor.ts    # PDF/DOCX/XLSX download + parse
│           ├── osintEnricher.ts    # WHOIS, DNS, SSL, LinkedIn
│           ├── emailDetector.ts    # Pattern gen + MX/SMTP validation
│           ├── phoneNormalizer.ts  # libphonenumber-js
│           ├── deduplicator.ts     # Fuzzy match + merge
│           ├── ranker.ts           # Composite scoring
│           └── leadWriter.ts       # Bulk upsert to MongoDB
│
└── shared/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── types/                  # lead, job, campaign, api DTOs
        ├── schemas/zod/            # shared Zod schemas used by FE + BE
        └── utils/constants.ts
```

---

## Tech Stack

### Tooling
| Tool | Package |
|------|---------|
| Monorepo | `turbo@^2` + `pnpm@^9` workspaces |
| TypeScript | `typescript@^5.4` strict mode |
| Linting | `eslint@^9` + `@typescript-eslint` |
| Formatting | `prettier@^3` |

### Frontend
| Layer | Package |
|-------|---------|
| Framework | `next@14.2.x` App Router |
| UI | `shadcn/ui` + `@radix-ui/*` + `tailwindcss@^3.4` |
| Data tables | `@tanstack/react-table@^8` + `@tanstack/react-virtual@^3` |
| State | `zustand@^4` (global) + `@tanstack/react-query@^5` (server) |
| Auth | `next-auth@^5` |
| Forms | `react-hook-form@^7` + `zod@^3` |
| Charts | `recharts@^2` |
| Notifications | `sonner@^1` |
| Icons | `lucide-react` |
| SSE | Native browser `EventSource` |

### Backend
| Layer | Package |
|-------|---------|
| HTTP | `express@^4.19` + `@types/express` |
| Validation | `zod@^3` |
| Database | `mongoose@^8` |
| Auth | `jsonwebtoken@^9` + `bcryptjs@^2` |
| Queue | `bullmq@^5` + `ioredis@^5` |
| Rate limiting | `express-rate-limit@^7` + `rate-limit-redis@^4` |
| Logging | `winston@^3` + `winston-mongodb` |
| Security | `helmet@^7` + `cors@^2` |
| Export | `csv-stringify@^6` + `exceljs@^4` |

### Workers (Data Collection)
| Layer | Package |
|-------|---------|
| Job processor | `bullmq@^5` |
| Headless browser | `playwright@^1.44` (Chromium) |
| HTML parsing | `cheerio@^1` |
| PDF extraction | `pdf-parse@^1.1` |
| DOCX extraction | `mammoth@^1.7` |
| XLS/XLSX parsing | `xlsx@^0.18` (SheetJS) |
| HTTP requests | `axios@^1.7` + `axios-retry@^4` |
| Google search | `@serpapi/google-search-results-nodejs` |
| WHOIS | `whois@^2` |
| SSL check | `ssl-checker@^2` + Node built-in `tls` |
| Email validation | `email-validator@^2` + `mailchecker@^4` |
| Phone parsing | `libphonenumber-js@^1.10` |
| Fuzzy dedup | `fuse.js@^7` |
| String similarity | `string-similarity@^4` |
| Proxy rotation | `proxy-agent@^6` (optional) |

### AI
| Layer | Package |
|-------|---------|
| SDK | `@anthropic-ai/sdk@^0.24` |
| Model | `claude-sonnet-4-6` |
| Optimization | Prompt caching (`cache_control: ephemeral`) on system prompts |

---

## MongoDB Schema

### `users`
```
_id, email (unique), passwordHash, firstName, lastName, avatarUrl,
plan (free|pro|enterprise), planExpiresAt, creditsBalance,
workspaces[{workspaceId, role}], isEmailVerified, lastLoginAt,
createdAt, updatedAt
```
Indexes: `email` (unique), `workspaces.workspaceId`

### `workspaces`
```
_id, name, slug (unique), ownerId, members[{userId, role, joinedAt}],
settings{defaultExportFormat, notifyOnJobComplete, webhookUrl},
usageStats{totalJobsRun, totalLeadsFound, totalExports, creditsUsed},
createdAt, updatedAt
```

### `prospecting_jobs`
```
_id, workspaceId, createdBy, rawQuery, parsedIntent{
  industry, subIndustry, geography{country, state, city},
  targetCount, desiredFields[], companySize, keywords[], confidenceScore
},
status (queued|parsing|collecting|enriching|deduplicating|complete|failed|cancelled),
progress{percentage, currentStage, stagesComplete[], leadsFoundSoFar},
result{totalLeadsFound, totalAfterDedup, dorkQueriesUsed[], sourcesScraped[], filesDownloaded, durationMs},
error{message, stack, stage}, bullmqJobId, creditsCharged,
startedAt, completedAt, createdAt, updatedAt
```
Indexes: `workspaceId`, `status`, `createdAt` desc, compound `(workspaceId, status)`

### `leads`
```
_id, workspaceId, jobId,
companyName (text index), companyDomain (indexed), companyType, industry, subIndustry, description,
address{street, city, state, country, postcode, fullText},
emails[{address, type(business|generic|personal|pattern_inferred), confidence, verified, verifiedAt, source}],
phones[{raw, normalized(E.164), type(office|mobile|fax), countryCode, source}],
socialProfiles{linkedinUrl, twitterUrl, facebookUrl, instagramUrl},
website,
osint{
  whois{registrar, registeredAt, expiresAt, registrantName, registrantEmail, registrantOrg, nameservers[]},
  dns{aRecords[], mxRecords[], txtRecords[], cnameRecords[]},
  ssl{issuer, validFrom, validTo, subject, altNames[]},
  techStack[], estimatedEmployees, linkedinFollowers, linkedinHeadquarters
},
sources[{url, type(serpapi|scraped_page|pdf|docx|xlsx|whois|dns|ssl|linkedin), scrapedAt, confidence}],
rawSnippets[],
rankScore (0-100, indexed), completenessScore (0-100),
isVerified, isDuplicate, mergedIntoId,
outreachStatus (not_contacted|draft_created|sent|replied|bounced),
tags[], notes,
createdAt, updatedAt
```
Indexes: `workspaceId`, `jobId`, `companyDomain` (unique per workspace), `rankScore` desc, `industry`, `address.country`, text index on `(companyName, description)`, compound `(workspaceId, isDuplicate, rankScore)`

### `campaigns`
```
_id, workspaceId, createdBy, name, description,
status (draft|active|paused|completed|archived),
leadIds[],
outreachConfig{channel, tone, language, personalization[], systemPromptOverride},
stats{totalLeads, draftsCreated, sent, opened, replied, bounced},
createdAt, updatedAt
```

### `outreach_drafts`
```
_id, workspaceId, campaignId, leadId, createdBy,
channel (email|linkedin|sms), subject, body, tone, language,
promptUsed (select:false), modelResponse (select:false), version,
status (draft|approved|sent|failed), sentAt,
deliveryMetadata{provider, messageId, threadId},
createdAt, updatedAt
```

### `audit_logs`
```
_id, workspaceId, userId, action (indexed),
resourceType (job|lead|campaign|outreach_draft), resourceId,
metadata (Mixed), ipAddress, userAgent, durationMs,
createdAt (TTL: 90 days)
```

---

## API Design (`/api/v1`)

All endpoints require `Authorization: Bearer <jwt>` except auth routes.

### Auth
```
POST   /auth/register
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /auth/me
PATCH  /auth/me
```

### Workspaces
```
GET    /workspaces
POST   /workspaces
GET    /workspaces/:workspaceId
PATCH  /workspaces/:workspaceId
DELETE /workspaces/:workspaceId
POST   /workspaces/:workspaceId/members
DELETE /workspaces/:workspaceId/members/:userId
PATCH  /workspaces/:workspaceId/members/:userId
```

### Prospecting Jobs
```
POST   /workspaces/:workspaceId/jobs          # Submit NL query → enqueue
GET    /workspaces/:workspaceId/jobs          # List (paginated, filterable)
GET    /workspaces/:workspaceId/jobs/:jobId
GET    /workspaces/:workspaceId/jobs/:jobId/stream   # SSE progress stream
DELETE /workspaces/:workspaceId/jobs/:jobId   # Cancel
POST   /workspaces/:workspaceId/jobs/:jobId/retry
```

### Leads
```
GET    /workspaces/:workspaceId/leads         # ?jobId, country, industry, hasEmail, hasPhone, page, limit, sortBy, sortOrder
GET    /workspaces/:workspaceId/leads/:leadId
PATCH  /workspaces/:workspaceId/leads/:leadId
DELETE /workspaces/:workspaceId/leads/:leadId
POST   /workspaces/:workspaceId/leads/bulk-tag
POST   /workspaces/:workspaceId/leads/bulk-delete
GET    /workspaces/:workspaceId/leads/:leadId/enrich   # Re-trigger enrichment
```

### Campaigns
```
GET    /workspaces/:workspaceId/campaigns
POST   /workspaces/:workspaceId/campaigns
GET    /workspaces/:workspaceId/campaigns/:campaignId
PATCH  /workspaces/:workspaceId/campaigns/:campaignId
DELETE /workspaces/:workspaceId/campaigns/:campaignId
POST   /workspaces/:workspaceId/campaigns/:campaignId/leads
DELETE /workspaces/:workspaceId/campaigns/:campaignId/leads/:leadId
GET    /workspaces/:workspaceId/campaigns/:campaignId/leads
```

### Outreach
```
POST   /workspaces/:workspaceId/outreach/generate        # Single or bulk AI generation
POST   /workspaces/:workspaceId/outreach/bulk-generate   # All leads in campaign
GET    /workspaces/:workspaceId/outreach
GET    /workspaces/:workspaceId/outreach/:draftId
PATCH  /workspaces/:workspaceId/outreach/:draftId
POST   /workspaces/:workspaceId/outreach/:draftId/approve
POST   /workspaces/:workspaceId/outreach/:draftId/send
DELETE /workspaces/:workspaceId/outreach/:draftId
```

### Export
```
POST   /workspaces/:workspaceId/export/leads             # CSV or XLSX download
POST   /workspaces/:workspaceId/export/campaign/:campaignId
```

---

## Data Collection Pipeline (10 Stages)

### Stage 0 — Intent Parsing (Claude)
`queryParser.ts` sends raw query to `claude-sonnet-4-6` with a cached system prompt. Returns validated Zod JSON:
```json
{
  "industry": "law firms",
  "geography": { "country": "Nigeria", "state": null, "city": null },
  "targetCount": 100,
  "desiredFields": ["businessEmail", "officePhone"],
  "keywords": ["law", "legal", "solicitors"],
  "confidenceScore": 0.95
}
```

### Stage 1 — Google Dork Query Construction
`queryBuilder.ts` generates 8–15 targeted dork queries per intent using templates:
```
site:linkedin.com/company "{industry}" "{country}"
"{industry}" "{city}" contact email filetype:pdf
"{industry}" "{country}" "contact us" "@"
"{industry}" directory "{country}" filetype:xls
"{industry}" association members list filetype:pdf
inurl:staff "{industry}" "{country}"
"{industry}" "{country}" "phone" "address" -site:linkedin.com
"{industry}" "{country}" filetype:xlsx
```

### Stage 2 — SerpAPI Search
Queries SerpAPI Google Search for each dork, extracting: `title`, `link`, `snippet`, `displayed_link`. Deduplicates URLs across all queries. Also expands `sitelinks` for directory-style results.

### Stage 3 — Headless Browser Scraping (Playwright)
Pool of 3 concurrent Chromium contexts. Per URL:
1. Navigate (timeout: 30s, waitUntil: domcontentloaded)
2. Dismiss cookie banners
3. Detect page type (directory / contact / about / generic)
4. Extract: `mailto:` links, `tel:` links, full-page email regex, phone regex, social links, JSON-LD, OpenGraph
5. Detect downloadable file links (.pdf/.doc/.docx/.xls/.xlsx) → queue for Stage 4

Rate limiting: 2s delay between pages, exponential backoff on 429/503. User-agent rotation (pool of 10).

### Stage 4 — File Download + Text Extraction
Downloads via `axios` stream (max 25MB). Extracts per type:
- **PDF** (`pdf-parse`): raw text → email/phone regex, table detection
- **DOCX** (`mammoth`): markdown conversion → same extraction
- **XLSX** (`xlsx`/SheetJS): header row detection using keyword matching (`company`, `email`, `phone`, `address`) → structured row extraction

### Stage 5 — OSINT Enrichment (per unique domain)
- **WHOIS** (`whois`): registrar, registered/expiry dates, registrant org + email
- **DNS** (Node `dns/promises`): A, MX, TXT, CNAME records. MX → email deliverability signal. TXT → SPF/DKIM presence
- **SSL** (Node `tls`): issuer, validity dates, `subjectaltname` → reveals related domains
- **LinkedIn public pages** (Playwright, no login): company name, industry, employee count, headquarters, website from public view
- **Tech stack fingerprinting**: from response headers + script src patterns

### Stage 6 — Email Pattern Detection + MX/SMTP Validation
Pattern generation (given domain + any known personnel names):
```
{first}@{domain}           info@{domain}
{first}.{last}@{domain}    contact@{domain}
{f}{last}@{domain}         enquiries@{domain}
{department}@{domain}      admin@{domain}
```

3-tier validation:
1. Syntax check (`email-validator`)
2. MX record existence (`dns.resolveMx`)
3. SMTP RCPT TO probe (connect → EHLO → MAIL FROM → RCPT TO, no DATA sent — 250 = likely valid, 550 = invalid)

Confidence scores: found-on-page `0.95`, in-PDF `0.85`, SMTP-verified pattern `0.80`, MX-only pattern `0.50`, inferred `0.35`

### Stage 7 — Phone Normalization
All extracted phone strings → `libphonenumber-js` with country hint from `geography.country`. Output: E.164 normalized, national format, type (`FIXED_LINE`/`MOBILE`/`FAX`).

### Stage 8 — Deduplication (two-pass)
- **Pass 1**: Group by `companyDomain` (exact). Keep most complete record, merge email/phone arrays.
- **Pass 2**: Fuzzy company name matching via `fuse.js` (threshold: 0.25 ≈ 75% similarity). On match: merge, set `isDuplicate: true` + `mergedIntoId` on losers.

### Stage 9 — Ranking
Composite `rankScore` (0–100):
- Field completeness vs desired fields: 40 pts max
- Email quality (verified > high-confidence > any): 20 pts max
- Phone quality (FIXED_LINE > any): 15 pts max
- OSINT depth (WHOIS + MX + valid SSL): 15 pts max
- Source diversity (unique source types): 10 pts max

### Stage 10 — Lead Write
`Lead.bulkWrite()` with `upsert: true` on `(workspaceId, companyDomain)`. Updates `prospecting_jobs` with final counts + `status: "complete"`. Publishes `job:complete` event via Redis pub/sub → SSE endpoint streams to frontend.

---

## BullMQ Queue Architecture

```
Queue: "prospecting"   → Main OSINT pipeline (concurrency: 3, limiter: 10/min)
Queue: "enrichment"    → Per-lead re-enrichment
Queue: "outreach"      → Batch outreach generation
Queue: "export"        → File export generation
```

Job progress events published to Redis pub/sub channel `job:progress:{jobId}`. SSE endpoint subscribes per active client. Worker runs as a separate Node process (separate Railway/Render service from the API server).

---

## SSE Architecture

```
GET /api/v1/workspaces/:workspaceId/jobs/:jobId/stream
→ Sets Content-Type: text/event-stream
→ Subscribes to Redis pub/sub channel job:progress:{jobId}
→ Forwards each message as SSE data frame
→ On client disconnect: unsubscribes + quits Redis subscriber connection
```

Frontend `useJob.ts` hook: `new EventSource(...)` → updates Zustand/React Query state in real time.

---

## AI Service Design

### Query Parser
```typescript
client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: [{ type: 'text', text: PARSER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: rawQuery }]
})
// Output validated with Zod ParsedIntentSchema
```

### Outreach Generator
- System prompt defines tone/channel/format — cached per campaign batch
- User message contains lead context (company, industry, geo, description, website)
- Output contract: `{ subject, body, reasoning }` — `reasoning` stored for audit
- Batch generation: max 5 parallel API calls via `Promise.allSettled`

---

## Environment Variables

```bash
# App
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=leadreai

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=                        # 32+ chars
JWT_REFRESH_SECRET=                # 32+ chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
BCRYPT_ROUNDS=12

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# AI
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6
ANTHROPIC_MAX_TOKENS=2048

# Search
SERPAPI_KEY=

# Playwright
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT_MS=30000
PLAYWRIGHT_CONCURRENCY=3

# File Storage (S3-compatible)
S3_BUCKET=leadreai-exports
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_ENDPOINT=                       # Cloudflare R2 or custom

# Email (for auth emails only)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@leadreai.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
JOB_RATE_LIMIT_PER_HOUR=10

# Proxies (optional, comma-separated)
PROXY_LIST=

# Logging
LOG_LEVEL=info
LOG_TO_MONGODB=true

# Workers
WORKER_CONCURRENCY=3
MAX_FILE_DOWNLOAD_SIZE_MB=25
DEDUP_SIMILARITY_THRESHOLD=0.25
```

---

## Build Phases

### Phase 1 — Foundation (Weeks 1–2)
**Goal:** Working monorepo, auth, DB, empty API skeleton.

- pnpm workspace + Turborepo configured
- `tsconfig.base.json` + per-package extends
- ESLint + Prettier at root
- Backend: Express app, Zod env validation, Mongoose connect, Winston logger
- All 7 Mongoose models with full schema
- Auth endpoints (register, login, refresh, me) with JWT + bcrypt
- `authenticate` + `authorize` middleware
- BullMQ + Redis verified (worker idles without crash)
- Frontend: Next.js 14 scaffold, `next-auth`, login/register pages, protected dashboard shell
- `.env.example` and `ASSUMPTIONS.md` created

**Verify:** `POST /auth/register` + `GET /auth/me` end-to-end. Worker starts clean.

---

### Phase 2 — NL Query Submission + AI Parsing (Weeks 3–4)
**Goal:** User submits query → Claude parses intent → job enqueued.

- `POST /workspaces/:workspaceId/jobs` endpoint
- `queryParser.ts` with Claude + Zod output validation
- Workspace authorization middleware
- `ProspectingJob` created in DB (`status: "queued"`)
- BullMQ job dispatched to queue
- `GET /jobs/:jobId` + `GET /jobs` list (paginated)
- SSE endpoint skeleton (connection works, no events yet)
- Frontend: query input box, submit → job card with "Queued" status
- `useJob.ts` hook wires SSE → live-updates job card

**Verify:** Submit "Get me 50 fintech companies in Kenya with emails" → DB shows job with correctly parsed `parsedIntent` → BullMQ Bull Board shows job queued.

---

### Phase 3 — Data Collection Pipeline (Weeks 5–8)
**Goal:** Pipeline collects real leads end-to-end.

**Week 5:** `queryBuilder.ts` (dork templates, unit tested against 5 sample intents) + `serpScraper.ts` (SerpAPI + URL dedup) → worker transitions job to `"collecting"`.

**Week 6:** `pageScraper.ts` (Playwright pool, email/phone regex, file URL detection) + `fileExtractor.ts` (PDF/DOCX/XLSX) → progress events via Redis pub/sub → SSE streams to frontend.

**Week 7:** `osintEnricher.ts` (WHOIS/DNS/SSL/LinkedIn) + `emailDetector.ts` (pattern gen + MX/SMTP validation) + `phoneNormalizer.ts`.

**Week 8:** `deduplicator.ts` (two-pass) + `ranker.ts` + `leadWriter.ts` (bulk upsert + completion event) → full end-to-end pipeline test.

**Verify:** Real job "top 20 accounting firms in South Africa with emails" → leads in DB with populated fields, no obvious dupes, `rankScore > 0`.

---

### Phase 4 — Lead Table UI + Export (Weeks 9–10)
**Goal:** User can view, filter, sort, and export leads.

- `GET /leads` with all filter/sort/pagination params
- `GET /leads/:leadId` full detail
- `PATCH /leads/:leadId` for notes/tags
- `POST /export/leads` → CSV + XLSX → S3/R2 presigned URL
- Frontend: `LeadTable` (TanStack Table, column sorting, filter bar)
- Frontend: `LeadDetailDrawer` (full OSINT, emails with confidence badges, phones)
- Frontend: `ExportMenu` → CSV/XLSX download
- Virtual scroll for 500+ row tables

**Verify:** 100-lead job renders in table. Country filter works. Export downloads valid CSV.

---

### Phase 5 — AI Outreach Generation (Weeks 11–12)
**Goal:** User generates, reviews, edits, and manages outreach drafts.

- `POST /outreach/generate` (single or bulk via Claude)
- `POST /outreach/bulk-generate` (all leads in campaign)
- Campaign CRUD + campaign-lead association endpoints
- `outreachGenerator.ts` with prompt caching + batch parallel generation (max 5 concurrent)
- Frontend: campaign creation flow (select leads → configure tone/channel/language)
- Frontend: `OutreachDraftEditor` (side-by-side lead info + editable draft)
- Frontend: bulk generation progress bar (SSE-based)
- Audit logging for all outreach generation events

**Verify:** Campaign with 10 leads → generate drafts → each draft personalized with company name → edit one → approve drafts.

---

### Phase 6 — Credits, Observability, Hardening (Weeks 13–16)
**Goal:** Production-ready.

- Credits system: balance check before enqueue, `creditsCharged` per job based on leads found
- Redis-backed rate limiting on all endpoints
- Dead letter queue for failed jobs, retry logic in workers
- `winston-mongodb` log transport for audit events
- Bull Board UI at `/admin/queues` (auth-gated)
- Proxy rotation in Playwright (`proxy-agent`)
- Workspace webhook support (`job:complete` POST to `settings.webhookUrl`)
- API key management (workspace-scoped keys for programmatic access)
- MongoDB index audit + `explain()` on slow queries
- Frontend: credit balance display, insufficient-credits error states
- Deployment: Dockerfile for backend + workers, GitHub Actions CI (lint + type-check + unit tests)

**Verify:** 5 concurrent jobs load test → no DB deadlocks. Rate limiter blocks at threshold. Bull Board shows job history.

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Turborepo over Nx** | Simpler config for 4-package monorepo, better pnpm workspace support |
| **BullMQ over Agenda** | First-class TS, priority queues, Bull Board UI, Redis pub/sub built-in. Agenda uses MongoDB for queue storage (polling overhead) |
| **SSE over WebSockets** | Unidirectional — sufficient for job progress. Works through proxies/CDNs, auto-reconnects, no stateful socket server needed |
| **Playwright over Puppeteer** | Superior auto-wait semantics, fewer flaky selectors, actively maintained by Microsoft |
| **Workers as separate Node process** | CPU-intensive Playwright doesn't block Express event loop. Workers scale independently; a crashed worker doesn't take down the API |
| **MongoDB over PostgreSQL** | Lead records are schema-flexible (OSINT depth varies per lead, desired fields vary per job). Nested arrays map naturally to documents |
| **Prompt caching for both AI tasks** | Large stable system prompts on query parser + outreach generator → ~80% token cost reduction on batch generation |
| **3-tier email validation** | Syntax + MX + SMTP RCPT TO probe — quality signal without sending any emails. Standard technique used by email verification services |
| **Zod schemas in `shared/`** | Single source of truth across frontend forms, backend request validation, and Claude output parsing. Eliminates "frontend accepts what backend rejects" bug class |
| **Soft delete via `isDuplicate`** | Preserves audit trail, allows dedup recovery. Hard delete only available as an explicit user action |

---

## Critical Files (Implementation Order)

1. `shared/src/types/` — all shared types first
2. `shared/src/schemas/zod/` — shared Zod schemas
3. `backend/src/config/env.ts` — typed env loader
4. `backend/src/models/` — all 7 Mongoose models
5. `backend/src/middleware/authenticate.ts`
6. `backend/src/services/ai/queryParser.ts`
7. `workers/src/pipeline/queryBuilder.ts`
8. `workers/src/pipeline/serpScraper.ts`
9. `workers/src/pipeline/pageScraper.ts`
10. `workers/src/pipeline/fileExtractor.ts`
11. `workers/src/pipeline/osintEnricher.ts`
12. `workers/src/pipeline/emailDetector.ts`
13. `workers/src/pipeline/deduplicator.ts`
14. `workers/src/pipeline/ranker.ts`
15. `frontend/src/components/leads/LeadTable.tsx`
16. `backend/src/services/ai/outreachGenerator.ts`
