# Flutterwave Billing — End-to-End Payment Integration

**Goal:** An agency user can subscribe to the Correspondent plan, buy credit top-ups, and cancel their subscription — all charged through Flutterwave — without leaving the product.

**Why Flutterwave:** Primary market is Nigeria. Flutterwave supports NGN, local cards, bank transfer, USSD, and mobile money natively with no US banking requirements.

**In scope:**
- Flutterwave Hosted Checkout for subscription (Correspondent $49/mo → NGN equivalent)
- Flutterwave Hosted Checkout for credit top-ups (4 packages from CREDIT_PACKAGES)
- Server-side transaction verification on redirect return
- Flutterwave webhook handler as backup/idempotency guard
- Subscription cancellation via Flutterwave API + billing page UI
- Remove placeholder notices from ChangePlanModal and TopUpModal

**Out of scope:**
- Enterprise/custom pricing (`priceUsd = null` → "contact sales" stays)
- Invoice PDF generation
- Failed-payment dunning emails
- NGN price display (prices remain in USD for v1; NGN conversion is v2)
- "Update payment method" (requires resubscribe flow — defer to v2)

---

## Architecture

```
ChangePlanModal → POST /api/v1/credits/checkout-session
                   → FLW POST /v3/payments (payment_plan attached)
                   → { url: checkout_link }
                   → window.location.href = url

TopUpModal      → POST /api/v1/credits/topup-checkout-session { packageId }
                   → FLW POST /v3/payments (one-time, no plan)
                   → { url: checkout_link }
                   → window.location.href = url

After payment:     FLW redirects to /dashboard/settings/billing
                   ?tx_ref=...&status=successful&transaction_id=...
                   → Frontend reads params, calls POST /api/v1/credits/verify-payment { transactionId }
                   → Backend: GET /v3/transactions/:id/verify
                   → status === 'successful' → subscribeToPlan() or grantCredits()
                   → { provisioned: true, type }

Webhook (backup) → POST /webhooks/flutterwave
                   → compare verif-hash header === FLW_SECRET_HASH
                   → charge.completed → verify + provision (idempotent)
                   → subscription.cancelled → subscribeToPlan('free')

Cancel sub       → POST /api/v1/credits/cancel-subscription
                   → FLW PUT /v3/subscriptions/:flwSubscriptionId/cancel
                   → subscribeToPlan('free') locally
```

**Idempotency:** Both the verify-payment route and the webhook handler call the same provision logic. The `CreditTransaction` ledger acts as the dedup guard — `grantCredits()` always appends a row, but `subscribeToPlan()` is safe to call twice (it sets the plan + resets monthly credits — calling it twice before renewal is the same outcome). For extra safety, store `flwTxRef` on the transaction ledger metadata and skip provisioning if a `topup.flw` row with that tx_ref already exists.

---

## File Map

### Create
- `backend/src/services/flutterwave.ts` — FLW REST client + helpers
- `backend/src/controllers/flutterwave.controller.ts` — 4 handlers

### Modify
- `backend/src/models/User.ts` — add `flwSubscriptionId?: number`
- `backend/src/config/env.ts` — add FLW_SECRET_KEY, FLW_PUBLIC_KEY, FLW_SECRET_HASH, FLW_GROWTH_PLAN_ID
- `backend/src/routes/credits.routes.ts` — add checkout-session, topup-checkout-session, verify-payment, cancel-subscription
- `backend/src/routes/webhooks.routes.ts` — add POST /flutterwave
- `.env.example` — document FLW vars
- `frontend/src/components/credits/ChangePlanModal.tsx` — redirect to FLW checkout
- `frontend/src/components/credits/TopUpModal.tsx` — redirect to FLW checkout
- `frontend/src/app/(dashboard)/dashboard/settings/billing/page.tsx` — verify banner + cancel button

---

## Task 1 — Backend infrastructure (User model, env, Flutterwave service)

