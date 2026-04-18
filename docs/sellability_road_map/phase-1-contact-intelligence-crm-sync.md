# Phase 1: Contact Intelligence + HubSpot CRM Sync

## Goal

Transform LeadreAI from a company-level lead tool into a buyer-level intelligence platform. Every lead record gains named contacts with titles, seniority, departments, and role in the buying committee. HubSpot becomes the first CRM sync target, pushing companies and contacts bidirectionally. This phase closes the most common early sales objection: "We need person-level data, not just company data."

## Commercial Outcome

- Agencies and outbound teams can immediately action leads without cross-referencing LinkedIn manually.
- HubSpot users can see enriched records appear in their CRM within minutes of a job completing.
- Unlocks the Team and Growth plan pricing tiers (CRM sync is gated at both).

---

## What Users Can Do After This Phase

1. Run a prospecting job and see named contacts (CEO, Head of Sales, etc.) attached to each company lead.
2. Click a contact to see their full profile: name, title, seniority level, department, LinkedIn URL, inferred email, confidence score.
3. Connect their HubSpot account via OAuth from the workspace Settings page.
4. Trigger a manual "Sync to HubSpot" from any lead card — or enable auto-sync on job completion.
5. See a sync log in Settings showing which records pushed/updated and any failures.
6. Open the linked HubSpot contact or company from within LeadreAI with a single click.

---

## Architecture Overview

### Data Model Changes

A new top-level `contacts` collection holds person-level records linked to a workspace and optionally to a lead. The `Lead` model gains a `contactIds[]` reference array. The `Workspace` model gains a `crmConfig` embedded document for HubSpot credentials and sync settings.

### Contact Enrichment Pipeline

A new BullMQ queue `contact-enrichment` runs after `leadWriter` completes a job. For each company domain discovered, the enricher:
1. Queries Apollo.io-style OSINT patterns, LinkedIn public pages via Playwright, and company "team" or "about" pages for named personnel.
2. Infers email addresses from pattern + domain + MX validation (reuses existing `emailDetector` logic).
3. Normalises seniority via a scoring table against known title keywords.
4. Writes contacts to the `contacts` collection with `leadId` and `workspaceId` references.

### HubSpot Integration

HubSpot OAuth 2.0 — workspace-scoped, stored encrypted. A `hubspot-sync` BullMQ queue handles outbound sync jobs. Inbound sync (pulling HubSpot updates into LeadreAI) is handled by a scheduled pull every 6 hours per connected workspace.

---

## Database Schemas

### New: `contacts` Collection

```typescript
// shared/src/types/contact.ts
export interface IContact {
  _id: ObjectId;
  workspaceId: ObjectId;
  leadId?: ObjectId;          // company lead this contact belongs to
  jobId?: ObjectId;           // prospecting job that surfaced this contact

  // Identity
  firstName?: string;
  lastName?: string;
  fullName: string;
  title?: string;             // raw title string e.g. "VP of Engineering"
  department?: string;        // normalised: sales | marketing | engineering | finance | hr | legal | operations | other
  seniority?: string;         // c_level | vp | director | manager | ic | unknown
  linkedinUrl?: string;
  twitterUrl?: string;
  avatarUrl?: string;

  // Contact methods
  emails: Array<{
    address: string;
    type: 'direct' | 'pattern_inferred' | 'generic';
    confidence: number;       // 0-1
    verified: boolean;
    source: string;
  }>;
  phones: Array<{
    normalized: string;       // E.164
    type: 'mobile' | 'direct' | 'office';
    source: string;
  }>;

  // Buying committee role
  buyingRole?: 'champion' | 'economic_buyer' | 'technical_buyer' | 'blocker' | 'influencer' | 'unknown';

  // Provenance
  sources: Array<{
    url: string;
    type: 'linkedin' | 'company_website' | 'press_release' | 'directory' | 'pattern_inferred';
    scrapedAt: Date;
    confidence: number;
  }>;
  confidenceScore: number;    // 0-100 composite
  freshnessScore: number;     // decays from 100 over 180 days
  verifiedAt?: Date;

  // CRM sync
  crmRefs: Array<{
    provider: 'hubspot' | 'salesforce' | 'pipedrive' | 'close';
    externalId: string;
    syncedAt: Date;
    syncStatus: 'synced' | 'error' | 'pending';
    errorMessage?: string;
  }>;

  isActive: boolean;          // false = left company / unverifiable
  notes?: string;
  tags: string[];

  createdAt: Date;
  updatedAt: Date;
}
```

