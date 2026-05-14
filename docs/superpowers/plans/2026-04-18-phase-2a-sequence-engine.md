# Phase 2A: Sequence Engine — Backend + Workers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full sequence engine backend — Mongoose models, REST APIs for sequences/enrollments/suppression/webhooks/unsubscribe, BullMQ sequence-step worker, and 60 s cron scheduler that dispatches due enrollment jobs — zero frontend changes.

**Architecture:** Three new Mongoose models (Sequence, SequenceEnrollment, EmailEvent). The backend exposes REST routes for managing sequences and enrollments. A `setInterval` scheduler in the workers process queries MongoDB for due enrollments and dispatches `sequence-step` BullMQ jobs. A dedicated BullMQ worker processes each job: checks suppression, renders templates, respects send windows, sends email via workspace config, then updates enrollment state. Resend/SendGrid webhook events are HMAC-verified and processed by `emailEvent.service.ts` which updates enrollment state (bounces → suppress; replies → stop sequence). Every outgoing email has a List-Unsubscribe header and footer injected automatically.

**Tech Stack:** Express 4, Mongoose 8, BullMQ 5, IORedis, jsonwebtoken (already in project), nodemailer + Resend SDK (already in project), Node.js `crypto` module (HMAC). No new packages required except `jsonwebtoken` in workers (must be added).

---

## Codebase Context (read before starting any task)

- Repo root: `/Users/Apple/Desktop/personal-projects/leadreai`
- Backend: `backend/src/` — Express 4 + Mongoose 8
- Workers: `workers/src/` — BullMQ workers (each gets own Redis connection)
- Shared: `shared/src/` — TypeScript types + constants used by both
- Queue prefix constant: `QUEUE_PREFIX = \`{bull}:leadreai:${env.NODE_ENV}\`` in `backend/src/services/queue/queues.ts`
- Error helpers: `ApiError.badRequest()`, `ApiError.notFound()`, `ApiError.unauthorized()` from `backend/src/utils/ApiError.ts`
- Route pattern: `Router({ mergeParams: true })`, wrapped in `asyncHandler()`, guarded by `authenticate` + `authorize(['owner','admin','member'])` middleware
- Controllers: named export async functions `(req: Request, res: Response): Promise<void>`
- Suppress model already exists at `backend/src/models/SuppressionList.ts` — `SuppressionEntry` model, fields: `workspaceId`, `email?`, `domain?`, `reason`, `addedAt`, `addedBy`
- Workers inline Mongoose schemas rather than importing from backend package
- `OUTREACH_STATUSES` in `shared/src/utils/constants.ts` — currently missing `'unsubscribed'`

---

## File Map

**Create:**
- `shared/src/types/sequence.ts` — ISequence, ISequenceEnrollment, IEmailEvent interfaces
- `backend/src/models/Sequence.ts` — sequence template model
- `backend/src/models/SequenceEnrollment.ts` — enrollment state machine model
- `backend/src/models/EmailEvent.ts` — normalised provider event model
- `backend/src/controllers/suppression.controller.ts` — suppression CRUD
- `backend/src/routes/suppression.routes.ts`
- `backend/src/controllers/sequences.controller.ts` — sequence CRUD + enroll/pause/resume
- `backend/src/routes/sequences.routes.ts`
- `backend/src/controllers/enrollments.controller.ts` — enrollment list + per-enrollment actions
- `backend/src/routes/enrollments.routes.ts`
- `backend/src/services/unsubscribe.ts` — JWT sign/verify for unsubscribe tokens
- `backend/src/middleware/webhookHmac.ts` — HMAC signature middleware
- `backend/src/services/emailEvent.service.ts` — process provider events → update enrollment state
- `backend/src/controllers/webhooks.controller.ts` — Resend + SendGrid ingestion + GET /unsubscribe
- `backend/src/routes/webhooks.routes.ts`
- `workers/src/services/templateRenderer.ts` — `{{variable}}` interpolation
- `workers/src/services/sendWindowChecker.ts` — next valid send datetime
- `workers/src/sequence.worker.ts` — BullMQ `sequence-step` job processor
- `workers/src/sequenceScheduler.ts` — setInterval cron

**Modify:**
- `shared/src/utils/constants.ts` — add `'unsubscribed'` to OUTREACH_STATUSES; add SEQUENCE_STATUSES, ENROLLMENT_STATUSES, EMAIL_EVENT_TYPES constants
- `shared/src/types/index.ts` — re-export `./sequence.js`
- `backend/src/models/Lead.ts` — add `suppressedAt?: Date`, `suppressReason?: string`
- `backend/src/services/email/emailService.ts` — add `unsubscribeUrl?` to SendEmailOptions; inject List-Unsubscribe header + plain-text footer
- `backend/src/services/queue/queues.ts` — add `getSequenceStepQueue()`
- `backend/src/app.ts` — add `rawBody` to express.json verify; mount suppression/sequences/enrollments/webhooks routes
- `backend/src/config/env.ts` — add webhook secrets + unsubscribe env vars
- `workers/src/index.ts` — register sequence worker + start scheduler
- `workers/src/config/env.ts` — add JWT_SECRET (required), UNSUBSCRIBE_BASE_URL, UNSUBSCRIBE_TOKEN_SECRET, SEQUENCE_SCHEDULER_INTERVAL_MS

---

### Task 1: Shared Types + Constants

**Files:**
- Modify: `shared/src/utils/constants.ts`
- Create: `shared/src/types/sequence.ts`
- Modify: `shared/src/types/index.ts`

- [ ] **Step 1: Add constants to `shared/src/utils/constants.ts`**

Add these exports at the bottom of the file (after the existing constants):

```typescript
export const SEQUENCE_STATUSES = ['draft', 'active', 'paused', 'archived'] as const;
export type SequenceStatus = (typeof SEQUENCE_STATUSES)[number];

export const ENROLLMENT_STATUSES = [
  'active', 'paused', 'completed', 'stopped', 'bounced', 'unsubscribed', 'replied',
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const STEP_STATUSES = [
  'pending', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed', 'skipped',
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const EMAIL_EVENT_TYPES = [
  'delivered', 'opened', 'clicked', 'bounced', 'complained', 'replied', 'unsubscribed',
] as const;
export type EmailEventType = (typeof EMAIL_EVENT_TYPES)[number];

export const EMAIL_PROVIDERS = ['resend', 'sendgrid', 'smtp'] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];
```

Also **extend** OUTREACH_STATUSES — replace the existing definition:
```typescript
export const OUTREACH_STATUSES = [
  'not_contacted',
  'draft_created',
  'sent',
  'replied',
  'bounced',
  'unsubscribed',
] as const;
```

- [ ] **Step 2: Create `shared/src/types/sequence.ts`**

```typescript
import type { SequenceStatus, EnrollmentStatus, StepStatus, EmailEventType, EmailProvider } from '../utils/constants.js';

export interface ISequenceStep {
  _id: string;
  stepNumber: number;
  channel: 'email' | 'linkedin' | 'sms';
  delayDays: number;
  sendWindow?: {
    startHour: number;
    endHour: number;
    timezone: string;
    allowedDays: number[];
  };
  emailTemplate?: {
    subject: string;
    body: string;
    fromName?: string;
    replyTo?: string;
  };
}

export interface ISequenceStopRule {
  trigger: 'any_reply' | 'positive_reply' | 'unsubscribe' | 'bounce';
  action: 'stop_sequence' | 'pause_sequence';
}

export interface ISequenceStats {
  totalEnrolled: number;
  active: number;
  completed: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
}

export interface ISequence {
  _id: string;
  workspaceId: string;
  createdBy: string;
  name: string;
  description?: string;
  status: SequenceStatus;
  steps: ISequenceStep[];
  stopRules: ISequenceStopRule[];
  stats: ISequenceStats;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IStepHistoryEntry {
  stepNumber: number;
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  clickedAt?: string;
  repliedAt?: string;
  bouncedAt?: string;
  bounceType?: 'hard' | 'soft';
  status: StepStatus;
  messageId?: string;
  errorMessage?: string;
  toEmail?: string;
}

export interface ISequenceEnrollment {
  _id: string;
  workspaceId: string;
  sequenceId: string;
  leadId: string;
  contactId?: string;
  enrolledBy: string;
  status: EnrollmentStatus;
  currentStep: number;
  nextStepAt?: string;
  completedAt?: string;
  stopReason?: string;
  stepHistory: IStepHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface IEmailEvent {
  _id: string;
  workspaceId: string;
  enrollmentId?: string;
  messageId: string;
  event: EmailEventType;
  provider: EmailProvider;
  bounceType?: 'hard' | 'soft';
  occurredAt: string;
  processedAt: string;
}
```

- [ ] **Step 3: Export from `shared/src/types/index.ts`**

Add at the end:
```typescript
export * from './sequence.js';
```

- [ ] **Step 4: Build shared package and verify types**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/shared && npx tsc --noEmit 2>&1 | tail -10
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add shared/src/utils/constants.ts shared/src/types/sequence.ts shared/src/types/index.ts
git commit -m "feat(shared): sequence/enrollment/emailEvent types + OUTREACH_STATUSES unsubscribed"
```

---

### Task 2: Mongoose Models (Sequence, SequenceEnrollment, EmailEvent)

**Files:**
- Create: `backend/src/models/Sequence.ts`
- Create: `backend/src/models/SequenceEnrollment.ts`
- Create: `backend/src/models/EmailEvent.ts`
- Modify: `backend/src/models/Lead.ts`

- [ ] **Step 1: Create `backend/src/models/Sequence.ts`**

```typescript
import mongoose, { Schema } from 'mongoose';
import { SEQUENCE_STATUSES, type SequenceStatus } from '@leadreai/shared';

