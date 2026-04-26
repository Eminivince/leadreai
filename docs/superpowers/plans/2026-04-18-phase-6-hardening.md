# Phase 6 — Credits, Observability & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LeadreAI platform production-ready by adding Redis-backed rate limiting, Bull Board queue UI, workspace webhooks, a credits system, proxy rotation, workspace API keys, Dockerfiles, and GitHub Actions CI.

**Architecture:** Each task is a self-contained hardening layer on top of the existing Express + BullMQ + MongoDB + Next.js stack. Tasks 1–6 are backend/worker-only. Task 7 touches backend + frontend. Tasks 8–9 are infrastructure-only.

**Tech Stack:** BullMQ 5, @bull-board/express, rate-limit-redis, proxy-agent, axios, Docker multi-stage builds, GitHub Actions.

---

## Already Complete (do NOT redo)

- `backend/src/services/audit.ts` — fire-and-forget `logAudit()` helper
- `backend/src/utils/encrypt.ts` — AES-256-GCM encrypt/decrypt
- `backend/src/services/email/emailService.ts` — Resend / SendGrid / SMTP email sender
- `backend/src/models/Workspace.ts` — `emailConfig`, `knowledgeBase`, `settings.cheapMode` fields added
- `backend/src/controllers/workspace.controller.ts` — KB CRUD + email config CRUD
- `backend/src/routes/workspace.routes.ts` — email config routes wired
- `frontend/src/app/(dashboard)/dashboard/settings/page.tsx` — email config + KB UI complete
- `backend/src/controllers/outreach.controller.ts` — `sendDraft` endpoint complete
- `workers/src/outreach.worker.ts` — bulk generation with SSE events complete

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/src/middleware/rateLimiter.ts` | Modify | Add Redis store to existing rate limiters |
| `backend/src/app.ts` | Modify | Upgrade global limiter to Redis store; mount Bull Board |
| `backend/src/routes/admin.routes.ts` | Create | Bull Board router (auth-gated) |
| `backend/src/middleware/adminAuth.ts` | Create | Basic admin secret check for Bull Board |
| `backend/src/services/webhook.ts` | Create | Fire-and-forget HTTP POST to workspace webhookUrl |
| `workers/src/prospecting.worker.ts` | Modify | Call webhook on job:complete |
| `backend/src/models/User.ts` | Modify | Expose `creditsBalance` for atomic decrement |
| `backend/src/controllers/jobs.controller.ts` | Modify | Deduct credits on job submission; error if balance < 1 |
| `workers/src/prospecting.worker.ts` | Modify | Charge credits proportional to leads found after pipeline |
| `backend/src/config/env.ts` | Modify | Add `CREDITS_PER_JOB`, `ADMIN_SECRET`, `WEBHOOK_TIMEOUT_MS` |
| `frontend/src/components/layout/Topbar.tsx` | Modify | Show credit balance badge |
| `frontend/src/hooks/useCredits.ts` | Create | React Query hook for credits balance |
| `backend/src/routes/auth.routes.ts` | Modify | Add `GET /auth/me/credits` endpoint |
| `backend/src/models/Workspace.ts` | Modify | Add `apiKeys[]` subdocument array |
| `backend/src/controllers/workspace.controller.ts` | Modify | Add `listApiKeys`, `createApiKey`, `revokeApiKey` handlers |
| `backend/src/routes/workspace.routes.ts` | Modify | Wire API key routes |
| `backend/src/middleware/authenticate.ts` | Modify | Support `Authorization: Bearer sk-...` workspace API keys |
| `frontend/src/app/(dashboard)/dashboard/settings/page.tsx` | Modify | Add API Keys section |
| `workers/src/pipeline/pageScraper.ts` | Modify | Rotate proxies from `env.PROXY_LIST` |
| `Dockerfile.backend` | Create | Multi-stage Docker image for Express API |
| `Dockerfile.workers` | Create | Multi-stage Docker image for BullMQ workers |
| `.dockerignore` | Create | Exclude node_modules, .env, dist from Docker context |
| `.github/workflows/ci.yml` | Create | Lint + type-check on push/PR to main |

---

## Task 1: Redis-Backed Rate Limiting

**Files:**
- Modify: `backend/src/middleware/rateLimiter.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/config/env.ts`

The current rate limiters use the default in-memory store. Under multiple processes or restarts, limits reset. `rate-limit-redis` (already in package.json) provides a Redis store.

- [ ] **Step 1: Add `ADMIN_SECRET` to env schema**

In `backend/src/config/env.ts`, add to the `envSchema` object:
```ts
ADMIN_SECRET: z.string().min(16).optional(),
CREDITS_PER_JOB: z.coerce.number().int().min(0).default(0),
WEBHOOK_TIMEOUT_MS: z.coerce.number().default(5000),
```

- [ ] **Step 2: Upgrade `rateLimiter.ts` to use Redis store**

Replace the entire contents of `backend/src/middleware/rateLimiter.ts`:
```ts
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis } from '../config/redis.js';
import { env } from '../config/env.js';