Mongoose Schema (`backend/src/models/Contact.ts`):
- Indexes: `workspaceId`, `leadId`, `linkedinUrl`, `(workspaceId, emails.address)` unique sparse, `confidenceScore` desc
- TTL: none (contacts are long-lived; freshness is tracked via `freshnessScore`)

### Modifications to `leads` Collection

Add to `ILead`:
```typescript
contactIds: ObjectId[];            // references to contacts collection
contactSummary?: {                 // denormalised for fast list display
  totalContacts: number;
  topContact?: {
    fullName: string;
    title: string;
    seniority: string;
  };
};
```

### Modifications to `Workspace` Model

Add `crmConfig` embedded document:
```typescript
crmConfig?: {
  provider: 'hubspot' | 'salesforce' | 'pipedrive' | 'close';
  hubspot?: {
    accessToken: string;         // encrypted (AES-256-GCM via encrypt.ts)
    refreshToken: string;        // encrypted
    expiresAt: Date;
    portalId: string;
    syncEnabled: boolean;
    autoSyncOnJobComplete: boolean;
    lastSyncAt?: Date;
    syncLog: Array<{             // last 50 entries
      syncedAt: Date;
      direction: 'push' | 'pull';
      companiesSynced: number;
      contactsSynced: number;
      errors: number;
    }>;
  };
};
```

### New: `suppression_lists` Collection (created here, used in Phase 2)

```typescript
// Pre-create the schema in this phase for contact-level suppression
interface ISuppressionEntry {
  workspaceId: ObjectId;
  email?: string;
  domain?: string;
  reason: 'unsubscribe' | 'bounce' | 'manual' | 'competitor';
  addedAt: Date;
  addedBy?: ObjectId;   // userId
}
```

---

## API Endpoints

### Contact Routes (`/api/v1/workspaces/:workspaceId/contacts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/contacts` | member+ | List contacts. Query: `leadId`, `seniority`, `department`, `hasEmail`, `page`, `limit`, `sortBy` |
| GET | `/contacts/:contactId` | member+ | Get single contact with full detail |
| PATCH | `/contacts/:contactId` | member+ | Update notes, tags, buyingRole |
| DELETE | `/contacts/:contactId` | admin+ | Soft-delete (sets `isActive: false`) |
| POST | `/contacts/bulk-tag` | member+ | Tag multiple contacts at once |
| POST | `/leads/:leadId/contacts` | admin+ | Manually add a contact to a lead |
| POST | `/leads/:leadId/enrich-contacts` | member+ | Trigger contact enrichment for one lead |

### HubSpot Integration Routes (`/api/v1/workspaces/:workspaceId/crm`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/crm/hubspot/connect` | owner | Redirect to HubSpot OAuth URL |
| GET | `/crm/hubspot/callback` | — | OAuth callback; exchanges code, stores tokens |
| GET | `/crm/hubspot/status` | admin+ | Returns connection status, last sync, token freshness |
| DELETE | `/crm/hubspot/disconnect` | owner | Revokes token, clears crmConfig |
| POST | `/crm/hubspot/sync` | admin+ | Trigger manual full sync (returns BullMQ job ID) |
| POST | `/leads/:leadId/crm-push` | member+ | Push single lead + contacts to HubSpot |
| GET | `/crm/hubspot/sync-log` | admin+ | Last 50 sync log entries |

### Auth Route Extension

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/auth/integrations` | authenticated | List connected integrations for current user's workspaces |

---

## New Environment Variables

```bash
# HubSpot OAuth
HUBSPOT_CLIENT_ID=
HUBSPOT_CLIENT_SECRET=
HUBSPOT_REDIRECT_URI=http://localhost:4000/api/v1/workspaces/{workspaceId}/crm/hubspot/callback