export interface ISequenceDoc extends mongoose.Document {
  workspaceId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  status: SequenceStatus;
  steps: Array<{
    _id: mongoose.Types.ObjectId;
    stepNumber: number;
    channel: 'email' | 'linkedin' | 'sms';
    delayDays: number;
    sendWindow?: {
      startHour: number;
      endHour: number;
      timezone: string;
      allowedDays: number[];
    };
    emailTemplate?: {
      subject: string;
      body: string;
      fromName?: string;
      replyTo?: string;
    };
  }>;
  stopRules: Array<{
    trigger: 'any_reply' | 'positive_reply' | 'unsubscribe' | 'bounce';
    action: 'stop_sequence' | 'pause_sequence';
  }>;
  stats: {
    totalEnrolled: number;
    active: number;
    completed: number;
    replied: number;
    bounced: number;
    unsubscribed: number;
  };
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const sendWindowSchema = new Schema({
  startHour: { type: Number, min: 0, max: 23, required: true },
  endHour: { type: Number, min: 0, max: 23, required: true },
  timezone: { type: String, required: true },
  allowedDays: [{ type: Number, min: 0, max: 6 }],
}, { _id: false });

const stepSchema = new Schema({
  stepNumber: { type: Number, required: true, min: 1 },
  channel: { type: String, enum: ['email', 'linkedin', 'sms'], default: 'email' },
  delayDays: { type: Number, required: true, min: 0, default: 0 },
  sendWindow: { type: sendWindowSchema },
  emailTemplate: {
    subject: String,
    body: String,
    fromName: String,
    replyTo: String,
  },
});

const sequenceSchema = new Schema<ISequenceDoc>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 1000 },
    status: { type: String, enum: SEQUENCE_STATUSES, default: 'draft' },
    steps: { type: [stepSchema], default: [] },
    stopRules: {
      type: [
        {
          trigger: { type: String, enum: ['any_reply', 'positive_reply', 'unsubscribe', 'bounce'], required: true },
          action: { type: String, enum: ['stop_sequence', 'pause_sequence'], required: true },
        },
      ],
      default: [
        { trigger: 'any_reply', action: 'stop_sequence' },
        { trigger: 'unsubscribe', action: 'stop_sequence' },
        { trigger: 'bounce', action: 'stop_sequence' },
      ],
    },
    stats: {
      totalEnrolled: { type: Number, default: 0 },
      active: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      replied: { type: Number, default: 0 },
      bounced: { type: Number, default: 0 },
      unsubscribed: { type: Number, default: 0 },
    },
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
);

sequenceSchema.index({ workspaceId: 1, status: 1 });
sequenceSchema.index({ workspaceId: 1, createdAt: -1 });

export default mongoose.model<ISequenceDoc>('Sequence', sequenceSchema);
```

- [ ] **Step 2: Create `backend/src/models/SequenceEnrollment.ts`**

```typescript
import mongoose, { Schema } from 'mongoose';
import { ENROLLMENT_STATUSES, STEP_STATUSES, type EnrollmentStatus, type StepStatus } from '@leadreai/shared';

export interface ISequenceEnrollmentDoc extends mongoose.Document {
  workspaceId: mongoose.Types.ObjectId;
  sequenceId: mongoose.Types.ObjectId;
  leadId: mongoose.Types.ObjectId;
  contactId?: mongoose.Types.ObjectId;
  enrolledBy: mongoose.Types.ObjectId;
  status: EnrollmentStatus;
  currentStep: number;
  nextStepAt?: Date;
  completedAt?: Date;
  stopReason?: string;
  stepHistory: Array<{
    stepNumber: number;
    sentAt?: Date;
    deliveredAt?: Date;
    openedAt?: Date;
    clickedAt?: Date;
    repliedAt?: Date;
    bouncedAt?: Date;
    bounceType?: 'hard' | 'soft';
    status: StepStatus;
    messageId?: string;
    errorMessage?: string;
    toEmail?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const stepHistorySchema = new Schema({
  stepNumber: { type: Number, required: true },
  sentAt: Date,
  deliveredAt: Date,
  openedAt: Date,
  clickedAt: Date,
  repliedAt: Date,
  bouncedAt: Date,
  bounceType: { type: String, enum: ['hard', 'soft'] },
  status: { type: String, enum: STEP_STATUSES, default: 'pending' },
  messageId: String,
  errorMessage: String,
  toEmail: String,
}, { _id: false });

const enrollmentSchema = new Schema<ISequenceEnrollmentDoc>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    sequenceId: { type: Schema.Types.ObjectId, ref: 'Sequence', required: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact' },
    enrolledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ENROLLMENT_STATUSES, default: 'active' },
    currentStep: { type: Number, default: 1, min: 1 },
    nextStepAt: Date,
    completedAt: Date,
    stopReason: String,
    stepHistory: { type: [stepHistorySchema], default: [] },
  },
  { timestamps: true },
);

enrollmentSchema.index({ workspaceId: 1, status: 1, nextStepAt: 1 });
enrollmentSchema.index({ sequenceId: 1, leadId: 1 }, { unique: true });
enrollmentSchema.index({ leadId: 1, status: 1 });
enrollmentSchema.index({ 'stepHistory.messageId': 1 }, { sparse: true });

export default mongoose.model<ISequenceEnrollmentDoc>('SequenceEnrollment', enrollmentSchema);
```

- [ ] **Step 3: Create `backend/src/models/EmailEvent.ts`**

```typescript
import mongoose, { Schema } from 'mongoose';
import { EMAIL_EVENT_TYPES, EMAIL_PROVIDERS, type EmailEventType, type EmailProvider } from '@leadreai/shared';

export interface IEmailEventDoc extends mongoose.Document {
  workspaceId: mongoose.Types.ObjectId;
  enrollmentId?: mongoose.Types.ObjectId;
  messageId: string;
  event: EmailEventType;
  provider: EmailProvider;
  bounceType?: 'hard' | 'soft';
  raw: Record<string, unknown>;
  occurredAt: Date;
  processedAt: Date;
}

const emailEventSchema = new Schema<IEmailEventDoc>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'SequenceEnrollment' },
    messageId: { type: String, required: true },
    event: { type: String, enum: EMAIL_EVENT_TYPES, required: true },
    provider: { type: String, enum: EMAIL_PROVIDERS, required: true },
    bounceType: { type: String, enum: ['hard', 'soft'] },
    raw: { type: Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

emailEventSchema.index({ messageId: 1 });
emailEventSchema.index({ enrollmentId: 1 });
// TTL: auto-delete events after 365 days
emailEventSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

export default mongoose.model<IEmailEventDoc>('EmailEvent', emailEventSchema);
```

- [ ] **Step 4: Extend `backend/src/models/Lead.ts`**

Add two fields to `ILead` interface (after the `notes` line):
```typescript
suppressedAt?: Date;
suppressReason?: string;
```

Add to the Mongoose schema (after the `notes` field definition):
```typescript
suppressedAt: { type: Date },
suppressReason: { type: String },
```

- [ ] **Step 5: Type-check backend**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/backend && npx tsc --noEmit 2>&1 | tail -15
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add backend/src/models/Sequence.ts backend/src/models/SequenceEnrollment.ts backend/src/models/EmailEvent.ts backend/src/models/Lead.ts
git commit -m "feat(models): Sequence, SequenceEnrollment, EmailEvent models; extend Lead with suppressedAt"
```

---

### Task 3: Suppression API

**Files:**
- Create: `backend/src/controllers/suppression.controller.ts`
- Create: `backend/src/routes/suppression.routes.ts`

Note: The `SuppressionEntry` model already exists at `backend/src/models/SuppressionList.ts` with fields `workspaceId`, `email?`, `domain?`, `reason`, `addedAt`, `addedBy`. No model changes needed.

- [ ] **Step 1: Create `backend/src/controllers/suppression.controller.ts`**

```typescript
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { SuppressionEntry } from '../models/SuppressionList.js';
import { ApiError } from '../utils/ApiError.js';

const VALID_REASONS = ['unsubscribe', 'bounce', 'manual', 'competitor'] as const;
type SuppressionReason = (typeof VALID_REASONS)[number];

export async function listSuppression(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '50'), 10) || 50));

  const [entries, total] = await Promise.all([
    SuppressionEntry.find({ workspaceId }).sort({ addedAt: -1 }).skip((page - 1) * limit).limit(limit),
    SuppressionEntry.countDocuments({ workspaceId }),
  ]);
  res.json({ success: true, data: { data: entries, total, page, limit } });
}

export async function addSuppression(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { workspaceId } = req.params;
  const { email, domain, reason } = req.body as { email?: string; domain?: string; reason?: string };

  if (!email && !domain) throw ApiError.badRequest('email or domain is required');
  if (!reason || !VALID_REASONS.includes(reason as SuppressionReason)) {
    throw ApiError.badRequest(`reason must be one of: ${VALID_REASONS.join(', ')}`);
  }

  const existing = await SuppressionEntry.findOne({
    workspaceId,
    ...(email ? { email: email.toLowerCase().trim() } : { domain: domain!.toLowerCase().trim() }),
  });
  if (existing) {
    res.status(200).json({ success: true, data: existing });
    return;
  }

  const entry = await SuppressionEntry.create({
    workspaceId,
    email: email ? email.toLowerCase().trim() : undefined,
    domain: domain ? domain.toLowerCase().trim() : undefined,
    reason,
    addedAt: new Date(),
    addedBy: req.user._id,
  });
  res.status(201).json({ success: true, data: entry });
}

export async function removeSuppression(req: Request, res: Response): Promise<void> {
  const { workspaceId, suppressionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(suppressionId!)) throw ApiError.badRequest('Invalid suppressionId');

  const result = await SuppressionEntry.deleteOne({ _id: suppressionId, workspaceId });
  if (result.deletedCount === 0) throw ApiError.notFound('Suppression entry not found');
  res.json({ success: true });
}

export async function checkSuppression(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== 'string') throw ApiError.badRequest('email is required');

  const normalizedEmail = email.toLowerCase().trim();
  const domain = normalizedEmail.split('@')[1] ?? '';

  const entry = await SuppressionEntry.findOne({
    workspaceId,
    $or: [{ email: normalizedEmail }, { domain }],
  });

  res.json({
    success: true,
    data: {
      suppressed: !!entry,
      reason: entry?.reason ?? null,
    },
  });
}
```

- [ ] **Step 2: Create `backend/src/routes/suppression.routes.ts`**

```typescript
import { Router, type Router as RouterType } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as suppressionController from '../controllers/suppression.controller.js';

const router: RouterType = Router({ mergeParams: true });

router.use(authenticate);

router.get('/', authorize(['owner', 'admin']), asyncHandler(suppressionController.listSuppression));
router.post('/', authorize(['owner', 'admin']), asyncHandler(suppressionController.addSuppression));
router.delete('/:suppressionId', authorize(['owner', 'admin']), asyncHandler(suppressionController.removeSuppression));
router.post('/check', authorize(['owner', 'admin', 'member']), asyncHandler(suppressionController.checkSuppression));

export default router;
```

- [ ] **Step 3: Mount in `backend/src/app.ts`**

Add import:
```typescript
import suppressionRouter from './routes/suppression.routes.js';
```

Add mount (after the crm routes):
```typescript
app.use('/api/v1/workspaces/:workspaceId/suppression', suppressionRouter);
```

- [ ] **Step 4: Type-check backend**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/backend && npx tsc --noEmit 2>&1 | tail -10
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add backend/src/controllers/suppression.controller.ts backend/src/routes/suppression.routes.ts backend/src/app.ts
git commit -m "feat(api): suppression list CRUD — list, add, remove, check endpoints"
```

---

### Task 4: Sequences API (CRUD + Enroll/Pause/Resume)

**Files:**
- Create: `backend/src/controllers/sequences.controller.ts`
- Create: `backend/src/routes/sequences.routes.ts`
- Modify: `backend/src/services/queue/queues.ts`

- [ ] **Step 1: Add `getSequenceStepQueue` to `backend/src/services/queue/queues.ts`**

Add after the existing queue singletons:

```typescript
let _sequenceStepQueue: Queue | null = null;

export function getSequenceStepQueue(): Queue {
  if (!_sequenceStepQueue) {
    _sequenceStepQueue = new Queue('sequence-step', {
      connection: getRedis(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 2000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    });
  }
  return _sequenceStepQueue;
}
```

- [ ] **Step 2: Create `backend/src/controllers/sequences.controller.ts`**

```typescript
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Sequence from '../models/Sequence.js';
import SequenceEnrollment from '../models/SequenceEnrollment.js';
import Lead from '../models/Lead.js';
import { SuppressionEntry } from '../models/SuppressionList.js';
import { ApiError } from '../utils/ApiError.js';
import { logAudit } from '../services/audit.js';

const VALID_SEQUENCE_STATUSES = ['draft', 'active', 'paused', 'archived'] as const;

export async function listSequences(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10) || 20));
  const status = req.query['status'] as string | undefined;

  if (status && !VALID_SEQUENCE_STATUSES.includes(status as typeof VALID_SEQUENCE_STATUSES[number])) {
    throw ApiError.badRequest(`status must be one of: ${VALID_SEQUENCE_STATUSES.join(', ')}`);
  }

  const filter: Record<string, unknown> = { workspaceId };
  if (status) filter['status'] = status;

  const [sequences, total] = await Promise.all([
    Sequence.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Sequence.countDocuments(filter),
  ]);
  res.json({ success: true, data: { data: sequences, total, page, limit } });
}