**Files:**
- Modify: `backend/src/models/User.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `.env.example`
- Create: `backend/src/services/flutterwave.ts`

### Step 1.1 — Add `flwSubscriptionId` to User model

In `backend/src/models/User.ts`, add to `IUser` interface after `isEmailVerified`:
```typescript
// Flutterwave subscription ID — stored after first recurring payment so
// we can cancel via PUT /v3/subscriptions/:id/cancel.
flwSubscriptionId?: number;
```

In `userSchema`, after the `isEmailVerified` field:
```typescript
flwSubscriptionId: { type: Number, sparse: true },
```

### Step 1.2 — Add Flutterwave env vars

In `backend/src/config/env.ts`, add to envSchema:
```typescript
// Flutterwave billing
FLW_SECRET_KEY: z.string().optional(),
FLW_PUBLIC_KEY: z.string().optional(),
// Secret hash set in Flutterwave dashboard → Webhooks → Secret Hash.
// Sent verbatim as the `verif-hash` header on every webhook — compare directly.
FLW_SECRET_HASH: z.string().optional(),
// Payment plan ID for the Correspondent ($49/mo) subscription.
// Create via POST /v3/payment-plans or Flutterwave dashboard.
FLW_GROWTH_PLAN_ID: z.coerce.number().optional(),
```

Add to `.env.example`:
```
# Flutterwave billing (https://developer.flutterwave.com)
FLW_SECRET_KEY=FLWSECK_TEST-...
FLW_PUBLIC_KEY=FLWPUBK_TEST-...
# Set this in FLW dashboard → Settings → Webhooks → Secret Hash
FLW_SECRET_HASH=your-webhook-secret
# Create plan in FLW dashboard or POST /v3/payment-plans; copy numeric ID here
FLW_GROWTH_PLAN_ID=12345
# Frontend (Next.js reads NEXT_PUBLIC_* at build time)
NEXT_PUBLIC_FLW_PUBLIC_KEY=FLWPUBK_TEST-...
```

### Step 1.3 — Create `backend/src/services/flutterwave.ts`

```typescript
import { randomBytes } from 'node:crypto';
import User from '../models/User.js';
import CreditTransaction from '../models/CreditTransaction.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { subscribeToPlan, grantCredits } from './credits.js';
import type { PlanTier } from '@leadreai/shared';

const FLW_BASE = 'https://api.flutterwave.com/v3';

function secretKey(): string {
  if (!env.FLW_SECRET_KEY) throw new Error('FLW_SECRET_KEY is not set.');
  return env.FLW_SECRET_KEY;
}

async function flwPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${FLW_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json() as { status: string; message: string; data: T };
  if (json.status !== 'success') {
    throw new Error(`Flutterwave error: ${json.message}`);
  }
  return json.data;
}