# Contact enrichment
CONTACT_ENRICHMENT_CONCURRENCY=2    # Playwright sessions for contact scraping
CONTACT_FRESHNESS_DAYS=180          # days before freshnessScore hits 0
```

---

## Backend File Map

### Create

| File | Purpose |
|------|---------|
| `backend/src/models/Contact.ts` | Mongoose model for person-level records |
| `backend/src/models/SuppressionList.ts` | Suppression entries (email/domain) |
| `backend/src/controllers/contacts.controller.ts` | CRUD for contacts |
| `backend/src/controllers/crm.controller.ts` | HubSpot OAuth + sync trigger handlers |
| `backend/src/routes/contacts.routes.ts` | Express router for /contacts |
| `backend/src/routes/crm.routes.ts` | Express router for /crm |
| `backend/src/services/crm/hubspot.service.ts` | HubSpot API client (OAuth, Companies API, Contacts API, Associations API) |
| `backend/src/services/crm/hubspotTokenRefresher.ts` | Refresh access token before expiry using refresh token |
| `workers/src/pipeline/contactEnricher.ts` | Stage 11: extract contacts from pages already scraped in Stage 3 |
| `workers/src/contact.worker.ts` | BullMQ worker for `contact-enrichment` queue |
| `workers/src/hubspot.worker.ts` | BullMQ worker for `hubspot-sync` queue |
| `workers/src/services/contactExtractor.ts` | Playwright + regex logic to find personnel on company websites |
| `workers/src/services/seniorityMapper.ts` | Map raw title string → seniority enum + department |
| `shared/src/types/contact.ts` | IContact, ISeniorityLevel, IBuyingRole shared types |
| `shared/src/schemas/zod/contact.ts` | Zod schemas for contact validation |

### Modify

| File | What Changes |
|------|-------------|
| `backend/src/models/Lead.ts` | Add `contactIds[]`, `contactSummary` |
| `backend/src/models/Workspace.ts` | Add `crmConfig` embedded document |
| `backend/src/app.ts` | Mount `/contacts` and `/crm` routes |
| `backend/src/config/env.ts` | Add HubSpot OAuth env vars |
| `workers/src/index.ts` | Register `contact-enrichment` and `hubspot-sync` workers |
| `workers/src/pipeline/leadWriter.ts` | After writing leads, dispatch contact-enrichment jobs per domain |
| `workers/src/config/env.ts` | Add `CONTACT_ENRICHMENT_CONCURRENCY` |
| `shared/src/types/lead.ts` | Add contactIds, contactSummary fields |

---

## Workers Detail

### `contact-enrichment` Queue

**Job payload:**
```typescript
{
  workspaceId: string;
  leadId: string;
  companyDomain: string;
  companyName: string;
  websiteUrl?: string;
  existingEmails: string[];  // already found email patterns
}
```

**Processing logic (contactEnricher.ts):**
1. Navigate to `https://{domain}/team`, `/about`, `/about-us`, `/people`, `/leadership` (try each in order).
2. Extract name + title pairs from headings, schema.org Person JSON-LD, meta tags, and text heuristics.
3. For each person found: run `seniorityMapper`, infer emails using `emailDetector` patterns, validate MX.
4. Playwright scrapes LinkedIn public company page if `socialProfiles.linkedinUrl` is set: extract recent "Employees" carousel if visible.
5. Write contacts to `contacts` collection with `bulkWrite` upsert on `(workspaceId, leadId, fullName.toLowerCase())`.
6. Update `lead.contactSummary` with count + top contact.

**Concurrency:** 2 parallel jobs per worker instance (Playwright-heavy).

**Retry:** 2 attempts, exponential backoff 30s base.

### `hubspot-sync` Queue

**Job payload:**
```typescript
{
  workspaceId: string;
  direction: 'push' | 'pull' | 'full';
  leadIds?: string[];     // if omitted = all leads in workspace
  triggeredBy: 'manual' | 'auto_job_complete' | 'scheduled';
}
```