export async function createSequence(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { workspaceId } = req.params;
  const { name, description, steps, stopRules, tags } = req.body as {
    name?: string;
    description?: string;
    steps?: unknown[];
    stopRules?: unknown[];
    tags?: string[];
  };

  if (!name || typeof name !== 'string' || !name.trim()) throw ApiError.badRequest('name is required');
  if (name.trim().length > 200) throw ApiError.badRequest('name must be 200 characters or fewer');

  const sequence = await Sequence.create({
    workspaceId,
    createdBy: req.user._id,
    name: name.trim(),
    description,
    steps: steps ?? [],
    stopRules: stopRules ?? [
      { trigger: 'any_reply', action: 'stop_sequence' },
      { trigger: 'unsubscribe', action: 'stop_sequence' },
      { trigger: 'bounce', action: 'stop_sequence' },
    ],
    tags: tags ?? [],
  });

  logAudit({ req, workspaceId: workspaceId!, action: 'sequence.create', resourceType: 'sequence', resourceId: sequence._id, metadata: { name: sequence.name } });

  res.status(201).json({ success: true, data: sequence });
}

export async function getSequence(req: Request, res: Response): Promise<void> {
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const sequence = await Sequence.findOne({ _id: sequenceId, workspaceId });
  if (!sequence) throw ApiError.notFound('Sequence not found');
  res.json({ success: true, data: sequence });
}

export async function updateSequence(req: Request, res: Response): Promise<void> {
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const { name, description, steps, stopRules, status, tags } = req.body as {
    name?: string;
    description?: string;
    steps?: unknown[];
    stopRules?: unknown[];
    status?: string;
    tags?: string[];
  };

  const setFields: Record<string, unknown> = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) throw ApiError.badRequest('name must be non-empty');
    setFields['name'] = name.trim();
  }
  if (description !== undefined) setFields['description'] = description;
  if (steps !== undefined) setFields['steps'] = steps;
  if (stopRules !== undefined) setFields['stopRules'] = stopRules;
  if (status !== undefined) {
    if (!VALID_SEQUENCE_STATUSES.includes(status as typeof VALID_SEQUENCE_STATUSES[number])) {
      throw ApiError.badRequest(`status must be one of: ${VALID_SEQUENCE_STATUSES.join(', ')}`);
    }
    setFields['status'] = status;
  }
  if (tags !== undefined) setFields['tags'] = tags;

  if (Object.keys(setFields).length === 0) throw ApiError.badRequest('No valid fields to update');

  const sequence = await Sequence.findOneAndUpdate(
    { _id: sequenceId, workspaceId },
    { $set: setFields },
    { new: true, runValidators: true },
  );
  if (!sequence) throw ApiError.notFound('Sequence not found');
  res.json({ success: true, data: sequence });
}

export async function archiveSequence(req: Request, res: Response): Promise<void> {
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const sequence = await Sequence.findOneAndUpdate(
    { _id: sequenceId, workspaceId },
    { $set: { status: 'archived' } },
    { new: true },
  );
  if (!sequence) throw ApiError.notFound('Sequence not found');

  // Pause all active enrollments
  await SequenceEnrollment.updateMany(
    { sequenceId, status: 'active' },
    { $set: { status: 'paused', stopReason: 'sequence_archived' } },
  );

  logAudit({ req, workspaceId: workspaceId!, action: 'sequence.archive', resourceType: 'sequence', resourceId: sequence._id, metadata: {} });
  res.json({ success: true, data: sequence });
}

export async function enrollLeads(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const { leadIds, contactId } = req.body as { leadIds?: unknown; contactId?: string };

  if (!Array.isArray(leadIds) || leadIds.length === 0) throw ApiError.badRequest('leadIds must be a non-empty array');
  if (leadIds.length > 200) throw ApiError.badRequest('Cannot enroll more than 200 leads at once');
  for (const id of leadIds) {
    if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) throw ApiError.badRequest(`Invalid leadId: ${String(id)}`);
  }

  const sequence = await Sequence.findOne({ _id: sequenceId, workspaceId });
  if (!sequence) throw ApiError.notFound('Sequence not found');
  if (sequence.status === 'archived') throw ApiError.badRequest('Cannot enroll into an archived sequence');
  if (sequence.steps.length === 0) throw ApiError.badRequest('Sequence has no steps');

  const step1 = sequence.steps.find(s => s.stepNumber === 1);
  if (!step1) throw ApiError.badRequest('Sequence must have a step 1');

  const leadObjectIds = leadIds.map((id) => new mongoose.Types.ObjectId(id as string));

  // Validate all leads belong to this workspace
  const matchCount = await Lead.countDocuments({ _id: { $in: leadObjectIds }, workspaceId });
  if (matchCount !== leadObjectIds.length) throw ApiError.badRequest('One or more leads do not belong to this workspace');

  // Check suppression for leads with emails
  const leads = await Lead.find({ _id: { $in: leadObjectIds } }).select('emails');
  const suppressedEmailSet = new Set<string>();
  const allEmails = leads.flatMap(l => l.emails.map(e => e.address.toLowerCase()));
  if (allEmails.length > 0) {
    const suppressedEntries = await SuppressionEntry.find({
      workspaceId,
      $or: [
        { email: { $in: allEmails } },
        { domain: { $in: allEmails.map(e => e.split('@')[1]).filter(Boolean) } },
      ],
    }).select('email domain');

    for (const entry of suppressedEntries) {
      if (entry.email) suppressedEmailSet.add(entry.email);
    }
  }

  const now = new Date();
  const nextStepAt = new Date(now.getTime() + step1.delayDays * 86_400_000);
  const userId = req.user._id;

  let enrolled = 0;
  let skipped = 0;

  for (const leadId of leadObjectIds) {
    // Skip if already enrolled (unique index on sequenceId+leadId)
    const alreadyEnrolled = await SequenceEnrollment.exists({ sequenceId, leadId });
    if (alreadyEnrolled) { skipped++; continue; }

    const lead = leads.find(l => l._id.toString() === leadId.toString());
    const primaryEmail = lead?.emails[0]?.address.toLowerCase();
    if (primaryEmail && suppressedEmailSet.has(primaryEmail)) { skipped++; continue; }

    await SequenceEnrollment.create({
      workspaceId,
      sequenceId,
      leadId,
      contactId: contactId && mongoose.Types.ObjectId.isValid(contactId) ? new mongoose.Types.ObjectId(contactId) : undefined,
      enrolledBy: userId,
      status: 'active',
      currentStep: 1,
      nextStepAt,
    });
    enrolled++;
  }

  // Update sequence stats
  await Sequence.updateOne({ _id: sequenceId }, { $inc: { 'stats.totalEnrolled': enrolled, 'stats.active': enrolled } });

  res.json({ success: true, data: { enrolled, skipped } });
}

export async function pauseSequence(req: Request, res: Response): Promise<void> {
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const sequence = await Sequence.findOne({ _id: sequenceId, workspaceId });
  if (!sequence) throw ApiError.notFound('Sequence not found');

  await Sequence.updateOne({ _id: sequenceId }, { $set: { status: 'paused' } });
  await SequenceEnrollment.updateMany({ sequenceId, status: 'active' }, { $set: { status: 'paused' } });

  res.json({ success: true });
}

export async function resumeSequence(req: Request, res: Response): Promise<void> {
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const sequence = await Sequence.findOne({ _id: sequenceId, workspaceId });
  if (!sequence) throw ApiError.notFound('Sequence not found');

  await Sequence.updateOne({ _id: sequenceId }, { $set: { status: 'active' } });
  // Resume paused enrollments — set nextStepAt to now so scheduler picks them up promptly
  await SequenceEnrollment.updateMany(
    { sequenceId, status: 'paused' },
    { $set: { status: 'active', nextStepAt: new Date() } },
  );

  res.json({ success: true });
}

