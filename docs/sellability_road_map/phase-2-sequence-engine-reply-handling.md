# Phase 2: Sequence Engine + Reply / Bounce / Unsubscribe Handling

## Goal

Turn LeadreAI from a single-send tool into a full outbound execution engine. Users define multi-step email sequences (and optionally LinkedIn / SMS steps), enroll leads, and the platform automatically handles scheduling, follow-ups, stop rules, reply detection, bounce processing, and unsubscribe compliance. This is the single most impactful feature for converting the product from "interesting demo" to "daily-use tool."

## Commercial Outcome

- Sequences are the primary reason outbound teams pay for dedicated tools (Outreach, Apollo, Salesloft).
- Reply and bounce handling is a legal/compliance requirement in most markets (CAN-SPAM, GDPR).
- Enabling this phase unlocks the Growth plan ($999/mo).

---

## What Users Can Do After This Phase

1. Create a sequence: define 3-5 steps, each with a channel (email), delay in days, time window, subject/body template using lead variables.
2. Enroll leads from any campaign into a sequence with one click.
3. Watch the sequence dashboard: who is active, who replied, who bounced, who unsubscribed, who hasn't been touched yet.
4. Set stop rules: "Stop sequence for this lead if they reply to any step" (default) or "only if tagged Interested."
5. Receive an in-app notification when a lead replies — click through to view the reply thread.
6. Bounced emails are automatically flagged; the lead's `outreachStatus` is updated to `bounced`.
7. Unsubscribe links are automatically appended to every outgoing email.
8. A suppression list prevents re-mailing unsubscribed or hard-bounced contacts.

---

## Architecture Overview

### Sequence Data Model

Two new collections: `sequences` (the template) and `sequence_enrollments` (per-lead state machine). Enrollment is the unit of execution — it tracks which step a lead is on, the scheduled send time of the next step, and the outcome.

### Execution Model

A new `sequence-scheduler` BullMQ worker runs on a 1-minute cron (`QueueScheduler`). It finds all enrollments where `nextStepAt <= now` and status is `active`, then dispatches individual `sequence-step-send` jobs. This decouples scheduling from sending.

### Reply / Bounce Ingestion

- **Resend:** webhook `POST /webhooks/resend` receives `email.delivered`, `email.bounced`, `email.opened`, `email.clicked`, `email.complained` events.
- **SendGrid:** webhook `POST /webhooks/sendgrid` receives the same event types in SendGrid format.
- **Reply detection:** both providers can forward inbound replies to a webhook. Alternatively, an IMAP poll worker checks a dedicated reply-catch inbox every 5 minutes.
- **Unsubscribe:** every outgoing email includes `List-Unsubscribe: <mailto:unsub@leadreai.app?subject=unsub-{token}>` and a one-click pixel/link. Unsubscribe token encodes workspaceId + recipientEmail.

---

## Database Schemas

### New: `sequences` Collection

```typescript
interface ISequence {
  _id: ObjectId;
  workspaceId: ObjectId;
  createdBy: ObjectId;
  name: string;                         // "Agency Outreach Q2"
  description?: string;
  status: 'draft' | 'active' | 'paused' | 'archived';

  steps: Array<{
    _id: ObjectId;
    stepNumber: number;                 // 1-based
    channel: 'email' | 'linkedin' | 'sms';
    delayDays: number;                  // days after previous step (0 = same day as enroll for step 1)
    sendWindow?: {
      startHour: number;               // 0-23 in workspace timezone
      endHour: number;
      timezone: string;                // IANA e.g. "Africa/Lagos"
      allowedDays: number[];           // 0=Sun … 6=Sat, e.g. [1,2,3,4,5] = weekdays only
    };
    emailTemplate?: {
      subject: string;                 // supports {{firstName}}, {{companyName}}, {{industry}} etc.
      body: string;                    // plain text + markdown; variables same as subject
      fromName?: string;               // override workspace default
      replyTo?: string;
    };
    linkedinTemplate?: {
      message: string;                 // LinkedIn connection request message
    };
    smsTemplate?: {
      body: string;
    };
    conditions?: Array<{
      field: 'tag' | 'outreachStatus' | 'reply_received';
      operator: 'equals' | 'not_equals' | 'contains';
      value: string;
    }>;
  }>;

  stopRules: Array<{
    trigger: 'any_reply' | 'positive_reply' | 'meeting_booked' | 'unsubscribe' | 'bounce' | 'manual_tag';
    tagValue?: string;                 // only for manual_tag
    action: 'stop_sequence' | 'pause_sequence' | 'move_to_step';
    targetStep?: number;
  }>;

  stats: {
    totalEnrolled: number;
    active: number;
    completed: number;
    replied: number;
    bounced: number;
    unsubscribed: number;
    openRate?: number;
    replyRate?: number;
  };

  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

### New: `sequence_enrollments` Collection

```typescript
interface ISequenceEnrollment {
  _id: ObjectId;
  workspaceId: ObjectId;
  sequenceId: ObjectId;
  leadId: ObjectId;
  contactId?: ObjectId;               // if enrolled at contact level
  enrolledBy: ObjectId;               // userId who triggered enrollment