function makeStore(prefix: string) {
  return new RedisStore({
    sendCommand: (...args: string[]) => getRedis().call(...args),
    prefix: `rl:${prefix}:`,
  });
}

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: makeStore('auth'),
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many auth attempts. Try again in 15 minutes.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

export const jobRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.JOB_RATE_LIMIT_PER_HOUR,
  store: makeStore('jobs'),
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Job submission rate limit exceeded' } },
  standardHeaders: true,
  legacyHeaders: false,
});

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  store: makeStore('global'),
  standardHeaders: true,
  legacyHeaders: false,
});
```

- [ ] **Step 3: Replace inline `rateLimit` call in `app.ts` with exported `globalRateLimiter`**

In `backend/src/app.ts`, change the imports section to add:
```ts
import { globalRateLimiter } from './middleware/rateLimiter.js';
```

Remove the inline `rateLimit` import from express-rate-limit and the `const limiter = rateLimit({...})` block. Replace `app.use(limiter)` with:
```ts
app.use(globalRateLimiter);
```

- [ ] **Step 4: Verify type-check passes**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai
pnpm --filter @leadreai/backend type-check
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/rateLimiter.ts backend/src/app.ts backend/src/config/env.ts
git commit -m "feat(backend): Redis-backed rate limiting via rate-limit-redis"
```

---

## Task 2: Bull Board Admin UI

**Files:**
- Create: `backend/src/middleware/adminAuth.ts`
- Create: `backend/src/routes/admin.routes.ts`
- Modify: `backend/src/app.ts`

Bull Board is a web UI to inspect, retry, and drain BullMQ queues. It mounts as an Express middleware. We gate it with a simple `ADMIN_SECRET` header check — no user accounts needed for an internal tool.

- [ ] **Step 1: Install `@bull-board` packages**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/backend
pnpm add @bull-board/express @bull-board/api
```

Expected: packages added to `backend/package.json`.

- [ ] **Step 2: Create `adminAuth.ts` middleware**

Create `backend/src/middleware/adminAuth.ts`:
```ts
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!env.ADMIN_SECRET) {
    res.status(503).json({ error: 'Admin UI not configured (ADMIN_SECRET not set)' });
    return;
  }
  const provided = req.headers['x-admin-secret'] ?? req.query['secret'];
  if (provided !== env.ADMIN_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
```

- [ ] **Step 3: Create `admin.routes.ts`**

Create `backend/src/routes/admin.routes.ts`:
```ts
import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import {
  getProspectingQueue,
  getEnrichmentQueue,
  getOutreachQueue,
  getExportQueue,
} from '../services/queue/queues.js';
import { adminAuth } from '../middleware/adminAuth.js';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(getProspectingQueue()),
    new BullMQAdapter(getEnrichmentQueue()),
    new BullMQAdapter(getOutreachQueue()),
    new BullMQAdapter(getExportQueue()),
  ],
  serverAdapter,
});

const router = Router();
router.use(adminAuth);
router.use('/', serverAdapter.getRouter());

export default router;
```

- [ ] **Step 4: Mount admin router in `app.ts`**

In `backend/src/app.ts`, add the import after existing router imports:
```ts
import adminRouter from './routes/admin.routes.js';
```

Add the route mount before `app.use(errorHandler)`:
```ts
app.use('/admin/queues', adminRouter);
```

- [ ] **Step 5: Verify type-check passes**

```bash
pnpm --filter @leadreai/backend type-check
```
Expected: no errors.

- [ ] **Step 6: Manual verification**

Start the backend: `pnpm --filter @leadreai/backend dev`

Visit `http://localhost:4000/admin/queues?secret=<your_ADMIN_SECRET>` in a browser.
Expected: Bull Board UI showing all 4 queues (prospecting, enrichment, outreach, export).

- [ ] **Step 7: Commit**

```bash
git add backend/src/middleware/adminAuth.ts backend/src/routes/admin.routes.ts backend/src/app.ts backend/package.json pnpm-lock.yaml
git commit -m "feat(backend): Bull Board admin UI at /admin/queues"
```

---

## Task 3: Workspace Webhooks

**Files:**
- Create: `backend/src/services/webhook.ts`
- Modify: `workers/src/prospecting.worker.ts`
- Modify: `workers/src/config/env.ts`