export async function getSequenceStats(req: Request, res: Response): Promise<void> {
  const { workspaceId, sequenceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sequenceId!)) throw ApiError.badRequest('Invalid sequenceId');

  const sequence = await Sequence.findOne({ _id: sequenceId, workspaceId }).select('stats steps name');
  if (!sequence) throw ApiError.notFound('Sequence not found');

  // Per-step delivery stats from enrollment step histories
  const perStep = await SequenceEnrollment.aggregate([
    { $match: { sequenceId: new mongoose.Types.ObjectId(sequenceId) } },
    { $unwind: '$stepHistory' },
    {
      $group: {
        _id: '$stepHistory.stepNumber',
        sent: { $sum: { $cond: [{ $in: ['$stepHistory.status', ['sent', 'delivered', 'opened', 'clicked', 'replied']] }, 1, 0] } },
        opened: { $sum: { $cond: [{ $eq: ['$stepHistory.openedAt', null] }, 0, 1] } },
        replied: { $sum: { $cond: [{ $eq: ['$stepHistory.repliedAt', null] }, 0, 1] } },
        bounced: { $sum: { $cond: [{ $eq: ['$stepHistory.status', 'bounced'] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({ success: true, data: { summary: sequence.stats, perStep } });
}
```

- [ ] **Step 3: Create `backend/src/routes/sequences.routes.ts`**

```typescript
import { Router, type Router as RouterType } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as sequencesController from '../controllers/sequences.controller.js';

const router: RouterType = Router({ mergeParams: true });

router.use(authenticate);

router.get('/', authorize(['owner', 'admin', 'member']), asyncHandler(sequencesController.listSequences));
router.post('/', authorize(['owner', 'admin']), asyncHandler(sequencesController.createSequence));
router.get('/:sequenceId', authorize(['owner', 'admin', 'member']), asyncHandler(sequencesController.getSequence));
router.patch('/:sequenceId', authorize(['owner', 'admin']), asyncHandler(sequencesController.updateSequence));
router.delete('/:sequenceId', authorize(['owner', 'admin']), asyncHandler(sequencesController.archiveSequence));
router.post('/:sequenceId/enroll', authorize(['owner', 'admin', 'member']), asyncHandler(sequencesController.enrollLeads));
router.post('/:sequenceId/pause', authorize(['owner', 'admin']), asyncHandler(sequencesController.pauseSequence));
router.post('/:sequenceId/resume', authorize(['owner', 'admin']), asyncHandler(sequencesController.resumeSequence));
router.get('/:sequenceId/stats', authorize(['owner', 'admin', 'member']), asyncHandler(sequencesController.getSequenceStats));

export default router;
```

- [ ] **Step 4: Mount in `backend/src/app.ts`**

Add import:
```typescript
import sequencesRouter from './routes/sequences.routes.js';
```

Add mount:
```typescript
app.use('/api/v1/workspaces/:workspaceId/sequences', sequencesRouter);
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/backend && npx tsc --noEmit 2>&1 | tail -10
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add backend/src/controllers/sequences.controller.ts backend/src/routes/sequences.routes.ts backend/src/services/queue/queues.ts backend/src/app.ts
git commit -m "feat(api): sequences CRUD + enroll/pause/resume/stats endpoints"
```

---

### Task 5: Enrollments API

**Files:**
- Create: `backend/src/controllers/enrollments.controller.ts`
- Create: `backend/src/routes/enrollments.routes.ts`

- [ ] **Step 1: Create `backend/src/controllers/enrollments.controller.ts`**

```typescript
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import SequenceEnrollment from '../models/SequenceEnrollment.js';
import Sequence from '../models/Sequence.js';
import { ApiError } from '../utils/ApiError.js';

const VALID_ENROLLMENT_STATUSES = ['active', 'paused', 'completed', 'stopped', 'bounced', 'unsubscribed', 'replied'] as const;

export async function listEnrollments(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10) || 20));

  const filter: Record<string, unknown> = { workspaceId };

  const sequenceId = req.query['sequenceId'] as string | undefined;
  if (sequenceId) {
    if (!mongoose.Types.ObjectId.isValid(sequenceId)) throw ApiError.badRequest('Invalid sequenceId');
    filter['sequenceId'] = new mongoose.Types.ObjectId(sequenceId);
  }

  const status = req.query['status'] as string | undefined;
  if (status) {
    if (!VALID_ENROLLMENT_STATUSES.includes(status as typeof VALID_ENROLLMENT_STATUSES[number])) {
      throw ApiError.badRequest(`status must be one of: ${VALID_ENROLLMENT_STATUSES.join(', ')}`);
    }
    filter['status'] = status;
  }

  const leadId = req.query['leadId'] as string | undefined;
  if (leadId) {
    if (!mongoose.Types.ObjectId.isValid(leadId)) throw ApiError.badRequest('Invalid leadId');
    filter['leadId'] = new mongoose.Types.ObjectId(leadId);
  }

  const [enrollments, total] = await Promise.all([
    SequenceEnrollment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('leadId', 'companyName companyDomain'),
    SequenceEnrollment.countDocuments(filter),
  ]);
  res.json({ success: true, data: { data: enrollments, total, page, limit } });
}

export async function getEnrollment(req: Request, res: Response): Promise<void> {
  const { workspaceId, enrollmentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(enrollmentId!)) throw ApiError.badRequest('Invalid enrollmentId');

  const enrollment = await SequenceEnrollment.findOne({ _id: enrollmentId, workspaceId })
    .populate('leadId', 'companyName companyDomain emails')
    .populate('sequenceId', 'name steps');
  if (!enrollment) throw ApiError.notFound('Enrollment not found');
  res.json({ success: true, data: enrollment });
}

export async function pauseEnrollment(req: Request, res: Response): Promise<void> {
  const { workspaceId, enrollmentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(enrollmentId!)) throw ApiError.badRequest('Invalid enrollmentId');

  const enrollment = await SequenceEnrollment.findOneAndUpdate(
    { _id: enrollmentId, workspaceId, status: 'active' },
    { $set: { status: 'paused' } },
    { new: true },
  );
  if (!enrollment) throw ApiError.notFound('Active enrollment not found');
  res.json({ success: true, data: enrollment });
}

export async function resumeEnrollment(req: Request, res: Response): Promise<void> {
  const { workspaceId, enrollmentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(enrollmentId!)) throw ApiError.badRequest('Invalid enrollmentId');

  const enrollment = await SequenceEnrollment.findOneAndUpdate(
    { _id: enrollmentId, workspaceId, status: 'paused' },
    { $set: { status: 'active', nextStepAt: new Date() } },
    { new: true },
  );
  if (!enrollment) throw ApiError.notFound('Paused enrollment not found');
  res.json({ success: true, data: enrollment });
}

export async function stopEnrollment(req: Request, res: Response): Promise<void> {
  const { workspaceId, enrollmentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(enrollmentId!)) throw ApiError.badRequest('Invalid enrollmentId');

  const { reason } = req.body as { reason?: string };

  const enrollment = await SequenceEnrollment.findOneAndUpdate(
    { _id: enrollmentId, workspaceId, status: { $in: ['active', 'paused'] } },
    { $set: { status: 'stopped', stopReason: reason ?? 'manual', completedAt: new Date() } },
    { new: true },
  );
  if (!enrollment) throw ApiError.notFound('Active or paused enrollment not found');

  await Sequence.updateOne({ _id: enrollment.sequenceId }, { $inc: { 'stats.active': -1 } });
  res.json({ success: true, data: enrollment });
}
```

- [ ] **Step 2: Create `backend/src/routes/enrollments.routes.ts`**

```typescript
import { Router, type Router as RouterType } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as enrollmentsController from '../controllers/enrollments.controller.js';

const router: RouterType = Router({ mergeParams: true });

router.use(authenticate);
router.use(authorize(['owner', 'admin', 'member']));

router.get('/', asyncHandler(enrollmentsController.listEnrollments));
router.get('/:enrollmentId', asyncHandler(enrollmentsController.getEnrollment));
router.post('/:enrollmentId/pause', asyncHandler(enrollmentsController.pauseEnrollment));
router.post('/:enrollmentId/resume', asyncHandler(enrollmentsController.resumeEnrollment));
router.post('/:enrollmentId/stop', asyncHandler(enrollmentsController.stopEnrollment));

export default router;
```

- [ ] **Step 3: Mount in `backend/src/app.ts`**

Add import:
```typescript
import enrollmentsRouter from './routes/enrollments.routes.js';
```

Add mount (after sequences):
```typescript
app.use('/api/v1/workspaces/:workspaceId/enrollments', enrollmentsRouter);
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/backend && npx tsc --noEmit 2>&1 | tail -10
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add backend/src/controllers/enrollments.controller.ts backend/src/routes/enrollments.routes.ts backend/src/app.ts
git commit -m "feat(api): enrollments list, detail, pause, resume, stop endpoints"
```

---

### Task 6: Env Vars + Unsubscribe Service + Email Footer

**Files:**
- Modify: `backend/src/config/env.ts`
- Create: `backend/src/services/unsubscribe.ts`
- Modify: `backend/src/services/email/emailService.ts`

- [ ] **Step 1: Add env vars to `backend/src/config/env.ts`**

Add these fields to the `envSchema` object (before the closing `}`):
```typescript
RESEND_WEBHOOK_SECRET: z.string().optional(),
SENDGRID_WEBHOOK_SECRET: z.string().optional(),
UNSUBSCRIBE_BASE_URL: z.string().url().default('http://localhost:4000/unsubscribe'),
UNSUBSCRIBE_TOKEN_SECRET: z.string().min(16).optional(),
SEQUENCE_MAX_SENDS_PER_MINUTE: z.coerce.number().int().min(1).default(50),
```

- [ ] **Step 2: Create `backend/src/services/unsubscribe.ts`**

```typescript
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

interface UnsubscribePayload {
  wid: string;
  email: string;
}

export function signUnsubscribeToken(workspaceId: string, email: string): string {
  const secret = env.UNSUBSCRIBE_TOKEN_SECRET ?? env.JWT_SECRET;
  return jwt.sign(
    { wid: workspaceId, email: email.toLowerCase() },
    secret,
    { expiresIn: '30d' },
  );
}

export function verifyUnsubscribeToken(token: string): UnsubscribePayload {
  const secret = env.UNSUBSCRIBE_TOKEN_SECRET ?? env.JWT_SECRET;
  const payload = jwt.verify(token, secret) as UnsubscribePayload;
  if (!payload.wid || !payload.email) throw new Error('Invalid unsubscribe token');
  return payload;
}

export function buildUnsubscribeUrl(workspaceId: string, email: string): string {
  const token = signUnsubscribeToken(workspaceId, email);
  return `${env.UNSUBSCRIBE_BASE_URL}?t=${token}`;
}
```

- [ ] **Step 3: Update `backend/src/services/email/emailService.ts`**

Add `unsubscribeUrl?: string` to `SendEmailOptions`:

```typescript
export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  unsubscribeUrl?: string;
}
```

Add a helper function before `sendEmailForWorkspace`:

```typescript
function injectUnsubscribe(opts: SendEmailOptions): SendEmailOptions & { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  let { html, text } = opts;

  if (opts.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${opts.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';

    const footerHtml = `<br><br><hr style="border:none;border-top:1px solid #eee;margin:24px 0"><p style="font-size:11px;color:#999;font-family:sans-serif">You received this email because you are in our prospecting database. <a href="${opts.unsubscribeUrl}" style="color:#999">Unsubscribe</a></p>`;
    const footerText = `\n\n---\nTo unsubscribe: ${opts.unsubscribeUrl}`;

    html = html + footerHtml;
    if (text) text = text + footerText;
  }

  return { ...opts, html, text, headers };
}
```

Then update each provider branch in `sendEmailForWorkspace` to pass the `headers`. Replace the function body with:

```typescript
export async function sendEmailForWorkspace(
  config: IEmailConfig & { apiKey?: string; smtpPass?: string },
  opts: SendEmailOptions,
): Promise<SendEmailResult> {
  const { headers, ...enrichedOpts } = injectUnsubscribe(opts);

  if (config.provider === 'resend') {
    if (!config.apiKey) throw new Error('Resend API key not configured for this workspace');
    const apiKey = decrypt(config.apiKey);
    const resend = new Resend(apiKey);
    const from = `${config.fromName} <${config.fromEmail}>`;
    const { data, error } = await resend.emails.send({
      from,
      to: enrichedOpts.to,
      subject: enrichedOpts.subject,
      html: enrichedOpts.html,
      text: enrichedOpts.text,
      ...(config.replyTo ? { replyTo: config.replyTo } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });
    if (error || !data) {
      logger.error('[emailService] Resend error', { error });
      throw new Error(error?.message ?? 'Resend: failed to send email');
    }
    return { messageId: data.id };
  }

  if (config.provider === 'sendgrid') {
    if (!config.apiKey) throw new Error('SendGrid API key not configured for this workspace');
    const apiKey = decrypt(config.apiKey);
    const transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: { user: 'apikey', pass: apiKey },
    });
    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: enrichedOpts.to,
      subject: enrichedOpts.subject,
      html: enrichedOpts.html,
      text: enrichedOpts.text,
      ...(config.replyTo ? { replyTo: config.replyTo } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });
    return { messageId: String(info.messageId) };
  }

  if (config.provider === 'smtp') {
    if (!config.smtpHost) throw new Error('SMTP host not configured for this workspace');
    const pass = config.smtpPass ? decrypt(config.smtpPass) : undefined;
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort ?? 587,
      secure: config.smtpSecure ?? false,
      auth: config.smtpUser ? { user: config.smtpUser, pass } : undefined,
    });
    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: enrichedOpts.to,
      subject: enrichedOpts.subject,
      html: enrichedOpts.html,
      text: enrichedOpts.text,
      ...(config.replyTo ? { replyTo: config.replyTo } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });
    return { messageId: String(info.messageId) };
  }

  throw new Error(`Unsupported email provider: ${String(config.provider)}`);
}
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/backend && npx tsc --noEmit 2>&1 | tail -10
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add backend/src/config/env.ts backend/src/services/unsubscribe.ts backend/src/services/email/emailService.ts
git commit -m "feat(email): List-Unsubscribe header + footer injection; unsubscribe token service"
```

---

### Task 7: Webhook Infrastructure (HMAC + Controller + EmailEvent Service)

**Files:**
- Modify: `backend/src/app.ts` — add rawBody to express.json verify
- Create: `backend/src/middleware/webhookHmac.ts`
- Create: `backend/src/services/emailEvent.service.ts`
- Create: `backend/src/controllers/webhooks.controller.ts`
- Create: `backend/src/routes/webhooks.routes.ts`

- [ ] **Step 1: Update `backend/src/app.ts` — add rawBody capture**

Find this line:
```typescript
app.use(express.json({ limit: '1mb' }));
```

Replace with:
```typescript
app.use(express.json({
  limit: '1mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));
```

- [ ] **Step 2: Extend Express Request type in `backend/src/middleware/authenticate.ts`**

The existing `declare global` block already extends `Request`. Add `rawBody?: Buffer` to it:

```typescript
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      rawBody?: Buffer;
    }
  }
}
```

- [ ] **Step 3: Create `backend/src/middleware/webhookHmac.ts`**

```typescript
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function webhookHmac(provider: 'resend' | 'sendgrid') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const secret = provider === 'resend' ? env.RESEND_WEBHOOK_SECRET : env.SENDGRID_WEBHOOK_SECRET;

    if (!secret) {
      // Webhook secret not configured — allow through (useful in development)
      next();
      return;
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      next(ApiError.badRequest('Missing raw body for HMAC verification'));
      return;
    }

    // Resend uses svix-signature header; SendGrid uses x-twilio-email-event-webhook-signature
    const sigHeader = (req.headers['svix-signature'] as string | undefined)
      ?? (req.headers['x-twilio-email-event-webhook-signature'] as string | undefined);

    if (!sigHeader) {
      next(ApiError.unauthorized('Missing webhook signature header'));
      return;
    }

    // Extract raw signature bytes (strip "v1," prefix used by Svix)
    const sigValue = sigHeader.replace(/^v1,/, '').split(' ')[0] ?? '';

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    try {
      const expectedBuf = Buffer.from(expected, 'hex');
      const providedBuf = Buffer.from(sigValue, 'hex');
      if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
        next(ApiError.unauthorized('Invalid webhook signature'));
        return;
      }
    } catch {
      next(ApiError.unauthorized('Invalid webhook signature'));
      return;
    }

    next();
  };
}
```

- [ ] **Step 4: Create `backend/src/services/emailEvent.service.ts`**

```typescript
import mongoose from 'mongoose';
import EmailEvent from '../models/EmailEvent.js';
import SequenceEnrollment from '../models/SequenceEnrollment.js';
import Sequence from '../models/Sequence.js';
import Lead from '../models/Lead.js';
import { SuppressionEntry } from '../models/SuppressionList.js';
import { logger } from '../utils/logger.js';