async function flwGet<T>(path: string): Promise<T> {
  const res = await fetch(`${FLW_BASE}${path}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const json = await res.json() as { status: string; message: string; data: T };
  if (json.status !== 'success') {
    throw new Error(`Flutterwave error: ${json.message}`);
  }
  return json.data;
}

async function flwPut<T>(path: string): Promise<T> {
  const res = await fetch(`${FLW_BASE}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const json = await res.json() as { status: string; message: string; data: T };
  if (json.status !== 'success') {
    throw new Error(`Flutterwave error: ${json.message}`);
  }
  return json.data;
}

function makeTxRef(userId: string): string {
  return `flw-${userId}-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

interface FLWCheckoutData { link: string }

/**
 * Create a Flutterwave hosted checkout session for subscribing to the
 * Correspondent ($49/mo) plan. Attaches the payment plan so FLW handles
 * recurring billing automatically.
 */
export async function createSubscriptionCheckoutUrl(
  userId: string,
  returnBaseUrl: string,
): Promise<string> {
  if (!env.FLW_GROWTH_PLAN_ID) throw new Error('FLW_GROWTH_PLAN_ID is not set.');

  const user = await User.findById(userId).select('email firstName lastName');
  if (!user) throw new Error('User not found');

  const txRef = makeTxRef(userId);

  const data = await flwPost<FLWCheckoutData>('/payments', {
    tx_ref: txRef,
    amount: 49,
    currency: 'USD',
    payment_plan: env.FLW_GROWTH_PLAN_ID,
    redirect_url: `${returnBaseUrl}/dashboard/settings/billing`,
    customer: {
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
    },
    customizations: {
      title: 'LeadreAI — Correspondent',
      description: '200 research dispatches per month',
    },
    meta: { userId, type: 'subscription', planTier: 'growth' },
  });

  return data.link;
}

/**
 * Create a Flutterwave hosted checkout session for a one-off credit top-up.
 */
export async function createTopUpCheckoutUrl(
  userId: string,
  packageId: string,
  credits: number,
  priceUsd: number,
  label: string,
  returnBaseUrl: string,
): Promise<string> {
  const user = await User.findById(userId).select('email firstName lastName');
  if (!user) throw new Error('User not found');

  const txRef = makeTxRef(userId);

  const data = await flwPost<FLWCheckoutData>('/payments', {
    tx_ref: txRef,
    amount: priceUsd,
    currency: 'USD',
    redirect_url: `${returnBaseUrl}/dashboard/settings/billing`,
    customer: {
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
    },
    customizations: {
      title: `LeadreAI — ${label}`,
      description: `${credits} research dispatches, roll over forever.`,
    },
    meta: { userId, type: 'topup', packageId, credits: String(credits) },
  });

  return data.link;
}

interface FLWTransaction {
  id: number;
  tx_ref: string;
  status: 'successful' | 'pending' | 'failed';
  amount: number;
  currency: string;
  meta?: Record<string, unknown>;
}

/**
 * Verify a transaction server-side and provision accordingly.
 * Returns what was provisioned so the caller can respond to the frontend.
 * Safe to call multiple times — ledger dedup prevents double-grants.
 */
export async function verifyAndProvision(
  transactionId: string | number,
): Promise<{ type: 'subscription' | 'topup' | 'already_processed'; planTier?: string }> {
  const txn = await flwGet<FLWTransaction>(`/transactions/${transactionId}/verify`);

  if (txn.status !== 'successful') {
    throw new Error(`Payment not successful (status: ${txn.status})`);
  }

  const meta = txn.meta ?? {};
  const userId = meta['userId'] as string | undefined;
  if (!userId) throw new Error('Transaction metadata missing userId');

  // Idempotency: check if we've already processed this transaction.
  const existing = await CreditTransaction.findOne({
    userId,
    'metadata.flwTxnId': txn.id,
  });
  if (existing) {
    return { type: 'already_processed' };
  }

  const type = meta['type'] as 'subscription' | 'topup';

  if (type === 'subscription') {
    const planTier = (meta['planTier'] as PlanTier | undefined) ?? 'growth';
    await subscribeToPlan(userId, planTier);

    // Look up and store the FLW subscription ID for later cancellation.
    // The subscription is tied to the customer email — fetch it after provisioning.
    void lookUpAndStoreSubscriptionId(userId).catch((err) =>
      logger.warn('[flw] could not store subscription ID', { err: String(err) }),
    );

    logger.info('[flw] subscription provisioned', { userId, planTier, txnId: txn.id });
    return { type: 'subscription', planTier };
  }

  if (type === 'topup') {
    const packageId = meta['packageId'] as string;
    const credits = parseInt(meta['credits'] as string, 10);
    if (!packageId || !credits) throw new Error('Top-up metadata incomplete');

    await grantCredits({
      userId,
      amount: credits,
      bucket: 'topup',
      reason: 'topup.flw',
      description: `Flutterwave top-up — ${packageId} (${credits} credits)`,
      metadata: { packageId, flwTxnId: txn.id, flwTxRef: txn.tx_ref },
    });

    logger.info('[flw] top-up granted', { userId, packageId, credits, txnId: txn.id });
    return { type: 'topup' };
  }

  throw new Error(`Unknown payment type in metadata: ${String(type)}`);
}

/**
 * Fetch the active subscription for this user from FLW and store its ID
 * on the User document so we can cancel it later.
 */
async function lookUpAndStoreSubscriptionId(userId: string): Promise<void> {
  if (!env.FLW_GROWTH_PLAN_ID) return;
  const user = await User.findById(userId).select('email');
  if (!user) return;

  interface FLWSubList { subscriptions: Array<{ id: number; status: string; plan_id: number }> }
  const data = await flwGet<FLWSubList>(
    `/subscriptions?customer_email=${encodeURIComponent(user.email)}&plan_id=${env.FLW_GROWTH_PLAN_ID}`,
  );

  const active = data.subscriptions.find((s) => s.status === 'active');
  if (active) {
    await User.findByIdAndUpdate(userId, { flwSubscriptionId: active.id });
    logger.info('[flw] subscription ID stored', { userId, subscriptionId: active.id });
  }
}

/**
 * Cancel the user's active Flutterwave subscription and downgrade to free.
 */
export async function cancelSubscription(userId: string): Promise<void> {
  const user = await User.findById(userId).select('flwSubscriptionId');
  if (!user) throw new Error('User not found');

  if (user.flwSubscriptionId) {
    await flwPut(`/subscriptions/${user.flwSubscriptionId}/cancel`);
  }

  await subscribeToPlan(userId, 'free');
  await User.findByIdAndUpdate(userId, { $unset: { flwSubscriptionId: 1 } });
  logger.info('[flw] subscription cancelled', { userId });
}

/**
 * Verify the verif-hash header from a Flutterwave webhook.
 * FLW sends the plain secret hash you configured — compare directly.
 */
export function verifyWebhookHash(header: string): boolean {
  if (!env.FLW_SECRET_HASH) throw new Error('FLW_SECRET_HASH is not set.');
  return header === env.FLW_SECRET_HASH;
}
```

### Step 1.4 — Type-check

```bash
npx tsc --noEmit -p backend/tsconfig.json 2>&1 | head -20
```

Expected: no errors.

---

## Task 2 — Backend endpoints and webhook handler

**Files:**
- Create: `backend/src/controllers/flutterwave.controller.ts`
- Modify: `backend/src/routes/credits.routes.ts`
- Modify: `backend/src/routes/webhooks.routes.ts`

### Step 2.1 — Create `backend/src/controllers/flutterwave.controller.ts`

```typescript
import type { Request, Response } from 'express';
import { CREDIT_PACKAGES } from '@leadreai/shared';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import {
  createSubscriptionCheckoutUrl,
  createTopUpCheckoutUrl,
  verifyAndProvision,
  cancelSubscription,
  verifyWebhookHash,
} from '../services/flutterwave.js';

function returnBase(req: Request): string {
  const ref = req.headers['referer'] ?? req.headers['origin'];
  if (ref) {
    try {
      const u = new URL(ref as string);
      return `${u.protocol}//${u.host}`;
    } catch { /* fall through */ }
  }
  return process.env['FRONTEND_URL'] ?? 'http://localhost:3000';
}