  status: 'active' | 'paused' | 'completed' | 'stopped' | 'bounced' | 'unsubscribed' | 'replied';
  currentStep: number;                // which step is next (1-based)
  nextStepAt?: Date;                  // when to execute currentStep
  completedAt?: Date;
  stopReason?: string;                // "any_reply" | "bounce" | "unsubscribed" | "manual"

  stepHistory: Array<{
    stepNumber: number;
    sentAt?: Date;
    deliveredAt?: Date;
    openedAt?: Date;
    clickedAt?: Date;
    repliedAt?: Date;
    bouncedAt?: Date;
    bounceType?: 'hard' | 'soft';
    status: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'failed' | 'skipped';
    messageId?: string;               // provider message ID for event matching
    errorMessage?: string;
    toEmail?: string;                 // actual email address used
  }>;

  createdAt: Date;
  updatedAt: Date;
}
```
Indexes: `(workspaceId, status, nextStepAt)`, `(sequenceId, leadId)` unique, `(leadId, status)`, `messageId` sparse.

### New: `email_events` Collection

```typescript
interface IEmailEvent {
  _id: ObjectId;
  workspaceId: ObjectId;
  enrollmentId?: ObjectId;
  outreachDraftId?: ObjectId;         // for single-send events
  messageId: string;                  // provider-assigned ID
  event: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'replied' | 'unsubscribed';
  provider: 'resend' | 'sendgrid' | 'smtp';
  bounceType?: 'hard' | 'soft';
  raw: Record<string, unknown>;       // raw webhook payload
  occurredAt: Date;
  processedAt: Date;
}
```
Indexes: `messageId`, `enrollmentId`, TTL 365 days on `occurredAt`.

### Modifications to `Workspace` Model

Add:
```typescript
supression?: {                        // workspace-level suppression list (global in SuppressionList collection)
  totalSuppressed: number;
};
sequenceDefaults?: {
  timezone: string;                   // IANA timezone for send windows
  sendWindowStart: number;            // default hour (e.g. 8)
  sendWindowEnd: number;              // default hour (e.g. 17)
  allowedDays: number[];              // default [1,2,3,4,5]
};
```

### Modifications to `OutreachDraft` / `Lead` Models

`Lead`:
- Add `outreachStatus` values: `'bounced' | 'unsubscribed' | 'replied'` (extend existing enum).
- Add `suppressedAt?: Date`, `suppressReason?: string`.

---

## API Endpoints

### Sequences (`/api/v1/workspaces/:workspaceId/sequences`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/sequences` | member+ | List sequences (paginated, filterable by status) |
| POST | `/sequences` | admin+ | Create new sequence |
| GET | `/sequences/:sequenceId` | member+ | Get sequence with full step detail |
| PATCH | `/sequences/:sequenceId` | admin+ | Update name, steps, stop rules, status |
| DELETE | `/sequences/:sequenceId` | admin+ | Archive sequence (soft delete) |
| POST | `/sequences/:sequenceId/enroll` | member+ | Enroll leads: `{ leadIds: string[], contactIds?: string[] }` |
| POST | `/sequences/:sequenceId/pause` | admin+ | Pause all active enrollments |
| POST | `/sequences/:sequenceId/resume` | admin+ | Resume paused enrollments |
| GET | `/sequences/:sequenceId/stats` | member+ | Aggregate stats per step |

### Enrollments (`/api/v1/workspaces/:workspaceId/enrollments`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/enrollments` | member+ | List enrollments. Query: `sequenceId`, `status`, `leadId` |
| GET | `/enrollments/:enrollmentId` | member+ | Enrollment detail with full step history |
| POST | `/enrollments/:enrollmentId/pause` | member+ | Pause single enrollment |
| POST | `/enrollments/:enrollmentId/resume` | member+ | Resume single enrollment |
| POST | `/enrollments/:enrollmentId/stop` | member+ | Stop + mark reason |
| POST | `/enrollments/:enrollmentId/advance` | admin+ | Skip current step, advance to next |