interface NormalizedEvent {
  workspaceId?: string;
  messageId: string;
  event: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'replied' | 'unsubscribed';
  provider: 'resend' | 'sendgrid';
  bounceType?: 'hard' | 'soft';
  occurredAt: Date;
  raw: Record<string, unknown>;
  recipientEmail?: string;
}

function normalizeResend(payload: Record<string, unknown>): NormalizedEvent | null {
  const type = payload['type'] as string | undefined;
  const data = payload['data'] as Record<string, unknown> | undefined;
  if (!data) return null;

  const emailId = data['email_id'] as string | undefined;
  const to = (data['to'] as string[] | undefined)?.[0];

  const eventMap: Record<string, NormalizedEvent['event']> = {
    'email.delivered': 'delivered',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
  };

  const event = type ? eventMap[type] : undefined;
  if (!event || !emailId) return null;

  const isSoftBounce = typeof data['bounce_type'] === 'string' && (data['bounce_type'] as string).toLowerCase() === 'soft';

  return {
    messageId: emailId,
    event,
    provider: 'resend',
    bounceType: event === 'bounced' ? (isSoftBounce ? 'soft' : 'hard') : undefined,
    occurredAt: new Date((data['created_at'] as string | undefined) ?? Date.now()),
    raw: payload,
    recipientEmail: to,
  };
}

function normalizeSendGrid(payload: Record<string, unknown>): NormalizedEvent | null {
  const sgEvent = payload['event'] as string | undefined;
  const messageId = (payload['smtp-id'] as string | undefined) ?? (payload['sg_message_id'] as string | undefined);
  if (!sgEvent || !messageId) return null;

  const eventMap: Record<string, NormalizedEvent['event']> = {
    delivered: 'delivered',
    open: 'opened',
    click: 'clicked',
    bounce: 'bounced',
    spamreport: 'complained',
    unsubscribe: 'unsubscribed',
  };
  const event = eventMap[sgEvent];
  if (!event) return null;

  const type = payload['type'] as string | undefined;
  return {
    messageId: messageId.split('.')[0] ?? messageId,
    event,
    provider: 'sendgrid',
    bounceType: event === 'bounced' ? (type === 'bounce' ? 'hard' : 'soft') : undefined,
    occurredAt: new Date((payload['timestamp'] as number | undefined ?? Date.now()) * 1000),
    raw: payload,
    recipientEmail: payload['email'] as string | undefined,
  };
}

async function applyStopRules(
  enrollment: Awaited<ReturnType<typeof SequenceEnrollment.findOne>>,
  event: NormalizedEvent['event'],
): Promise<boolean> {
  if (!enrollment) return false;
  const sequence = await Sequence.findById(enrollment.sequenceId).select('stopRules stats');
  if (!sequence) return false;

  for (const rule of sequence.stopRules) {
    const triggered =
      (rule.trigger === 'any_reply' && event === 'replied') ||
      (rule.trigger === 'unsubscribe' && event === 'unsubscribed') ||
      (rule.trigger === 'bounce' && event === 'bounced');

    if (triggered && rule.action === 'stop_sequence') {
      await SequenceEnrollment.updateOne(
        { _id: enrollment._id },
        { $set: { status: 'stopped', stopReason: rule.trigger, completedAt: new Date() } },
      );
      await Sequence.updateOne({ _id: sequence._id }, { $inc: { 'stats.active': -1 } });
      return true;
    }
  }
  return false;
}