/** POST /api/v1/credits/checkout-session */
export async function checkoutSession(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const url = await createSubscriptionCheckoutUrl(String(req.user._id), returnBase(req));
  res.json({ success: true, data: { url } });
}

/** POST /api/v1/credits/topup-checkout-session */
export async function topUpCheckoutSession(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { packageId } = req.body as { packageId?: unknown };
  if (typeof packageId !== 'string') throw ApiError.badRequest('packageId is required');

  const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) throw ApiError.badRequest(`Unknown packageId: ${packageId}`);

  const url = await createTopUpCheckoutUrl(
    String(req.user._id), pkg.id, pkg.credits, pkg.priceUsd, pkg.label, returnBase(req),
  );
  res.json({ success: true, data: { url } });
}

/** POST /api/v1/credits/verify-payment */
export async function verifyPayment(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { transactionId } = req.body as { transactionId?: unknown };
  if (!transactionId || (typeof transactionId !== 'string' && typeof transactionId !== 'number')) {
    throw ApiError.badRequest('transactionId is required');
  }

  const result = await verifyAndProvision(transactionId);
  res.json({ success: true, data: result });
}

/** POST /api/v1/credits/cancel-subscription */
export async function cancelSubscriptionHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  await cancelSubscription(String(req.user._id));
  res.json({ success: true, data: { cancelled: true } });
}