### Webhook Receivers (public, HMAC-verified)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/webhooks/resend` | HMAC sig | Resend event ingestion |
| POST | `/webhooks/sendgrid` | HMAC sig | SendGrid event ingestion |
| GET | `/unsubscribe` | — | Unsubscribe one-click handler (token in query string) |

### Suppression List (`/api/v1/workspaces/:workspaceId/suppression`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/suppression` | admin+ | List suppressed emails/domains |
| POST | `/suppression` | admin+ | Manually add `{ email?, domain?, reason }` |
| DELETE | `/suppression/:id` | admin+ | Remove from suppression list |
| POST | `/suppression/check` | member+ | Check if email is suppressed: `{ email }` → `{ suppressed: bool, reason? }` |
| POST | `/suppression/import` | admin+ | Bulk import suppression list from CSV |

---

## New Environment Variables

```bash
# Webhook HMAC secrets
RESEND_WEBHOOK_SECRET=
SENDGRID_WEBHOOK_SECRET=

# Unsubscribe
UNSUBSCRIBE_BASE_URL=https://app.leadreai.app/unsubscribe
UNSUBSCRIBE_TOKEN_SECRET=        # 32+ chars for JWT-style unsubscribe tokens

# Reply catch inbox (IMAP polling, optional)
REPLY_CATCH_EMAIL=replies@leadreai.app
REPLY_CATCH_IMAP_HOST=imap.gmail.com
REPLY_CATCH_IMAP_PORT=993
REPLY_CATCH_IMAP_USER=
REPLY_CATCH_IMAP_PASS=

# Sequence worker
SEQUENCE_SCHEDULER_INTERVAL_MS=60000    # 1 minute
SEQUENCE_MAX_SENDS_PER_MINUTE=50        # global rate cap
```

---

## Backend File Map

### Create

| File | Purpose |
|------|---------|
| `backend/src/models/Sequence.ts` | Sequence template model |
| `backend/src/models/SequenceEnrollment.ts` | Enrollment state machine model |
| `backend/src/models/EmailEvent.ts` | Normalised email provider events |
| `backend/src/controllers/sequences.controller.ts` | Sequence CRUD + enroll/pause/resume |
| `backend/src/controllers/enrollments.controller.ts` | Enrollment state management |
| `backend/src/controllers/webhooks.controller.ts` | Resend + SendGrid webhook ingestion |
| `backend/src/controllers/suppression.controller.ts` | Suppression list CRUD |
| `backend/src/routes/sequences.routes.ts` | Sequence routes |
| `backend/src/routes/enrollments.routes.ts` | Enrollment routes |
| `backend/src/routes/webhooks.routes.ts` | Webhook routes (no auth, HMAC only) |
| `backend/src/routes/suppression.routes.ts` | Suppression routes |
| `backend/src/services/unsubscribe.ts` | Token generation + decode for unsubscribe links |
| `backend/src/services/emailEvent.service.ts` | Process incoming provider events → update enrollments + leads |
| `backend/src/middleware/webhookHmac.ts` | HMAC signature verification middleware |
| `workers/src/sequence.worker.ts` | BullMQ worker: execute individual sequence steps |
| `workers/src/sequenceScheduler.ts` | Cron-tick worker: find due enrollments, dispatch step jobs |
| `workers/src/services/templateRenderer.ts` | Replace `{{firstName}}` etc. in email templates with lead/contact data |
| `workers/src/services/sendWindowChecker.ts` | Given a send window config, return next valid send datetime |
| `workers/src/imap.worker.ts` | (Optional) Poll IMAP inbox for replies, classify, update enrollments |

### Modify

| File | What Changes |
|------|-------------|
| `backend/src/app.ts` | Mount sequences, enrollments, webhooks, suppression routes |
| `backend/src/models/Lead.ts` | Extend `outreachStatus` enum; add `suppressedAt`, `suppressReason` |
| `backend/src/services/email/emailService.ts` | Inject `List-Unsubscribe` header + unsubscribe link footer on every send |
| `workers/src/index.ts` | Register sequence and scheduler workers |
| `backend/src/config/env.ts` | Add webhook secrets, IMAP, sequence env vars |

---

## Workers Detail

### `sequenceScheduler` (cron, every 60s)

Not a BullMQ queue — runs as a `setInterval` inside the workers process.