export async function processEmailEvent(
  provider: 'resend' | 'sendgrid',
  rawPayload: Record<string, unknown>,
): Promise<void> {
  const normalized = provider === 'resend'
    ? normalizeResend(rawPayload)
    : normalizeSendGrid(rawPayload);

  if (!normalized) {
    logger.warn('[emailEvent] Could not normalize event', { provider, type: rawPayload['type'] ?? rawPayload['event'] });
    return;
  }

  // Find enrollment by messageId in step history
  const enrollment = await SequenceEnrollment.findOne({
    'stepHistory.messageId': normalized.messageId,
  });

  // Save event record
  await EmailEvent.create({
    workspaceId: enrollment?.workspaceId,
    enrollmentId: enrollment?._id,
    messageId: normalized.messageId,
    event: normalized.event,
    provider: normalized.provider,
    bounceType: normalized.bounceType,
    raw: normalized.raw,
    occurredAt: normalized.occurredAt,
  });

  if (!enrollment) {
    logger.info('[emailEvent] No enrollment found for messageId', { messageId: normalized.messageId });
    return;
  }

  const stepIndex = enrollment.stepHistory.findIndex(s => s.messageId === normalized.messageId);
  const historyUpdate: Record<string, unknown> = {};

  switch (normalized.event) {
    case 'delivered':
      historyUpdate[`stepHistory.${stepIndex}.deliveredAt`] = normalized.occurredAt;
      historyUpdate[`stepHistory.${stepIndex}.status`] = 'delivered';
      break;
    case 'opened':
      historyUpdate[`stepHistory.${stepIndex}.openedAt`] = normalized.occurredAt;
      historyUpdate[`stepHistory.${stepIndex}.status`] = 'opened';
      break;
    case 'clicked':
      historyUpdate[`stepHistory.${stepIndex}.clickedAt`] = normalized.occurredAt;
      historyUpdate[`stepHistory.${stepIndex}.status`] = 'clicked';
      break;
    case 'replied':
      historyUpdate[`stepHistory.${stepIndex}.repliedAt`] = normalized.occurredAt;
      historyUpdate[`stepHistory.${stepIndex}.status`] = 'replied';
      await SequenceEnrollment.updateOne({ _id: enrollment._id }, { $set: { status: 'replied' } });
      await Sequence.updateOne(
        { _id: enrollment.sequenceId },
        { $inc: { 'stats.replied': 1, 'stats.active': -1 } },
      );
      await applyStopRules(enrollment, 'replied');
      break;
    case 'bounced': {
      historyUpdate[`stepHistory.${stepIndex}.bouncedAt`] = normalized.occurredAt;
      historyUpdate[`stepHistory.${stepIndex}.status`] = 'bounced';
      historyUpdate[`stepHistory.${stepIndex}.bounceType`] = normalized.bounceType;

      if (normalized.bounceType === 'hard' || normalized.event === 'complained') {
        // Hard bounce: suppress email + stop enrollment + update lead
        if (normalized.recipientEmail) {
          const workspaceId = enrollment.workspaceId.toString();
          await SuppressionEntry.updateOne(
            { workspaceId, email: normalized.recipientEmail.toLowerCase() },
            { $setOnInsert: { workspaceId, email: normalized.recipientEmail.toLowerCase(), reason: 'bounce', addedAt: new Date() } },
            { upsert: true },
          );
          await Lead.updateOne(
            { _id: enrollment.leadId },
            { $set: { outreachStatus: 'bounced', suppressedAt: new Date(), suppressReason: 'hard_bounce' } },
          );
        }
        await SequenceEnrollment.updateOne(
          { _id: enrollment._id },
          { $set: { status: 'bounced', stopReason: 'hard_bounce', completedAt: new Date() } },
        );
        await Sequence.updateOne(
          { _id: enrollment.sequenceId },
          { $inc: { 'stats.bounced': 1, 'stats.active': -1 } },
        );
      }
      break;
    }
    case 'complained':
      // Treat like hard bounce
      if (normalized.recipientEmail) {
        const workspaceId = enrollment.workspaceId.toString();
        await SuppressionEntry.updateOne(
          { workspaceId, email: normalized.recipientEmail.toLowerCase() },
          { $setOnInsert: { workspaceId, email: normalized.recipientEmail.toLowerCase(), reason: 'bounce', addedAt: new Date() } },
          { upsert: true },
        );
        await Lead.updateOne({ _id: enrollment.leadId }, { $set: { outreachStatus: 'bounced', suppressedAt: new Date(), suppressReason: 'spam_complaint' } });
      }
      await SequenceEnrollment.updateOne(
        { _id: enrollment._id },
        { $set: { status: 'stopped', stopReason: 'spam_complaint', completedAt: new Date() } },
      );
      await Sequence.updateOne({ _id: enrollment.sequenceId }, { $inc: { 'stats.active': -1 } });
      break;
    case 'unsubscribed':
      await SequenceEnrollment.updateOne(
        { _id: enrollment._id },
        { $set: { status: 'unsubscribed', stopReason: 'unsubscribe', completedAt: new Date() } },
      );
      await Sequence.updateOne(
        { _id: enrollment.sequenceId },
        { $inc: { 'stats.unsubscribed': 1, 'stats.active': -1 } },
      );
      break;
  }

  if (Object.keys(historyUpdate).length > 0 && stepIndex >= 0) {
    await SequenceEnrollment.updateOne({ _id: enrollment._id }, { $set: historyUpdate });
  }
}
```

- [ ] **Step 5: Create `backend/src/controllers/webhooks.controller.ts`**

```typescript
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { processEmailEvent } from '../services/emailEvent.service.js';
import { verifyUnsubscribeToken } from '../services/unsubscribe.js';
import { SuppressionEntry } from '../models/SuppressionList.js';
import Lead from '../models/Lead.js';
import SequenceEnrollment from '../models/SequenceEnrollment.js';
import Sequence from '../models/Sequence.js';
import { logger } from '../utils/logger.js';

export async function handleResendWebhook(req: Request, res: Response): Promise<void> {
  // Respond 200 immediately — processing is async but we do it synchronously here for simplicity
  try {
    const payload = req.body as Record<string, unknown>;
    await processEmailEvent('resend', payload);
  } catch (err) {
    logger.error('[webhooks] Resend processing error', { err });
  }
  res.status(200).json({ received: true });
}

export async function handleSendGridWebhook(req: Request, res: Response): Promise<void> {
  // SendGrid sends an array of events
  const events = Array.isArray(req.body) ? req.body as Record<string, unknown>[] : [req.body as Record<string, unknown>];
  for (const event of events) {
    try {
      await processEmailEvent('sendgrid', event);
    } catch (err) {
      logger.error('[webhooks] SendGrid processing error', { err });
    }
  }
  res.status(200).json({ received: true });
}

export async function handleUnsubscribe(req: Request, res: Response): Promise<void> {
  const { t } = req.query as { t?: string };

  if (!t) {
    res.status(400).send('<h1>Invalid unsubscribe link</h1><p>No token provided.</p>');
    return;
  }

  try {
    const { wid, email } = verifyUnsubscribeToken(t);

    if (!mongoose.Types.ObjectId.isValid(wid)) {
      res.status(400).send('<h1>Invalid unsubscribe link</h1>');
      return;
    }

    // Add to suppression list
    await SuppressionEntry.updateOne(
      { workspaceId: wid, email: email.toLowerCase() },
      { $setOnInsert: { workspaceId: wid, email: email.toLowerCase(), reason: 'unsubscribe', addedAt: new Date() } },
      { upsert: true },
    );

    // Update lead outreachStatus
    await Lead.updateMany(
      { workspaceId: wid, 'emails.address': email.toLowerCase() },
      { $set: { outreachStatus: 'unsubscribed', suppressedAt: new Date(), suppressReason: 'unsubscribed' } },
    );

    // Stop all active enrollments for this email/workspace
    const leadsToStop = await Lead.find({ workspaceId: wid, 'emails.address': email.toLowerCase() }).select('_id');
    const leadIds = leadsToStop.map(l => l._id);
    if (leadIds.length > 0) {
      const enrollments = await SequenceEnrollment.find({
        workspaceId: wid,
        leadId: { $in: leadIds },
        status: 'active',
      }).select('_id sequenceId');

      for (const enrollment of enrollments) {
        await SequenceEnrollment.updateOne(
          { _id: enrollment._id },
          { $set: { status: 'unsubscribed', stopReason: 'unsubscribe', completedAt: new Date() } },
        );
        await Sequence.updateOne({ _id: enrollment.sequenceId }, { $inc: { 'stats.unsubscribed': 1, 'stats.active': -1 } });
      }
    }

    res.status(200).send(`<!DOCTYPE html><html><head><title>Unsubscribed</title></head><body style="font-family:sans-serif;max-width:500px;margin:80px auto;text-align:center"><h1>You've been unsubscribed</h1><p>You will no longer receive emails from this sender.</p></body></html>`);
  } catch (err) {
    logger.error('[webhooks] Unsubscribe error', { err });
    res.status(400).send('<h1>Invalid or expired unsubscribe link.</h1>');
  }
}
```

- [ ] **Step 6: Create `backend/src/routes/webhooks.routes.ts`**

```typescript
import { Router, type Router as RouterType } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { webhookHmac } from '../middleware/webhookHmac.js';
import * as webhooksController from '../controllers/webhooks.controller.js';

const router: RouterType = Router();

// Webhook routes: public (HMAC-verified) — no authenticate middleware
router.post('/resend', webhookHmac('resend'), asyncHandler(webhooksController.handleResendWebhook));
router.post('/sendgrid', webhookHmac('sendgrid'), asyncHandler(webhooksController.handleSendGridWebhook));

export default router;
```

- [ ] **Step 7: Mount webhook routes + unsubscribe route in `backend/src/app.ts`**

Add imports:
```typescript
import webhooksRouter from './routes/webhooks.routes.js';
import { handleUnsubscribe } from './controllers/webhooks.controller.js';
import { asyncHandler } from './utils/asyncHandler.js';
```

Add mounts (before `app.use(errorHandler)`):
```typescript
app.use('/webhooks', webhooksRouter);
app.get('/unsubscribe', asyncHandler(handleUnsubscribe));
```

- [ ] **Step 8: Type-check**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/backend && npx tsc --noEmit 2>&1 | tail -15
```

Expected: zero errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add backend/src/app.ts backend/src/middleware/webhookHmac.ts backend/src/middleware/authenticate.ts backend/src/services/emailEvent.service.ts backend/src/controllers/webhooks.controller.ts backend/src/routes/webhooks.routes.ts
git commit -m "feat(webhooks): HMAC middleware, Resend/SendGrid event ingestion, unsubscribe handler"
```

---

### Task 8: Worker Services — Template Renderer + Send Window Checker

**Files:**
- Create: `workers/src/services/templateRenderer.ts`
- Create: `workers/src/services/sendWindowChecker.ts`

- [ ] **Step 1: Create `workers/src/services/templateRenderer.ts`**

```typescript
interface LeadData {
  companyName: string;
  companyDomain?: string;
  industry?: string;
  website?: string;
  address?: { city?: string; country?: string };
}

interface ContactData {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  title?: string;
}

const VARIABLE_RESOLVERS: Record<string, (lead: LeadData, contact?: ContactData) => string> = {
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

export function renderTemplate(template: string, lead: LeadData, contact?: ContactData): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const resolver = VARIABLE_RESOLVERS[key];
    return resolver ? resolver(lead, contact) : '';
  });
}
```

- [ ] **Step 2: Create `workers/src/services/sendWindowChecker.ts`**

```typescript
export interface SendWindow {
  startHour: number;   // 0-23
  endHour: number;     // 0-23, exclusive (endHour=17 means last send at 16:xx)
  timezone: string;    // IANA timezone, e.g. "Africa/Lagos"
  allowedDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
}

function getHourInTz(date: Date, tz: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).format(date);
  const val = parseInt(formatted.replace(/\D/g, ''), 10);
  // Intl may return "24" for midnight in some locales
  return val === 24 ? 0 : val;
}

function getDayOfWeekInTz(date: Date, tz: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(date);
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return days[formatted] ?? new Date().getDay();
}

/**
 * Returns `from` if it's already within the send window, otherwise advances
 * (in 1-hour increments) to the next valid hour. Safety cap: 14 days.
 */
export function nextSendTime(sw: SendWindow, from: Date = new Date()): Date {
  const dt = new Date(from);

  for (let i = 0; i < 14 * 24; i++) {
    const hour = getHourInTz(dt, sw.timezone);
    const dow = getDayOfWeekInTz(dt, sw.timezone);

    if (sw.allowedDays.includes(dow) && hour >= sw.startHour && hour < sw.endHour) {
      return dt;
    }
    // Advance by 1 hour
    dt.setTime(dt.getTime() + 3_600_000);
  }

  // Fallback: return as-is if no valid window found in 14 days
  return from;
}