/** POST /webhooks/flutterwave — no auth; hash-verified */
export async function flutterwaveWebhook(req: Request, res: Response): Promise<void> {
  const hash = req.headers['verif-hash'];
  if (!hash || typeof hash !== 'string' || !verifyWebhookHash(hash)) {
    logger.warn('[flw/webhook] invalid verif-hash');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Acknowledge immediately.
  res.status(200).json({ received: true });

  const event = req.body as { type?: string; data?: Record<string, unknown> };
  logger.info('[flw/webhook] received', { type: event.type });

  try {
    if (event.type === 'charge.completed') {
      const txnId = event.data?.['id'];
      if (txnId && (typeof txnId === 'string' || typeof txnId === 'number')) {
        await verifyAndProvision(txnId);
      }
    } else if (event.type === 'subscription.cancelled') {
      // FLW cancelled the subscription (payment failure, manual cancellation in
      // FLW dashboard, etc.). Downgrade the user to free.
      const customerEmail = (event.data?.['customer'] as Record<string, unknown> | undefined)?.['email'];
      if (typeof customerEmail === 'string') {
        const User = (await import('../models/User.js')).default;
        const { subscribeToPlan } = await import('../services/credits.js');
        const user = await User.findOne({ email: customerEmail.toLowerCase() }).select('_id');
        if (user) {
          await subscribeToPlan(user._id, 'free');
          logger.info('[flw/webhook] subscription cancelled → free', { email: customerEmail });
        }
      }
    }
  } catch (err) {
    logger.error('[flw/webhook] handler threw', { type: event.type, err });
  }
}
```

### Step 2.2 — Add routes to `backend/src/routes/credits.routes.ts`

Add import at the top:
```typescript
import * as flwCtl from '../controllers/flutterwave.controller.js';
```

After the existing `router.post('/test-subscribe', ...)` line, add:
```typescript
router.post('/checkout-session',        asyncHandler(flwCtl.checkoutSession));
router.post('/topup-checkout-session',  asyncHandler(flwCtl.topUpCheckoutSession));
router.post('/verify-payment',          asyncHandler(flwCtl.verifyPayment));
router.post('/cancel-subscription',     asyncHandler(flwCtl.cancelSubscriptionHandler));
```

### Step 2.3 — Add Flutterwave webhook to `backend/src/routes/webhooks.routes.ts`

Add import at top:
```typescript
import { flutterwaveWebhook } from '../controllers/flutterwave.controller.js';
```

Add route (no `authenticate` middleware):
```typescript
router.post('/flutterwave', asyncHandler(flutterwaveWebhook));
```

### Step 2.4 — Type-check

```bash
npx tsc --noEmit -p backend/tsconfig.json 2>&1 | head -30
```

---

## Task 3 — Frontend: ChangePlanModal → Flutterwave redirect

**File:** `frontend/src/components/credits/ChangePlanModal.tsx`

### Step 3.1 — Replace the mutation with a redirect function

Remove the existing `subscribe` `useMutation` block entirely. Replace with:

```typescript
const [redirecting, setRedirecting] = useState(false);

async function handleSubscribe() {
  if (isSamePlan || isEnterprise) return;
  setRedirecting(true);
  try {
    const res = await apiFetch<{ success: true; data: { url: string } }>(
      '/api/v1/credits/checkout-session',
      { method: 'POST' },
    );
    window.location.href = res.data.url;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not start checkout.');
    setRedirecting(false);
  }
}
```

### Step 3.2 — Remove the placeholder notice

Delete the entire `<div className="border-l-2 border-[color:var(--rust)] ...">` block (the "Placeholder / Billing isn't wired yet" notice).

### Step 3.3 — Update the footer button

```tsx
onClick={() => void handleSubscribe()}
disabled={isEnterprise || isSamePlan || redirecting}
```

```tsx
{redirecting
  ? 'Opening checkout…'
  : isEnterprise
    ? 'Contact sales'
    : isSamePlan
      ? 'Current plan'
      : `Switch to ${PLAN_CONFIG.find((p) => p.id === selected)?.label ?? selected}`}
```

### Step 3.4 — Type-check

```bash
pnpm --filter frontend exec tsc --noEmit 2>&1 | head -20
```

---

## Task 4 — Frontend: TopUpModal → Flutterwave redirect

**File:** `frontend/src/components/credits/TopUpModal.tsx`

### Step 4.1 — Replace the mutation with a redirect function

Remove the `topUp` `useMutation`. Replace with:

```typescript
const [redirecting, setRedirecting] = useState(false);

async function handleTopUp() {
  if (!selectedId) return;
  setRedirecting(true);
  try {
    const res = await apiFetch<{ success: true; data: { url: string } }>(
      '/api/v1/credits/topup-checkout-session',
      { method: 'POST', body: JSON.stringify({ packageId: selectedId }) },
    );
    window.location.href = res.data.url;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not start checkout.');
    setRedirecting(false);
  }
}
```

### Step 4.2 — Remove the placeholder notice

Delete the entire `<div className="border-l-2 border-[color:var(--rust)] ...">` block (the "Payments aren't wired yet" notice).

### Step 4.3 — Update the footer button

```tsx
onClick={() => void handleTopUp()}
disabled={!selectedId || redirecting}
```

```tsx
{redirecting
  ? 'Opening checkout…'
  : selectedPkg
    ? `Pay $${selectedPkg.priceUsd} — ${selectedPkg.credits} credits`
    : 'Top up'}
```

### Step 4.4 — Type-check

```bash
pnpm --filter frontend exec tsc --noEmit 2>&1 | head -20
```

---

## Task 5 — Frontend: Billing page (verify redirect + cancel button)

**File:** `frontend/src/app/(dashboard)/dashboard/settings/billing/page.tsx`

After payment FLW redirects to `/dashboard/settings/billing?status=successful&tx_ref=...&transaction_id=...`. The page must:
1. Detect these params
2. Call `POST /api/v1/credits/verify-payment { transactionId }` while showing a loading state
3. Invalidate credits query on success
4. Show a persistent success or error banner

### Step 5.1 — Add `useSearchParams` and verify logic

Near the top of `BillingSettingsPage`, add:

```typescript
const searchParams = useSearchParams();
const router = useRouter();
const qc = useQueryClient();

const flwStatus = searchParams.get('status');          // 'successful' | 'cancelled' | null
const flwTxnId  = searchParams.get('transaction_id');  // numeric string

const [verifyState, setVerifyState] = useState<
  'idle' | 'verifying' | 'success' | 'error' | 'cancelled'
>('idle');

useEffect(() => {
  if (!flwStatus) return;

  if (flwStatus === 'cancelled') {
    setVerifyState('cancelled');
    // Clean URL without navigating away.
    router.replace('/dashboard/settings/billing', { scroll: false });
    return;
  }

  if (flwStatus === 'successful' && flwTxnId) {
    setVerifyState('verifying');
    apiFetch<{ success: true; data: { type: string } }>(
      '/api/v1/credits/verify-payment',
      { method: 'POST', body: JSON.stringify({ transactionId: flwTxnId }) },
    )
      .then(() => {
        setVerifyState('success');
        void qc.invalidateQueries({ queryKey: ['credits'] });
        void qc.invalidateQueries({ queryKey: ['credit-transactions'] });
        router.replace('/dashboard/settings/billing', { scroll: false });
      })
      .catch(() => {
        setVerifyState('error');
        router.replace('/dashboard/settings/billing', { scroll: false });
      });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [flwStatus, flwTxnId]);
```

Import `useSearchParams`, `useRouter` from `'next/navigation'` and `useEffect` from `'react'`.

### Step 5.2 — Render the banner

After the opening `<div>` of the page return, before the existing plan card:

```tsx
{verifyState === 'verifying' && (
  <div className="mb-6 border-l-2 border-[color:var(--ink-3)] px-4 py-3 font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink-2)] animate-pulse">
    Confirming payment…
  </div>
)}
{verifyState === 'success' && (
  <div className="mb-6 border-l-2 border-[color:var(--forest)] bg-[color:var(--forest)]/5 px-4 py-3 font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink)]">
    Payment confirmed — your plan and credits have been updated.
  </div>
)}
{verifyState === 'error' && (
  <div className="mb-6 border-l-2 border-[color:var(--rust)] px-4 py-3 font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink)]">
    Payment verification failed. If you were charged, contact support with your transaction reference.
  </div>
)}
{verifyState === 'cancelled' && (
  <div className="mb-6 border-l-2 border-[color:var(--rule)] px-4 py-3 font-[family-name:var(--font-barlow)] italic text-[13px] text-[color:var(--ink-2)]">
    Checkout cancelled. No charge was made.
  </div>
)}
```

### Step 5.3 — Add "Cancel subscription" button

Add a `cancelSubscription` function and a cancel button shown only when the user is on a paid plan:

```typescript
const [cancelling, setCancelling] = useState(false);

async function handleCancelSubscription() {
  if (!confirm('Cancel your subscription? You will revert to the free plan immediately.')) return;
  setCancelling(true);
  try {
    await apiFetch('/api/v1/credits/cancel-subscription', { method: 'POST' });
    void qc.invalidateQueries({ queryKey: ['credits'] });
    toast.success('Subscription cancelled. You are now on the free plan.');
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Cancellation failed.');
  } finally {
    setCancelling(false);
  }
}
```

In the plan card section, alongside the "Change plan" button, add — rendered only when `credits?.plan !== 'free'`:

```tsx
{credits?.plan !== 'free' && (
  <GhostButton
    type="button"
    onClick={() => void handleCancelSubscription()}
    disabled={cancelling}
  >
    {cancelling ? 'Cancelling…' : 'Cancel subscription'}
  </GhostButton>
)}
```

### Step 5.4 — Type-check

```bash
pnpm --filter frontend exec tsc --noEmit 2>&1 | head -20
```

---

## Flutterwave setup checklist (one-time, done in FLW dashboard)

- [ ] Create payment plan "Correspondent Monthly" — $49 USD, monthly interval — copy numeric plan ID to `FLW_GROWTH_PLAN_ID`
- [ ] Set webhook URL to `https://yourdomain.com/webhooks/flutterwave` listening for `charge.completed` and `subscription.cancelled`
- [ ] Set a Secret Hash in FLW dashboard → Webhooks — copy to `FLW_SECRET_HASH`
- [ ] Copy Secret Key and Public Key to env — use test keys during development
- [ ] For local webhook testing: use ngrok (`ngrok http 4000`) and register the ngrok URL temporarily

## Verification

After all tasks:

1. **Type-check clean** on backend and frontend
2. **Manual test flow** (test API keys, FLW test cards):
   - Click "Change plan" → Growth → browser opens FLW hosted checkout
   - Pay with test card `5531 8866 5214 2950` (FLW Mastercard test card, any expiry, CVV 564)
   - Redirected back to billing page — "Confirming payment…" banner → "Payment confirmed"
   - Credits balance shows 200 monthly credits
3. **Top-up flow**: click "Top up" → select package → FLW checkout → verify → top-up bucket increases
4. **Cancel**: billing page shows "Cancel subscription" → click → confirm → reverts to free plan
5. **Webhook test**: use ngrok + test a `charge.completed` event via FLW dashboard test tools