**Processing logic (hubspot.worker.ts):**

**Push flow:**
1. Load workspace `crmConfig.hubspot` (select encrypted tokens).
2. Refresh token if within 5 minutes of expiry.
3. For each lead: upsert HubSpot Company object (name, domain, industry, city, country).
4. For each contact on that lead: upsert HubSpot Contact object; create Association (contact → company).
5. Store returned `hs_object_id` in `lead.crmRefs` and `contact.crmRefs`.
6. Write sync log entry to workspace.

**Pull flow:**
1. Fetch recently modified HubSpot Companies (modified since `lastSyncAt`).
2. Match by domain to existing leads; update `crmRefs.syncedAt`.
3. Fetch associated contacts; update or create contact records in LeadreAI.

**HubSpot API used:**
- `POST /crm/v3/objects/companies/batch/upsert` (by `domain` as unique key)
- `POST /crm/v3/objects/contacts/batch/upsert` (by `email` as unique key)
- `PUT /crm/v3/associations/{fromType}/{fromId}/{toType}/{toId}/{associationType}`
- `GET /crm/v3/objects/companies?modifiedAfter=...`

---

## HubSpot OAuth Flow Detail

1. User clicks "Connect HubSpot" in Settings → request hits `GET /crm/hubspot/connect`.
2. Backend redirects to: `https://app.hubspot.com/oauth/authorize?client_id=...&redirect_uri=...&scope=crm.objects.companies.write crm.objects.contacts.write oauth`
3. HubSpot redirects to `GET /crm/hubspot/callback?code=...`
4. Backend exchanges code for `access_token + refresh_token`. Both encrypted and stored in `workspace.crmConfig.hubspot`.
5. Frontend polling: after redirect, `useQuery(['crm-status'])` polls `/crm/hubspot/status` until it returns `connected: true`.

**Token refresh:** `hubspotTokenRefresher.ts` checks `expiresAt` before any sync operation and calls `POST https://api.hubapi.com/oauth/v1/token` with `grant_type=refresh_token` if within 300 seconds of expiry.

---

## Seniority Mapping Logic

`workers/src/services/seniorityMapper.ts` maps raw job titles → normalised values:

```typescript
// c_level signals
const C_LEVEL = ['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cpo', 'president', 'founder', 'co-founder', 'managing director', 'managing partner', 'principal'];

// vp signals
const VP = ['vice president', 'vp ', 'svp', 'evp'];

// director signals
const DIRECTOR = ['director', 'head of', 'global head'];

// manager signals
const MANAGER = ['manager', 'lead', 'team lead', 'senior manager'];

// department signals
const DEPT_MAP: Record<string, string> = {
  sales: ['sales', 'account executive', 'business development', 'bd', 'ae ', 'sdr', 'bdr'],
  marketing: ['marketing', 'growth', 'demand generation', 'brand', 'content', 'seo'],
  engineering: ['engineer', 'developer', 'cto', 'technology', 'infrastructure', 'devops', 'platform'],
  finance: ['finance', 'cfo', 'accounting', 'controller', 'treasury'],
  hr: ['people', 'hr', 'human resources', 'talent', 'recruiting'],
  legal: ['legal', 'counsel', 'compliance', 'general counsel'],
  operations: ['operations', 'ops', 'coo', 'supply chain', 'logistics'],
};
```

Scoring: title is lowercased, tested against each group in order (c_level → vp → director → manager → ic). Department inferred from keyword match.

---

## Frontend File Map

### Create