export function isWithinSendWindow(sw: SendWindow, now: Date = new Date()): boolean {
  const hour = getHourInTz(now, sw.timezone);
  const dow = getDayOfWeekInTz(now, sw.timezone);
  return sw.allowedDays.includes(dow) && hour >= sw.startHour && hour < sw.endHour;
}
```

- [ ] **Step 3: Type-check workers**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | tail -10
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add workers/src/services/templateRenderer.ts workers/src/services/sendWindowChecker.ts
git commit -m "feat(workers): templateRenderer ({{variable}} interpolation) + sendWindowChecker"
```

---

### Task 9: Sequence Step Worker

**Files:**
- Modify: `workers/src/config/env.ts`
- Create: `workers/src/sequence.worker.ts`

- [ ] **Step 1: Add env vars to `workers/src/config/env.ts`**

Add these fields to `envSchema` (before closing `}`):
```typescript
JWT_SECRET: z.string().min(32),
UNSUBSCRIBE_BASE_URL: z.string().url().default('http://localhost:4000/unsubscribe'),
UNSUBSCRIBE_TOKEN_SECRET: z.string().optional(),
SEQUENCE_SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(10000).default(60000),
```

Change JWT_SECRET from `optional()` to `min(32)` — the sequence worker requires it to generate unsubscribe tokens.

- [ ] **Step 2: Install jsonwebtoken in workers package (if not already present)**

```bash
grep '"jsonwebtoken"' /Users/Apple/Desktop/personal-projects/leadreai/workers/package.json
```

If missing:
```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/workers && pnpm add jsonwebtoken && pnpm add -D @types/jsonwebtoken
```

- [ ] **Step 3: Create `workers/src/sequence.worker.ts`**

This worker processes `sequence-step` BullMQ jobs. It uses inline Mongoose schemas since workers cannot import from the backend package.

```typescript
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose, { Schema } from 'mongoose';
import { createHmac, scryptSync, createDecipheriv } from 'crypto';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
import { renderTemplate } from './services/templateRenderer.js';
import { isWithinSendWindow, nextSendTime, type SendWindow } from './services/sendWindowChecker.js';

export interface SequenceStepPayload {
  enrollmentId: string;
  stepNumber: number;
}

const QUEUE_PREFIX = `{bull}:leadreai:${env.NODE_ENV}`;

// ─── Inline decrypt (mirrors backend/src/utils/encrypt.ts) ───────────────────
function decryptValue(ciphertext: string): string {
  const key = scryptSync(env.JWT_SECRET, 'leadreai-salt', 32);
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ─── Inline unsubscribe token generation ─────────────────────────────────────
function buildUnsubscribeUrl(workspaceId: string, email: string): string {
  const secret = env.UNSUBSCRIBE_TOKEN_SECRET ?? env.JWT_SECRET;
  const token = jwt.sign({ wid: workspaceId, email: email.toLowerCase() }, secret, { expiresIn: '30d' });
  return `${env.UNSUBSCRIBE_BASE_URL}?t=${token}`;
}

// ─── Inline Mongoose models (minimal field sets) ──────────────────────────────

// Workspace — only emailConfig needed
const workspaceSchema = new Schema({
  emailConfig: {
    provider: String,
    fromEmail: String,
    fromName: String,
    replyTo: String,
    apiKey: { type: String, select: false },
    smtpHost: String,
    smtpPort: Number,
    smtpSecure: Boolean,
    smtpUser: String,
    smtpPass: { type: String, select: false },
  },
}, { strict: false });

const WorkspaceModel = mongoose.models['WS_SEQ'] as mongoose.Model<any> ??
  mongoose.model('WS_SEQ', workspaceSchema, 'workspaces');

// Lead — companyName, industry, address, website, companyDomain, emails
const leadSchema = new Schema({
  companyName: String,
  companyDomain: String,
  industry: String,
  website: String,
  address: { city: String, country: String },
  emails: [{ address: String, type: String }],
}, { strict: false });

const LeadModel = mongoose.models['LEAD_SEQ'] as mongoose.Model<any> ??
  mongoose.model('LEAD_SEQ', leadSchema, 'leads');

// Contact — firstName, lastName, fullName, title
const contactSchema = new Schema({
  firstName: String,
  lastName: String,
  fullName: String,
  title: String,
}, { strict: false });

const ContactModel = mongoose.models['CONTACT_SEQ'] as mongoose.Model<any> ??
  mongoose.model('CONTACT_SEQ', contactSchema, 'contacts');

// SequenceEnrollment — full shape needed for state machine updates
const enrollmentSchema = new Schema({
  workspaceId: Schema.Types.ObjectId,
  sequenceId: Schema.Types.ObjectId,
  leadId: Schema.Types.ObjectId,
  contactId: Schema.Types.ObjectId,
  status: String,
  currentStep: Number,
  nextStepAt: Date,
  completedAt: Date,
  stopReason: String,
  stepHistory: [{
    stepNumber: Number,
    sentAt: Date,
    status: String,
    messageId: String,
    errorMessage: String,
    toEmail: String,
    _id: false,
  }],
}, { strict: false, timestamps: true });

const EnrollmentModel = mongoose.models['ENROLLMENT_SEQ'] as mongoose.Model<any> ??
  mongoose.model('ENROLLMENT_SEQ', enrollmentSchema, 'sequenceenrollments');

// Sequence — steps and stopRules
const sequenceSchema = new Schema({
  workspaceId: Schema.Types.ObjectId,
  status: String,
  steps: [{ stepNumber: Number, channel: String, delayDays: Number, sendWindow: Schema.Types.Mixed, emailTemplate: Schema.Types.Mixed, _id: false }],
  stopRules: [{ trigger: String, action: String, _id: false }],
}, { strict: false });

const SequenceModel = mongoose.models['SEQ_MODEL'] as mongoose.Model<any> ??
  mongoose.model('SEQ_MODEL', sequenceSchema, 'sequences');

// SuppressionEntry — email + domain
const suppressionSchema = new Schema({ workspaceId: Schema.Types.ObjectId, email: String, domain: String }, { strict: false });
const SuppressionModel = mongoose.models['SUPPRESSION_SEQ'] as mongoose.Model<any> ??
  mongoose.model('SUPPRESSION_SEQ', suppressionSchema, 'suppressionentries');

// ─── Email send helper ────────────────────────────────────────────────────────
async function sendEmail(
  emailConfig: Record<string, any>,
  to: string,
  subject: string,
  body: string,
  unsubscribeUrl: string,
): Promise<string> {
  const footerHtml = `<br><br><hr style="border:none;border-top:1px solid #eee;margin:24px 0"><p style="font-size:11px;color:#999;font-family:sans-serif">To unsubscribe: <a href="${unsubscribeUrl}">${unsubscribeUrl}</a></p>`;
  const footerText = `\n\n---\nTo unsubscribe: ${unsubscribeUrl}`;
  const htmlBody = `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#333">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>${footerHtml}`;
  const textBody = body + footerText;
  const headers = { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };

  if (emailConfig.provider === 'resend') {
    const apiKey = decryptValue(emailConfig.apiKey);
    const resend = new Resend(apiKey);
    const from = `${emailConfig.fromName as string} <${emailConfig.fromEmail as string}>`;
    const { data, error } = await resend.emails.send({ from, to, subject, html: htmlBody, text: textBody, headers });
    if (error || !data) throw new Error(error?.message ?? 'Resend send failed');
    return data.id;
  }

  const smtpConfig =
    emailConfig.provider === 'sendgrid'
      ? { host: 'smtp.sendgrid.net', port: 587, auth: { user: 'apikey', pass: decryptValue(emailConfig.apiKey) } }
      : {
          host: emailConfig.smtpHost as string,
          port: (emailConfig.smtpPort as number) ?? 587,
          secure: (emailConfig.smtpSecure as boolean) ?? false,
          auth: emailConfig.smtpUser ? { user: emailConfig.smtpUser as string, pass: decryptValue(emailConfig.smtpPass) } : undefined,
        };

  const transporter = nodemailer.createTransport(smtpConfig);
  const info = await transporter.sendMail({
    from: `"${emailConfig.fromName as string}" <${emailConfig.fromEmail as string}>`,
    to,
    subject,
    html: htmlBody,
    text: textBody,
    headers,
  });
  return String(info.messageId);
}