```typescript
async function tick() {
  const now = new Date();
  const dueEnrollments = await SequenceEnrollment.find({
    status: 'active',
    nextStepAt: { $lte: now },
  }).limit(200).lean();

  for (const enrollment of dueEnrollments) {
    await sequenceStepQueue.add('step', {
      enrollmentId: enrollment._id.toString(),
      stepNumber: enrollment.currentStep,
    }, { jobId: `step-${enrollment._id}-${enrollment.currentStep}` }); // idempotent
  }
}
```

### `sequence-step` Queue Worker

For each job:
1. Load enrollment + sequence + lead + contact (if any).
2. Check stop rules — if a stop condition is already met, mark enrollment `stopped`.
3. Check suppression list — if lead email is suppressed, skip step, mark `skipped`.
4. Resolve the step template — call `templateRenderer` to fill variables.
5. Check `sendWindow` — call `sendWindowChecker` to confirm current time is within window. If not, reschedule `nextStepAt` to next valid time.
6. Send email via `emailService.sendEmailForWorkspace`.
7. Update `enrollment.stepHistory[n].status = 'sent'`, `sentAt = now`.
8. Calculate `nextStepAt` for next step: `now + steps[n+1].delayDays * 86400000`, adjusted by send window.
9. If no next step: set `enrollment.status = 'completed'`.

### `emailEvent.service.ts` — Event Processing

Called by webhook controllers after HMAC verification:

1. Normalise provider-specific payload into `IEmailEvent`.
2. Look up enrollment by `messageId` (stored when step was sent).
3. Dispatch to handler:
   - `delivered`: update `stepHistory[n].deliveredAt`
   - `opened`: update `stepHistory[n].openedAt`; mark `stats.openRate`
   - `bounced`:
     - Hard bounce: set enrollment `status = 'bounced'`; add email to suppression list; set `lead.outreachStatus = 'bounced'`
     - Soft bounce: record, retry next send window (max 2 retries then hard-stop)
   - `complained` (spam): treat as hard bounce + suppress
   - `replied`: set enrollment `status = 'replied'`; create in-app notification; evaluate stop rules

### `templateRenderer.ts`

```typescript
const VARIABLES: Record<string, (lead: ILead, contact?: IContact) => string> = {
  firstName: (l, c) => c?.firstName ?? l.companyName.split(' ')[0] ?? '',
  lastName: (l, c) => c?.lastName ?? '',
  fullName: (l, c) => c?.fullName ?? l.companyName,
  companyName: (l) => l.companyName,
  industry: (l) => l.industry ?? '',
  city: (l) => l.address?.city ?? '',
  country: (l) => l.address?.country ?? '',
  website: (l) => l.website ?? l.companyDomain ?? '',
  title: (_, c) => c?.title ?? '',
};

export function renderTemplate(template: string, lead: ILead, contact?: IContact): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return VARIABLES[key]?.(lead, contact) ?? '';
  });
}
```

---

## Unsubscribe System

### Unsubscribe Token Format

JWT signed with `UNSUBSCRIBE_TOKEN_SECRET`, payload:
```json
{ "wid": "<workspaceId>", "email": "<recipientEmail>", "exp": <30 days from send> }
```

### Email Footer Injection (`emailService.ts`)

Every outbound email from `sendEmailForWorkspace` gets appended:
```
---
You received this email because you are in our prospecting database. 
To unsubscribe, click here: {UNSUBSCRIBE_BASE_URL}?t={token}
```

And the header: `List-Unsubscribe: <{UNSUBSCRIBE_BASE_URL}?t={token}>, <mailto:unsub+{token}@leadreai.app>`

### Unsubscribe Handler (`GET /unsubscribe?t=...`)

1. Decode and verify JWT.
2. Find or create suppression entry for `email` in that workspace.
3. Set `lead.outreachStatus = 'unsubscribed'` for any lead with matching email.
4. Stop all active enrollments for that email.
5. Render a simple HTML confirmation page: "You have been unsubscribed. No further emails will be sent."

---

## Frontend File Map

### Create

| File | Purpose |
|------|---------|
| `frontend/src/app/(dashboard)/dashboard/sequences/page.tsx` | Sequence list view |
| `frontend/src/app/(dashboard)/dashboard/sequences/new/page.tsx` | Sequence builder |
| `frontend/src/app/(dashboard)/dashboard/sequences/[sequenceId]/page.tsx` | Sequence detail + enrollment dashboard |
| `frontend/src/components/sequences/SequenceBuilder.tsx` | Multi-step drag-and-drop builder |
| `frontend/src/components/sequences/StepEditor.tsx` | Edit a single step: channel, delay, template, send window |
| `frontend/src/components/sequences/EnrollmentTable.tsx` | Table of enrollments for a sequence |
| `frontend/src/components/sequences/StepTimeline.tsx` | Visual timeline of a contact's journey through steps |
| `frontend/src/components/sequences/SequenceStatsBar.tsx` | Reply rate, open rate, bounce rate at a glance |
| `frontend/src/components/sequences/TemplateEditor.tsx` | Rich-text input with {{variable}} autocomplete |
| `frontend/src/components/sequences/StopRulesPanel.tsx` | Configure stop conditions |
| `frontend/src/hooks/useSequences.ts` | TanStack Query: CRUD sequences |
| `frontend/src/hooks/useEnrollments.ts` | TanStack Query: enrollments list + enrollment actions |