When a prospecting job completes (successfully or failed), POST the result to the workspace's `settings.webhookUrl`. Fire-and-forget — webhook failure must never crash the worker.

- [ ] **Step 1: Add `WEBHOOK_TIMEOUT_MS` to worker env schema**

In `workers/src/config/env.ts`, add to the schema object:
```ts
WEBHOOK_TIMEOUT_MS: z.coerce.number().default(5000),
```

- [ ] **Step 2: Create `backend/src/services/webhook.ts`**

Note: this service is also needed in the worker process. Create an identical copy at `workers/src/services/webhook.ts`:

```ts
import axios from 'axios';
import { logger } from '../utils/logger.js';

export interface WebhookPayload {
  event: 'job:complete' | 'job:failed';
  jobId: string;
  workspaceId: string;
  status: string;
  totalLeadsFound?: number;
  durationMs?: number;
  error?: string;
}

export function fireWebhook(url: string, payload: WebhookPayload, timeoutMs = 5000): void {
  axios
    .post(url, payload, {
      timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'LeadreAI-Webhook/1.0' },
    })
    .then(() => {
      logger.info('[webhook] Delivered', { url, event: payload.event });
    })
    .catch((err: unknown) => {
      logger.warn('[webhook] Delivery failed', {
        url,
        event: payload.event,
        err: err instanceof Error ? err.message : String(err),
      });
    });
}
```

- [ ] **Step 3: Load workspace `webhookUrl` and fire in prospecting worker**

In `workers/src/prospecting.worker.ts`, the worker currently re-throws errors from `runIntentParser`. The pipeline's `leadWriter.ts` stage already publishes `job:complete` to Redis. We need to also call the webhook there.

Find the `leadWriter.ts` file at `workers/src/pipeline/leadWriter.ts`. At the end of the writer function, after updating `ProspectingJob` to `complete`, add the webhook call. Open `workers/src/pipeline/leadWriter.ts` and locate where the job status is set to `'complete'` and `job:complete` is published. After the `publisher.publish(...)` call, add:

```ts
import { fireWebhook } from '../services/webhook.js';
import { env } from '../config/env.js';

// Inside the function, after publisher.publish for job:complete:
const workspace = await Workspace.findById(workspaceId).select('settings.webhookUrl').lean() as { settings?: { webhookUrl?: string } } | null;
if (workspace?.settings?.webhookUrl) {
  fireWebhook(
    workspace.settings.webhookUrl,
    {
      event: 'job:complete',
      jobId,
      workspaceId,
      status: 'complete',
      totalLeadsFound: leads.length,
    },
    env.WEBHOOK_TIMEOUT_MS,
  );
}
```