// ─── Main job processor ───────────────────────────────────────────────────────
async function processSequenceStep(job: Job<SequenceStepPayload>): Promise<void> {
  const { enrollmentId, stepNumber } = job.data;
  const tag = `[sequence.worker:${enrollmentId}:step${stepNumber}]`;

  const enrollment = await EnrollmentModel.findById(enrollmentId);
  if (!enrollment) { logger.warn(`${tag} enrollment not found`); return; }
  if (enrollment.status !== 'active') { logger.info(`${tag} enrollment not active (${String(enrollment.status)}), skipping`); return; }
  if (enrollment.currentStep !== stepNumber) { logger.info(`${tag} step mismatch (current=${String(enrollment.currentStep)})`); return; }

  const sequence = await SequenceModel.findById(enrollment.sequenceId);
  if (!sequence || sequence.status === 'archived') { logger.warn(`${tag} sequence not found or archived`); return; }

  const step = (sequence.steps as any[]).find((s: any) => s.stepNumber === stepNumber);
  if (!step) { logger.warn(`${tag} step definition not found`); return; }

  // Only email steps supported in this implementation
  if (step.channel !== 'email' || !step.emailTemplate) {
    logger.info(`${tag} non-email step or no template, marking completed`);
    await advanceOrComplete(enrollment, sequence, step, null, null);
    return;
  }

  const lead = await LeadModel.findById(enrollment.leadId);
  if (!lead) { logger.warn(`${tag} lead not found`); return; }

  const toEmail = (lead.emails as any[])[0]?.address as string | undefined;
  if (!toEmail) { logger.warn(`${tag} lead has no email`); return; }

  // Check suppression
  const domain = toEmail.split('@')[1] ?? '';
  const suppressed = await SuppressionModel.findOne({
    workspaceId: enrollment.workspaceId,
    $or: [{ email: toEmail.toLowerCase() }, { domain }],
  });
  if (suppressed) {
    logger.info(`${tag} email suppressed, skipping step`);
    const histEntry = { stepNumber, status: 'skipped', toEmail };
    await EnrollmentModel.updateOne({ _id: enrollmentId }, { $push: { stepHistory: histEntry } });
    await advanceOrComplete(enrollment, sequence, step, null, null);
    return;
  }

  // Check send window
  if (step.sendWindow) {
    const sw = step.sendWindow as SendWindow;
    if (!isWithinSendWindow(sw, new Date())) {
      const nextTime = nextSendTime(sw, new Date());
      logger.info(`${tag} outside send window, rescheduling to ${nextTime.toISOString()}`);
      await EnrollmentModel.updateOne({ _id: enrollmentId }, { $set: { nextStepAt: nextTime } });
      return; // Scheduler will re-dispatch
    }
  }

  // Load workspace for email config
  const workspace = await WorkspaceModel.findById(enrollment.workspaceId).select('+emailConfig.apiKey +emailConfig.smtpPass');
  if (!workspace?.emailConfig) {
    logger.error(`${tag} workspace has no email config`);
    return;
  }

  // Render template
  const contact = enrollment.contactId ? await ContactModel.findById(enrollment.contactId) : null;
  const subject = renderTemplate(step.emailTemplate.subject as string, lead, contact ?? undefined);
  const body = renderTemplate(step.emailTemplate.body as string, lead, contact ?? undefined);

  // Build unsubscribe URL
  const unsubscribeUrl = buildUnsubscribeUrl(enrollment.workspaceId.toString(), toEmail);

  // Send
  let messageId: string | null = null;
  let errorMessage: string | undefined;

  try {
    messageId = await sendEmail(workspace.emailConfig, toEmail, subject, body, unsubscribeUrl);
    logger.info(`${tag} sent successfully`, { messageId, to: toEmail });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`${tag} send failed`, { err });
  }

  // Record step history
  const histEntry = {
    stepNumber,
    sentAt: messageId ? new Date() : undefined,
    status: messageId ? 'sent' : 'failed',
    messageId: messageId ?? undefined,
    errorMessage,
    toEmail,
  };

  await EnrollmentModel.updateOne({ _id: enrollmentId }, { $push: { stepHistory: histEntry } });

  // Update lead outreachStatus to 'sent' on first successful send
  if (messageId && stepNumber === 1) {
    const LeadFullModel = mongoose.models['leads'] ?? mongoose.model('leads', new Schema({}, { strict: false }), 'leads');
    await LeadFullModel.updateOne({ _id: enrollment.leadId }, { $set: { outreachStatus: 'sent' } });
  }

  if (messageId) {
    await advanceOrComplete(enrollment, sequence, step, new Date(), messageId);
  }
}

async function advanceOrComplete(
  enrollment: any,
  sequence: any,
  currentStep: any,
  sentAt: Date | null,
  messageId: string | null,
): Promise<void> {
  const steps = sequence.steps as any[];
  const nextStep = steps.find((s: any) => s.stepNumber === currentStep.stepNumber + 1);

  if (!nextStep) {
    await EnrollmentModel.updateOne(
      { _id: enrollment._id },
      { $set: { status: 'completed', completedAt: new Date() } },
    );
    return;
  }

  const base = sentAt ?? new Date();
  const nextStepAt = new Date(base.getTime() + nextStep.delayDays * 86_400_000);

  await EnrollmentModel.updateOne(
    { _id: enrollment._id },
    { $set: { currentStep: nextStep.stepNumber, nextStepAt } },
  );
}

// ─── Worker factory ───────────────────────────────────────────────────────────
export function createSequenceWorker(connection: Redis): Worker {
  if (mongoose.connection.readyState === 0) {
    mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME }).catch(err =>
      logger.error('Sequence worker Mongo connect error', { err }),
    );
  }

  const worker = new Worker<SequenceStepPayload>(
    'sequence-step',
    async (job) => { await processSequenceStep(job); },
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
      prefix: QUEUE_PREFIX,
    },
  );

  worker.on('completed', (job) => logger.info('sequence.worker: job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('sequence.worker: job failed', { jobId: job?.id, err }));

  return worker;
}
```

- [ ] **Step 4: Type-check workers**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | tail -15
```

Fix any errors before committing.

- [ ] **Step 5: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add workers/src/sequence.worker.ts workers/src/config/env.ts workers/package.json
git commit -m "feat(workers): sequence step BullMQ worker — sends emails, respects suppression + send windows"
```

---

### Task 10: Sequence Scheduler + Wire Everything

**Files:**
- Create: `workers/src/sequenceScheduler.ts`
- Modify: `workers/src/index.ts`

- [ ] **Step 1: Create `workers/src/sequenceScheduler.ts`**

```typescript
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose, { Schema } from 'mongoose';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
import type { SequenceStepPayload } from './sequence.worker.js';

const QUEUE_PREFIX = `{bull}:leadreai:${env.NODE_ENV}`;
const SCHEDULER_BATCH_SIZE = 200;

// Inline minimal SequenceEnrollment schema for scheduler
const enrollmentSchema = new Schema({
  workspaceId: Schema.Types.ObjectId,
  sequenceId: Schema.Types.ObjectId,
  status: String,
  currentStep: Number,
  nextStepAt: Date,
}, { strict: false });

const EnrollmentModel = mongoose.models['ENROLLMENT_SCHED'] as mongoose.Model<any> ??
  mongoose.model('ENROLLMENT_SCHED', enrollmentSchema, 'sequenceenrollments');

export function startSequenceScheduler(connection: Redis): NodeJS.Timeout {
  const queue = new Queue<SequenceStepPayload>('sequence-step', {
    connection,
    prefix: QUEUE_PREFIX,
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 2000 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
    },
  });

  async function tick(): Promise<void> {
    const now = new Date();
    try {
      const dueEnrollments = await EnrollmentModel.find({
        status: 'active',
        nextStepAt: { $lte: now },
      })
        .limit(SCHEDULER_BATCH_SIZE)
        .select('_id currentStep')
        .lean();

      if (dueEnrollments.length === 0) return;

      logger.info(`[scheduler] Found ${dueEnrollments.length} due enrollments`);

      const jobs = dueEnrollments.map((e: any) => ({
        name: 'step' as const,
        data: { enrollmentId: String(e._id), stepNumber: e.currentStep as number },
        opts: {
          jobId: `step-${String(e._id)}-${e.currentStep as number}`, // idempotent
        },
      }));

      await queue.addBulk(jobs);
    } catch (err) {
      logger.error('[scheduler] Tick error', { err });
    }
  }

  const intervalMs = env.SEQUENCE_SCHEDULER_INTERVAL_MS;
  logger.info(`[scheduler] Starting sequence scheduler (interval: ${intervalMs}ms)`);

  // Run immediately then on interval
  void tick();
  return setInterval(() => { void tick(); }, intervalMs);
}
```

- [ ] **Step 2: Update `workers/src/index.ts`**

Add imports at the top:
```typescript
import { createSequenceWorker } from './sequence.worker.js';
import { startSequenceScheduler } from './sequenceScheduler.js';
```

After the existing Redis connections, add:
```typescript
const sequenceConn = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
sequenceConn.on('error', (err) => logger.error('Sequence Redis error', { err }));

const schedulerConn = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
schedulerConn.on('error', (err) => logger.error('Scheduler Redis error', { err }));
```

After existing worker creations:
```typescript
const sequenceWorker = createSequenceWorker(sequenceConn);
logger.info('Sequence worker ready', { concurrency: env.WORKER_CONCURRENCY });

const schedulerTimer = startSequenceScheduler(schedulerConn);
logger.info('Sequence scheduler started');
```

Update the shutdown function to also close sequence resources. Replace the existing `Promise.all` shutdown line with:
```typescript
clearInterval(schedulerTimer);
await Promise.all([
  prospectingWorker.close(),
  outreachWorker.close(),
  contactWorker.close(),
  hubspotWorker.close(),
  sequenceWorker.close(),
]);
await publisher.quit();
await Promise.all([
  prospectingConn.quit(),
  outreachConn.quit(),
  contactConn.quit(),
  hubspotConn.quit(),
  sequenceConn.quit(),
  schedulerConn.quit(),
]);
```

- [ ] **Step 3: Type-check workers**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/workers && npx tsc --noEmit 2>&1 | tail -15
```

Expected: zero errors.

- [ ] **Step 4: Type-check backend (final pass)**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/backend && npx tsc --noEmit 2>&1 | tail -15
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
git add workers/src/sequenceScheduler.ts workers/src/index.ts
git commit -m "feat(workers): sequence scheduler cron + register sequence worker in bootstrap"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Sequence CRUD | Task 4 |
| Enroll leads into sequence | Task 4 (enrollLeads) |
| Pause / resume sequence | Task 4 |
| Per-step stats | Task 4 (getSequenceStats) |
| Enrollment list + actions | Task 5 |
| Suppression list CRUD + check | Task 3 |
| Resend webhook ingestion | Task 7 |
| SendGrid webhook ingestion | Task 7 |
| Bounce → suppress + stop enrollment | Task 7 (emailEvent.service) |
| Reply → stop enrollment | Task 7 (emailEvent.service) |
| Unsubscribe token + handler | Task 6 + Task 7 |
| List-Unsubscribe header + footer | Task 6 |
| Template rendering | Task 8 |
| Send window checks | Task 8 + Task 9 |
| Sequence step BullMQ worker | Task 9 |
| Scheduler cron (60s) | Task 10 |
| Register workers | Task 10 |
| Shared types + constants | Task 1 |
| Mongoose models | Task 2 |
| Lead model: suppressedAt | Task 2 |
| OUTREACH_STATUSES: unsubscribed | Task 1 |

**Placeholder scan:** All code blocks are complete. No "TBD" or "handle error" comments.

**Type consistency:**
- `SequenceStepPayload` defined in `sequence.worker.ts`, imported by `sequenceScheduler.ts` ✅
- `SendWindow` interface defined in `sendWindowChecker.ts`, used in worker as the same shape ✅
- Inline model names (`WS_SEQ`, `LEAD_SEQ`, `CONTACT_SEQ`, `ENROLLMENT_SEQ`, `SEQ_MODEL`, `SUPPRESSION_SEQ`) use unique model registration names to avoid conflicts with other workers ✅
- `QUEUE_PREFIX` constant inlined in workers (cannot import backend) — matches backend's `{bull}:leadreai:${env.NODE_ENV}` ✅
- All `ApiError` calls in controllers match existing patterns ✅

**Known limitations (acceptable for Phase 2A):**
- IMAP reply polling not implemented (optional per spec, can be Phase 2B+)
- No per-step rate limiting (SEQUENCE_MAX_SENDS_PER_MINUTE env var reserved but not enforced — scheduler batch size of 200 is a soft cap)
- Resend/SendGrid HMAC uses simplified `sha256(body)` — for production, use Svix SDK or SendGrid's ECDSA; documented as known gap
- Sequence builder frontend deferred to Phase 2B