### Modify

| File | What Changes |
|------|-------------|
| `frontend/src/app/(dashboard)/dashboard/campaigns/[campaignId]/page.tsx` | Add "Enroll in Sequence" button for campaign leads |
| `frontend/src/components/leads/LeadDetailDrawer.tsx` | Show sequence enrollment status per lead |
| `frontend/src/app/(dashboard)/dashboard/layout.tsx` | Add "Sequences" nav item |

---

## Sequence Builder UI Spec

```
┌───────────────────────────────────────────────────────────┐
│  Sequence: "Agency Cold Outreach"                  [Save] │
│  Status: [Draft ▾]                                        │
├───────────────────────────────────────────────────────────┤
│  Steps                                                    │
│                                                           │
│  ① Email  •  Day 0  •  Weekdays 8am-5pm Lagos            │
│  Subject: Quick question about {{companyName}}            │
│  [Edit] [Delete]                                          │
│                          ↓ 3 days                        │
│  ② Email  •  Day 3  •  Weekdays 8am-5pm Lagos            │
│  Subject: Following up on my previous note               │
│  [Edit] [Delete]                                          │
│                          ↓ 5 days                        │
│  ③ Email  •  Day 8  •  Weekdays 8am-5pm Lagos            │
│  Subject: Last check-in from my side                     │
│  [Edit] [Delete]                                          │
│                                                           │
│  [+ Add Step]                                             │
├───────────────────────────────────────────────────────────┤
│  Stop Rules                                               │
│  ☑ Stop if lead replies to any step                      │
│  ☑ Stop if lead unsubscribes                             │
│  ☑ Stop if email hard-bounces                            │
└───────────────────────────────────────────────────────────┘
```

---

## Implementation Sequence

1. Write shared types for Sequence, Enrollment, EmailEvent, SuppressionEntry.
2. Create `Sequence.ts`, `SequenceEnrollment.ts`, `EmailEvent.ts`, `SuppressionList.ts` models.
3. Create `sequences.controller.ts`, `enrollments.controller.ts`, routes, mount in `app.ts`.
4. Create `suppression.controller.ts` and routes.
5. Create `webhookHmac.ts` middleware.
6. Create `unsubscribe.ts` token service.
7. Modify `emailService.ts` to inject unsubscribe footer + `List-Unsubscribe` header.
8. Create `webhooks.controller.ts`; handle Resend + SendGrid events.
9. Create `emailEvent.service.ts` — process events into enrollment state updates.
10. Create `templateRenderer.ts` and `sendWindowChecker.ts` worker services.
11. Create `sequence.worker.ts` (step execution).
12. Create `sequenceScheduler.ts` (cron tick).
13. Register both in `workers/src/index.ts`.
14. Create `imap.worker.ts` (optional, controlled by env).
15. Build frontend sequence builder pages and components.
16. Add enrollment status to lead drawer.
17. Add "Enroll in Sequence" to campaign page.
18. End-to-end test: create 3-step sequence, enroll 5 leads, verify step 1 sends, verify step 2 schedules for +3 days, trigger a test bounce, verify enrollment stops.

---

## Verification Criteria

- [ ] Create a 3-step sequence, enroll 2 test leads — step 1 sends within 60 seconds.
- [ ] After simulating a reply webhook event, enrollment status changes to `replied`.
- [ ] After simulating a hard bounce webhook, lead `outreachStatus = 'bounced'` and email is added to suppression.
- [ ] Unsubscribe link in email footer opens confirmation page; lead is suppressed.
- [ ] Re-enrolling a suppressed lead in a sequence auto-skips all email steps.
- [ ] Stop rules: replying to step 2 prevents step 3 from sending.
- [ ] Template variables `{{firstName}}`, `{{companyName}}`, `{{industry}}` render correctly.
- [ ] Send window respects timezone: a 9am-5pm window doesn't send at 2am local time.