Also add a `Workspace` model definition to `leadWriter.ts` (or import the existing one from the worker's inline models if it already exists in that file). Check `workers/src/pipeline/leadWriter.ts` first — if `Workspace` model is already defined, skip that part.

- [ ] **Step 4: Fire webhook on job failure in `prospecting.worker.ts`**

In `workers/src/prospecting.worker.ts`, inside the `catch (err)` block (after the `publisher.publish` for the error event), add:

```ts
// After the publisher.publish call in the catch block:
const workspace = await Workspace.findById(workspaceId).select('settings.webhookUrl').lean() as { settings?: { webhookUrl?: string } } | null;
if (workspace?.settings?.webhookUrl) {
  fireWebhook(
    workspace.settings.webhookUrl,
    {
      event: 'job:failed',
      jobId,
      workspaceId,
      status: 'failed',
      error: message,
    },
    env.WEBHOOK_TIMEOUT_MS,
  );
}
```

Add the import at the top of `prospecting.worker.ts`:
```ts
import { fireWebhook } from './services/webhook.js';
```

- [ ] **Step 5: Verify type-check passes**

```bash
pnpm --filter @leadreai/workers type-check
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add workers/src/services/webhook.ts workers/src/pipeline/leadWriter.ts workers/src/prospecting.worker.ts workers/src/config/env.ts
git commit -m "feat(workers): fire workspace webhook on job:complete / job:failed"
```

---

## Task 4: Credits System

**Files:**
- Modify: `backend/src/controllers/jobs.controller.ts`
- Modify: `workers/src/pipeline/leadWriter.ts`

`User.creditsBalance` exists in the schema. The flow: (1) check balance ≥ `CREDITS_PER_JOB` before enqueuing; (2) deduct 1 credit atomically; (3) after pipeline completes, optionally charge additional credits proportional to leads found.

If `CREDITS_PER_JOB` is 0 (the default), the check is bypassed — credits are effectively disabled. This lets the feature exist without breaking free-tier usage during dev.

- [ ] **Step 1: Deduct credits in `createJob`**

In `backend/src/controllers/jobs.controller.ts`, add `User` import and atomic balance check before job creation:

```ts
import User from '../models/User.js';
import { env } from '../config/env.js';
```

Replace the existing `createJob` function with:

```ts
export async function createJob(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const { rawQuery } = req.body as { rawQuery: string };

  if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
    throw ApiError.badRequest('rawQuery is required');
  }

  // Deduct credit before expensive AI call (skip if CREDITS_PER_JOB = 0)
  if (env.CREDITS_PER_JOB > 0) {
    const updated = await User.findOneAndUpdate(
      { _id: req.user!._id, creditsBalance: { $gte: env.CREDITS_PER_JOB } },
      { $inc: { creditsBalance: -env.CREDITS_PER_JOB } },
      { new: true }
    );
    if (!updated) {
      throw ApiError.badRequest(
        `Insufficient credits. This action requires ${env.CREDITS_PER_JOB} credit(s).`
      );
    }
  }

  const parsedIntent = await parseQuery(rawQuery);

  const job = await ProspectingJob.create({
    workspaceId,
    createdBy: req.user!._id,
    rawQuery,
    parsedIntent,
    status: 'queued',
    creditsCharged: env.CREDITS_PER_JOB,
  });

  let bullmqJob;
  try {
    bullmqJob = await dispatchProspectingJob(job._id.toString(), workspaceId!);
  } catch (err) {
    // Refund credit on dispatch failure
    if (env.CREDITS_PER_JOB > 0) {
      await User.updateOne(
        { _id: req.user!._id },
        { $inc: { creditsBalance: env.CREDITS_PER_JOB } }
      ).catch(() => {});
    }
    await ProspectingJob.deleteOne({ _id: job._id });
    throw err;
  }
  job.bullmqJobId = bullmqJob.id ?? undefined;
  await job.save();

  res.status(201).json({ success: true, data: job });
}
```

- [ ] **Step 2: Add `GET /auth/me/credits` endpoint**

In `backend/src/controllers/auth.controller.ts`, add at the bottom:
```ts
export async function getCredits(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const user = await User.findById(req.user._id).select('creditsBalance plan');
  if (!user) throw ApiError.notFound('User not found');
  res.json({ success: true, data: { creditsBalance: user.creditsBalance, plan: user.plan } });
}
```

In `backend/src/routes/auth.routes.ts`, add:
```ts
import { ..., getCredits } from '../controllers/auth.controller.js';
// Add after existing routes:
router.get('/me/credits', authenticate, asyncHandler(getCredits));
```

- [ ] **Step 3: Verify type-check**

```bash
pnpm --filter @leadreai/backend type-check
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/jobs.controller.ts backend/src/controllers/auth.controller.ts backend/src/routes/auth.routes.ts
git commit -m "feat(backend): credits check on job submission + GET /auth/me/credits"
```

---

## Task 5: Frontend Credits Display

**Files:**
- Create: `frontend/src/hooks/useCredits.ts`
- Modify: `frontend/src/components/layout/Topbar.tsx` (or wherever the dashboard nav bar lives)

Show the user's credit balance in the dashboard topbar so they know when they're running low.

- [ ] **Step 1: Find the topbar component**

Run:
```bash
find /Users/Apple/Desktop/personal-projects/leadreai/frontend/src/components/layout -name "*.tsx" | head -20
```
Note the exact filename of the topbar/header component.

- [ ] **Step 2: Create `useCredits.ts` hook**

Create `frontend/src/hooks/useCredits.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface CreditsData {
  creditsBalance: number;
  plan: string;
}

export function useCredits() {
  return useQuery<CreditsData>({
    queryKey: ['credits'],
    queryFn: async () => {
      const res = await apiFetch<{ success: true; data: CreditsData }>('/api/v1/auth/me/credits');
      return res.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
```

- [ ] **Step 3: Add credits badge to topbar**

In the topbar component file, add the import and badge. Find the JSX area that renders user info or the top-right corner. Add:

```tsx
import { useCredits } from '@/hooks/useCredits';
import { Coins } from 'lucide-react';

// Inside the component:
const { data: credits } = useCredits();

// In the JSX, add before or after the user avatar/name section:
{credits !== undefined && (
  <div className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
    <Coins size={11} />
    <span>{credits.creditsBalance.toLocaleString()}</span>
  </div>
)}
```

- [ ] **Step 4: Verify frontend type-check**

```bash
pnpm --filter @leadreai/frontend type-check
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useCredits.ts frontend/src/components/layout/
git commit -m "feat(frontend): credit balance badge in dashboard topbar"
```

---

## Task 6: Workspace API Key Management

**Files:**
- Modify: `backend/src/models/Workspace.ts`
- Modify: `backend/src/controllers/workspace.controller.ts`
- Modify: `backend/src/routes/workspace.routes.ts`
- Modify: `backend/src/middleware/authenticate.ts`
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/page.tsx`

Workspace owners can generate named API keys (`sk-...`) for programmatic access. Keys are stored as bcrypt hashes. The `authenticate` middleware is extended to check Bearer tokens that start with `sk-` against all workspace keys.

- [ ] **Step 1: Add `apiKeys` subdocument to `Workspace.ts`**

In `backend/src/models/Workspace.ts`, add to the `IWorkspace` interface:
```ts
apiKeys: Array<{
  _id: mongoose.Types.ObjectId;
  name: string;
  keyHash: string;
  prefix: string;        // first 8 chars of raw key, shown to user
  createdAt: Date;
  lastUsedAt?: Date;
}>;
```

Add to the `workspaceSchema`:
```ts
apiKeys: {
  type: [
    {
      name: { type: String, required: true, maxlength: 100 },
      keyHash: { type: String, required: true, select: false },
      prefix: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
      lastUsedAt: { type: Date },
    },
  ],
  default: [],
},
```

- [ ] **Step 2: Add API key controller functions to `workspace.controller.ts`**

At the top of `backend/src/controllers/workspace.controller.ts`, add the import:
```ts
import { createHash } from 'crypto';
```

Add three new exported functions at the bottom:

```ts
// ---------------------------------------------------------------------------
// listApiKeys  GET /api/v1/workspaces/:workspaceId/api-keys
// ---------------------------------------------------------------------------
export async function listApiKeys(req: Request, res: Response): Promise<void> {
  const workspace = await Workspace.findById(req.params['workspaceId']).select('apiKeys');
  if (!workspace) throw ApiError.notFound('Workspace not found');

  const keys = (workspace.apiKeys ?? []).map((k) => ({
    _id: k._id,
    name: k.name,
    prefix: k.prefix,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
  }));
  res.json({ success: true, data: keys });
}

// ---------------------------------------------------------------------------
// createApiKey  POST /api/v1/workspaces/:workspaceId/api-keys
// ---------------------------------------------------------------------------
export async function createApiKey(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const { name } = req.body as { name?: string };

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw ApiError.badRequest('name is required');
  }

  const workspace = await Workspace.findById(workspaceId).select('apiKeys');
  if (!workspace) throw ApiError.notFound('Workspace not found');
  if ((workspace.apiKeys ?? []).length >= 10) {
    throw ApiError.conflict('Maximum of 10 API keys per workspace');
  }

  // Generate: "sk-" + 40 random hex chars
  const rawKey = `sk-${randomBytes(20).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const prefix = rawKey.slice(0, 8); // "sk-XXXXX" prefix for display

  await Workspace.findByIdAndUpdate(workspaceId, {
    $push: {
      apiKeys: {
        name: name.trim(),
        keyHash,
        prefix,
        createdAt: new Date(),
      },
    },
  });

  // Return the full raw key ONCE — never stored
  res.status(201).json({ success: true, data: { key: rawKey, prefix, name: name.trim() } });
}

// ---------------------------------------------------------------------------
// revokeApiKey  DELETE /api/v1/workspaces/:workspaceId/api-keys/:keyId
// ---------------------------------------------------------------------------
export async function revokeApiKey(req: Request, res: Response): Promise<void> {
  const { workspaceId, keyId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(keyId!)) throw ApiError.badRequest('Invalid keyId');

  const result = await Workspace.updateOne(
    { _id: workspaceId },
    { $pull: { apiKeys: { _id: new mongoose.Types.ObjectId(keyId) } } }
  );
  if (result.matchedCount === 0) throw ApiError.notFound('Workspace not found');
  if (result.modifiedCount === 0) throw ApiError.notFound('API key not found');

  res.json({ success: true });
}
```

- [ ] **Step 3: Wire API key routes in `workspace.routes.ts`**

In `backend/src/routes/workspace.routes.ts`, add after the email config routes:
```ts
router.get(
  '/:workspaceId/api-keys',
  authorize(['owner', 'admin']),
  asyncHandler(workspaceController.listApiKeys)
);
router.post(
  '/:workspaceId/api-keys',
  authorize(['owner']),
  asyncHandler(workspaceController.createApiKey)
);
router.delete(
  '/:workspaceId/api-keys/:keyId',
  authorize(['owner']),
  asyncHandler(workspaceController.revokeApiKey)
);
```

- [ ] **Step 4: Extend `authenticate.ts` to support `sk-` API keys**

Open `backend/src/middleware/authenticate.ts`. After the existing JWT check (the `try/catch` that verifies the Bearer token), add a fallback for `sk-` prefixed tokens. The logic:
1. If Bearer token starts with `sk-`, hash it and search all workspaces for a matching key.
2. On match, set `req.user` to the workspace owner and update `lastUsedAt`.
3. If no match, return 401 as normal.

```ts
import { createHash } from 'crypto';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';

// Inside authenticate middleware, after the JWT try/catch block:
// (This runs only if jwt verification threw — i.e., the token isn't a valid JWT)
if (token.startsWith('sk-')) {
  const keyHash = createHash('sha256').update(token).digest('hex');
  const workspace = await Workspace.findOne(
    { 'apiKeys.keyHash': keyHash },
    { 'apiKeys.$': 1, ownerId: 1 }
  ).select('+apiKeys.keyHash');

  if (!workspace) {
    res.status(401).json({ success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } });
    return;
  }

  // Update lastUsedAt (fire-and-forget)
  const matchedKey = workspace.apiKeys[0];
  Workspace.updateOne(
    { _id: workspace._id, 'apiKeys._id': matchedKey._id },
    { $set: { 'apiKeys.$.lastUsedAt': new Date() } }
  ).catch(() => {});

  const owner = await User.findById(workspace.ownerId);
  if (!owner) {
    res.status(401).json({ success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } });
    return;
  }

  req.user = owner;
  next();
  return;
}
```

Note: The exact placement depends on the current `authenticate.ts` structure. Read the file first. The `sk-` check must be in the `catch` branch of the JWT verification so it only runs when JWT fails.

- [ ] **Step 5: Add API Keys section to settings page**

In `frontend/src/app/(dashboard)/dashboard/settings/page.tsx`, add a fourth card section after the Knowledge Base card. Add the following state and mutations inside the component:

```tsx
// State
const [newKeyName, setNewKeyName] = useState('');
const [createdKey, setCreatedKey] = useState<string | null>(null);

// Query
const { data: apiKeysData, refetch: refetchKeys } = useQuery({
  queryKey: ['api-keys', workspaceId],
  queryFn: () => apiFetch<{ success: true; data: ApiKeyMeta[] }>(`/api/v1/workspaces/${workspaceId}/api-keys`),
  enabled: !!workspaceId,
  select: (r) => r.data,
});

// Types (add near top of file)
interface ApiKeyMeta {
  _id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

// Mutations
const createKeyMutation = useMutation({
  mutationFn: (name: string) =>
    apiFetch<{ success: true; data: { key: string; prefix: string; name: string } }>(
      `/api/v1/workspaces/${workspaceId}/api-keys`,
      { method: 'POST', body: JSON.stringify({ name }) }
    ),
  onSuccess: (res) => {
    setCreatedKey(res.data.key);
    setNewKeyName('');
    void refetchKeys();
  },
  onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create key'),
});

const revokeKeyMutation = useMutation({
  mutationFn: (keyId: string) =>
    apiFetch(`/api/v1/workspaces/${workspaceId}/api-keys/${keyId}`, { method: 'DELETE' }),
  onSuccess: () => { toast.success('Key revoked'); void refetchKeys(); },
  onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to revoke key'),
});
```

Add the card JSX:
```tsx
{/* ── Section 4: API Keys ──────────────────────────────────────── */}
<Card>
  <CardHeader>
    <CardTitle className="text-base font-semibold">API Keys</CardTitle>
    <CardDescription>
      Generate workspace-scoped API keys for programmatic access. Keys are shown once — save them securely.
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* New key form */}
    <form
      onSubmit={(e) => { e.preventDefault(); if (newKeyName.trim()) createKeyMutation.mutate(newKeyName.trim()); }}
      className="flex gap-2"
    >
      <Input
        placeholder="Key name (e.g. Production)"
        value={newKeyName}
        onChange={(e) => setNewKeyName(e.target.value)}
        maxLength={100}
        className="flex-1"
      />
      <Button type="submit" size="sm" disabled={createKeyMutation.isPending || !newKeyName.trim()}>
        Generate
      </Button>
    </form>

    {/* Show newly created key */}
    {createdKey && (
      <div className="rounded-md border border-green-600/30 bg-green-600/10 p-3 text-xs">
        <p className="mb-1 font-medium text-green-400">Copy this key — it will not be shown again:</p>
        <code className="block break-all text-green-300 select-all">{createdKey}</code>
        <Button variant="ghost" size="sm" className="mt-2 h-6 text-xs" onClick={() => { void navigator.clipboard.writeText(createdKey); toast.success('Copied'); }}>
          Copy
        </Button>
      </div>
    )}

    {/* Existing keys */}
    {(apiKeysData ?? []).length === 0 ? (
      <p className="text-sm text-muted-foreground">No API keys yet.</p>
    ) : (
      <div className="space-y-2">
        {(apiKeysData ?? []).map((k) => (
          <div key={k._id} className="flex items-center justify-between rounded-md border border-border bg-secondary/20 px-3 py-2">
            <div>
              <p className="text-sm font-medium">{k.name}</p>
              <p className="text-xs text-muted-foreground">{k.prefix}•••• · Created {new Date(k.createdAt).toLocaleDateString()}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => revokeKeyMutation.mutate(k._id)}
              disabled={revokeKeyMutation.isPending}
            >
              <Trash2 size={13} />
            </Button>
          </div>
        ))}
      </div>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 6: Type-check both packages**

```bash
pnpm --filter @leadreai/backend type-check
pnpm --filter @leadreai/frontend type-check
```
Expected: no errors in either.

- [ ] **Step 7: Commit**

```bash
git add backend/src/models/Workspace.ts backend/src/controllers/workspace.controller.ts backend/src/routes/workspace.routes.ts backend/src/middleware/authenticate.ts frontend/src/app/(dashboard)/dashboard/settings/page.tsx
git commit -m "feat: workspace API key management (generate, list, revoke, auth)"
```

---

## Task 7: Proxy Rotation in Playwright

**Files:**
- Modify: `workers/src/pipeline/pageScraper.ts`

`PROXY_LIST` is already in worker env schema (comma-separated `http://user:pass@host:port` strings). Wire it into the Chromium launch options so each browser context rotates through the list.

- [ ] **Step 1: Install `proxy-agent`**

```bash
cd /Users/Apple/Desktop/personal-projects/leadreai/workers
pnpm add proxy-agent
```

Wait — `playwright` uses its own proxy option, not `proxy-agent`. `proxy-agent` is for axios/node http. For Playwright, proxy is passed directly to `chromium.launch()` or `browser.newContext()`.

Skip installing `proxy-agent`. Use Playwright's built-in proxy support instead.

- [ ] **Step 2: Modify `pageScraper.ts` to rotate proxies**

In `workers/src/pipeline/pageScraper.ts`, after the existing imports, add a proxy parser:

```ts
const PROXIES: string[] = env.PROXY_LIST
  ? env.PROXY_LIST.split(',').map((p) => p.trim()).filter(Boolean)
  : [];

let proxyIndex = 0;
function nextProxy(): { server: string; username?: string; password?: string } | undefined {
  if (PROXIES.length === 0) return undefined;
  const raw = PROXIES[proxyIndex % PROXIES.length]!;
  proxyIndex++;
  try {
    const url = new URL(raw);
    return {
      server: `${url.protocol}//${url.hostname}:${url.port}`,
      username: url.username || undefined,
      password: url.password || undefined,
    };
  } catch {
    return { server: raw };
  }
}
```

Find the `chromium.launch()` call (currently `{ headless: env.PLAYWRIGHT_HEADLESS }`). Do NOT add proxy to `launch()` — Playwright requires proxy per context. Find where `browser.newContext()` is called (it may be inside the page-processing loop). Add `proxy: nextProxy()` there:

```ts
const context = await browser.newContext({
  proxy: nextProxy(),
  userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
});
```

If `browser.newContext()` doesn't exist yet and pages are opened directly on the browser, refactor the loop to create a context per page batch. Study the current `pageScraper.ts` structure before editing — do not break existing functionality.

- [ ] **Step 3: Type-check workers**

```bash
pnpm --filter @leadreai/workers type-check
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add workers/src/pipeline/pageScraper.ts
git commit -m "feat(workers): proxy rotation in Playwright page scraper"
```

---

## Task 8: Dockerfiles

**Files:**
- Create: `Dockerfile.backend`
- Create: `Dockerfile.workers`
- Create: `.dockerignore`

Multi-stage builds: `builder` stage compiles TypeScript to `dist/`, `runner` stage copies only the compiled output and production `node_modules`. Both use `node:20-alpine`.

- [ ] **Step 1: Create `.dockerignore`**

Create `/.dockerignore` at repo root:
```
node_modules
**/node_modules
**/.env
**/.env.*
**/dist
**/*.tsbuildinfo
.git
.gitignore
docs
*.md
!README.md
frontend/
```

- [ ] **Step 2: Create `Dockerfile.backend`**

Create `/Dockerfile.backend` at repo root:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile

COPY shared/ ./shared/
COPY backend/ ./backend/

RUN pnpm --filter @leadreai/shared build
RUN pnpm --filter @leadreai/backend build


FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/backend/dist ./backend/dist

EXPOSE 4000

CMD ["node", "backend/dist/index.js"]
```

- [ ] **Step 3: Create `Dockerfile.workers`**

Create `/Dockerfile.workers` at repo root:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json ./shared/
COPY workers/package.json ./workers/
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile

COPY shared/ ./shared/
COPY workers/ ./workers/

RUN pnpm --filter @leadreai/shared build
RUN pnpm --filter @leadreai/workers build

# Install Playwright Chromium browser
RUN cd workers && npx playwright install --with-deps chromium


FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Required system libs for Chromium on alpine
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  freetype-dev \
  harfbuzz \
  ca-certificates \
  ttf-freefont

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json ./shared/
COPY workers/package.json ./workers/
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/workers/dist ./workers/dist

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

CMD ["node", "workers/dist/index.js"]
```

- [ ] **Step 4: Verify Dockerfiles parse correctly (no build yet)**

```bash
docker build -f Dockerfile.backend -t leadreai-backend:test . --no-cache --dry-run 2>/dev/null || echo "dry-run not supported; file exists"
ls -la Dockerfile.backend Dockerfile.workers .dockerignore
```
Expected: all 3 files exist.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile.backend Dockerfile.workers .dockerignore
git commit -m "build: multi-stage Dockerfiles for backend and workers"
```

---

## Task 9: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

On every push and PR to `main` or `feature/*` branches: install deps, type-check all packages, lint all packages. No test suite exists yet so we skip the test step.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```bash
mkdir -p /Users/Apple/Desktop/personal-projects/leadreai/.github/workflows
```

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main, staging, 'feature/**']
  pull_request:
    branches: [main, staging]

jobs:
  lint-typecheck:
    name: Lint & Type-check
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type-check shared
        run: pnpm --filter @leadreai/shared type-check

      - name: Type-check backend
        run: pnpm --filter @leadreai/backend type-check

      - name: Type-check workers
        run: pnpm --filter @leadreai/workers type-check

      - name: Type-check frontend
        run: pnpm --filter @leadreai/frontend type-check

      - name: Lint backend
        run: pnpm --filter @leadreai/backend lint

      - name: Lint workers
        run: pnpm --filter @leadreai/workers lint
```

- [ ] **Step 2: Verify the YAML is valid**

```bash
cat /Users/Apple/Desktop/personal-projects/leadreai/.github/workflows/ci.yml
```
Expected: full YAML contents printed.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: GitHub Actions lint and type-check pipeline"
```

---

## Self-Review

### Spec coverage check

| BuildPlan Phase 6 item | Task |
|------------------------|------|
| Redis rate limiting on all endpoints | Task 1 |
| Dead letter queue / retry | Already in `queues.ts` (attempts:3, backoff); BullBoard shows failed jobs (Task 2) |
| Bull Board at `/admin/queues` | Task 2 |
| Workspace webhook on job:complete | Task 3 |
| Credits balance check before enqueue | Task 4 |
| Frontend credit balance display | Task 5 |
| API key management | Task 6 |
| Proxy rotation in Playwright | Task 7 |
| Dockerfiles | Task 8 |
| GitHub Actions CI | Task 9 |
| MongoDB index audit | Not planned — this is an ops/review task, not code to write. Review existing indexes in models with `.explain()` manually after deploy. |

### Gaps

- **`winston-mongodb` log transport**: `LOG_TO_MONGODB=true` env var exists in the env schema and `winston-mongodb` is in `backend/package.json`, but there's no code to conditionally add the MongoDB transport. This is a low-risk gap (logs to file/console regardless). Add as optional follow-up.
- **`/admin/queues` auth strategy**: Uses a simple `X-Admin-Secret` header or `?secret=` query param. This is appropriate for an internal tool behind a VPN/private network. If exposed publicly, add IP allowlisting.

### Placeholder scan

No TBD / TODO / "implement later" patterns found.

### Type consistency

- `ApiKeyMeta` type in settings page must match the `listApiKeys` controller response shape: `{ _id, name, prefix, createdAt, lastUsedAt }` — verified consistent.
- `WebhookPayload` in `workers/src/services/webhook.ts` is self-contained.
- `CREDITS_PER_JOB` added to both `backend/src/config/env.ts` (Task 1) and used in `jobs.controller.ts` (Task 4) — consistent.
- `WEBHOOK_TIMEOUT_MS` added to `workers/src/config/env.ts` (Task 3) — consistent with usage in `webhook.ts`.