| File | Purpose |
|------|---------|
| `frontend/src/app/(dashboard)/dashboard/leads/[leadId]/contacts/page.tsx` | Contacts tab within lead detail view |
| `frontend/src/components/contacts/ContactCard.tsx` | Card showing name, title, seniority badge, email, LinkedIn link |
| `frontend/src/components/contacts/ContactDrawer.tsx` | Full-detail side drawer for a contact |
| `frontend/src/components/contacts/BuyingRoleSelector.tsx` | Dropdown to assign buying committee role |
| `frontend/src/components/contacts/SeniorityBadge.tsx` | Colour-coded badge (C-level = purple, VP = blue, Director = green, etc.) |
| `frontend/src/components/crm/HubSpotConnect.tsx` | OAuth initiation button + status indicator |
| `frontend/src/components/crm/SyncLogTable.tsx` | Table of last 50 sync entries |
| `frontend/src/hooks/useContacts.ts` | TanStack Query hook: fetch contacts for a lead |
| `frontend/src/hooks/useHubSpot.ts` | TanStack Query hook: CRM status + sync trigger |
| `frontend/src/app/(dashboard)/dashboard/settings/crm/page.tsx` | CRM settings sub-page |

### Modify

| File | What Changes |
|------|-------------|
| `frontend/src/app/(dashboard)/dashboard/leads/[leadId]/page.tsx` | Add "Contacts" tab alongside existing lead detail |
| `frontend/src/app/(dashboard)/dashboard/settings/page.tsx` | Add "CRM Integration" card linking to crm/page |
| `frontend/src/components/leads/LeadTable.tsx` | Add contact count column |
| `frontend/src/components/leads/LeadDetailDrawer.tsx` | Show top contact preview in the drawer header |

---

## Contact Card UI Spec

```
┌─────────────────────────────────────────────────────┐
│  [Avatar initials]  Jane Doe                    [C-Level] │
│                     CEO · Finance                         │
│  ─────────────────────────────────────────────────── │
│  📧 jane@acme.com  (direct, 0.92 confidence)  [Verify] │
│  📧 j.doe@acme.com (inferred, 0.67)                   │
│  🔗 linkedin.com/in/janedoe                    [Open]  │
│  ─────────────────────────────────────────────────── │
│  Buying Role: [Champion ▾]                            │
│  Last seen: 3 days ago · Source: Company website      │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Sequence

1. Write shared types (`contact.ts`, zod schemas) in `shared/`.
2. Create `Contact.ts` and `SuppressionList.ts` Mongoose models.
3. Modify `Lead.ts` to add `contactIds` and `contactSummary`.
4. Modify `Workspace.ts` to add `crmConfig`.
5. Create `contacts.controller.ts` and `contacts.routes.ts`; mount in `app.ts`.
6. Write `seniorityMapper.ts` worker service.
7. Write `contactExtractor.ts` — Playwright personnel scraper.
8. Write `contactEnricher.ts` pipeline stage.
9. Create `contact.worker.ts`; register in `workers/src/index.ts`.
10. Modify `leadWriter.ts` to dispatch contact-enrichment jobs after bulk upsert.
11. Write `hubspot.service.ts` — HubSpot API client with token refresh.
12. Write `crm.controller.ts` — OAuth handlers.
13. Write `crm.routes.ts`; mount in `app.ts`.
14. Write `hubspot.worker.ts`; register in `workers/src/index.ts`.
15. Add `HUBSPOT_CLIENT_ID/SECRET/REDIRECT_URI` to `backend/src/config/env.ts`.
16. Build frontend: `ContactCard`, `ContactDrawer`, `SeniorityBadge`, `BuyingRoleSelector`.
17. Build `useContacts` and `useHubSpot` hooks.
18. Integrate contacts tab into lead detail page.
19. Build `HubSpotConnect` component and CRM settings page.
20. Add contact count column to `LeadTable`.
21. Type-check and integration test: run a job, verify contacts appear, push to HubSpot sandbox.

---

## Verification Criteria

- [ ] A completed prospecting job with 20 leads shows contacts on at least 10 of them.
- [ ] Each contact card shows name, title, seniority badge, at least one email, LinkedIn link.
- [ ] Clicking "Sync to HubSpot" on a lead creates a Company + Contact in HubSpot sandbox within 30 seconds.
- [ ] HubSpot Company has correct domain, name, industry.
- [ ] HubSpot Contact is associated with the Company.
- [ ] Disconnecting HubSpot removes `crmConfig` and shows "Not connected" in settings.
- [ ] Re-running the job on the same domain does not create duplicate contacts (upsert by normalized name).
- [ ] Type-check passes across all packages.
