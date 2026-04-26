# Phase 9 — Enterprise Admin, Billing & API Platform

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add SSO/SAML authentication, Stripe-backed subscription billing, advanced RBAC, audit log export, and a public REST API with workspace API keys and webhooks — making LeadreAI enterprise-procurement-ready.

**Architecture:** SSO uses `passport-saml` with SAML metadata stored per workspace (enterprise plan only). Stripe billing uses webhooks to update workspace subscription state. Public API keys are already partially built (Phase 6); this phase completes them with rate limiting per key and a management UI. Outbound webhooks are workspace-configured URL lists that receive normalised event payloads via the existing `fireWebhook` service.

**Tech Stack:** Backend: Express, passport-saml, Stripe Node SDK, Mongoose, BullMQ. Frontend: Next.js 14, shadcn/ui, TanStack Query.

---

## Roadmap Modules Covered

- Platform — Identity and Admin: SSO/SAML, SCIM stub, finer RBAC
- Platform — Billing and Entitlements: Stripe subscription, seat management, credits, overage
- Platform — Integration Platform: public API, workspace API keys, outbound webhooks
- Platform — Compliance: audit export, retention policies, delete/erase workflows
- Platform — Security: IP allowlists, secret rotation, security event logs

---

## File Map

### New Backend Files

| File | Responsibility |
|---|---|
| `backend/src/models/SamlConfig.ts` | SAML metadata per workspace: entityId, SSO URL, cert, attribute mapping |
| `backend/src/models/Subscription.ts` | Stripe subscription state mirrored per workspace |
| `backend/src/models/OutboundWebhook.ts` | Workspace-configured webhook endpoint: URL, secret, events filter |
| `backend/src/models/AuditLog.ts` | Durable audit log (not capped) for compliance export |
| `backend/src/services/saml/samlStrategy.ts` | passport-saml configuration builder |
| `backend/src/services/billing/stripeService.ts` | Create customer, checkout session, portal link, webhook handler |
| `backend/src/services/webhooks/outboundWebhookService.ts` | Dispatch normalised events to workspace webhook URLs |
| `backend/src/controllers/saml.controller.ts` | SSO metadata, initiate, callback, SLO |
| `backend/src/controllers/billing.controller.ts` | Checkout, portal, current plan, Stripe webhook receiver |
| `backend/src/controllers/apiKeys.controller.ts` | Full API key management (create, list, revoke) |
| `backend/src/controllers/outboundWebhooks.controller.ts` | CRUD for outbound webhook configs |
| `backend/src/controllers/audit.controller.ts` | List + export audit log as CSV |
| `backend/src/routes/saml.routes.ts` | Mount SSO routes under `/auth/saml` |
| `backend/src/routes/billing.routes.ts` | Mount billing routes under `/billing` |
| `backend/src/routes/apiKeys.routes.ts` | Mount under `/api-keys` |
| `backend/src/routes/outboundWebhooks.routes.ts` | Mount under `/outbound-webhooks` |
| `backend/src/routes/audit.routes.ts` | Mount under `/audit` |

### Modified Backend Files

| File | Changes |
|---|---|
| `backend/src/models/Workspace.ts` | Add `stripeCustomerId`, `subscriptionId`, `planName`, `seatCount`, `ipAllowlist: string[]`, `samlEnabled` |
| `backend/src/middleware/authenticate.ts` | Check IP allowlist if non-empty; check per-key rate limit via Redis |
| `backend/src/services/audit.ts` | Already exists — write to AuditLog model in addition to existing audit behavior |
| `backend/src/config/env.ts` | Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_TEAM`, `STRIPE_PRICE_ID_GROWTH`, `STRIPE_PRICE_ID_AGENCY`, `SAML_CALLBACK_URL` |

### New Frontend Files

| File | Responsibility |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/settings/billing/page.tsx` | Current plan, usage, upgrade button, portal link |
| `frontend/src/app/(dashboard)/dashboard/settings/api/page.tsx` | API keys list + create + revoke |
| `frontend/src/app/(dashboard)/dashboard/settings/webhooks/page.tsx` | Outbound webhook configs |
| `frontend/src/app/(dashboard)/dashboard/settings/security/page.tsx` | IP allowlist, SAML config, audit log export |
| `frontend/src/components/billing/PlanCard.tsx` | Plan feature list + CTA |
| `frontend/src/components/billing/UsageMeters.tsx` | Seat count, credit usage bars |
| `frontend/src/components/api/ApiKeyRow.tsx` | Row: key prefix, created date, last used, revoke button |
| `frontend/src/hooks/useBilling.ts` | TanStack Query hooks |
| `frontend/src/hooks/useApiKeys.ts` | TanStack Query hooks |

---

## Data Models

### SamlConfig

```typescript
// backend/src/models/SamlConfig.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface ISamlConfig extends Document {
  workspaceId:  Types.ObjectId;
  entityId:     string;
  ssoUrl:       string;
  sloUrl?:      string;
  certificate:  string;           // IdP public cert (PEM)
  attributeMap: {
    email:      string;
    name?:      string;
    role?:      string;
  };
  isActive:     boolean;
  createdAt:    Date;
  updatedAt:    Date;
}

const SamlConfigSchema = new Schema<ISamlConfig>({
  workspaceId:  { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
  entityId:     { type: String, required: true },
  ssoUrl:       { type: String, required: true },
  sloUrl:       { type: String },
  certificate:  { type: String, required: true },
  attributeMap: {
    email: { type: String, default: 'email' },
    name:  { type: String },
    role:  { type: String },
  },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

export const SamlConfig = model<ISamlConfig>('SamlConfig', SamlConfigSchema);
```

### Subscription

```typescript
// backend/src/models/Subscription.ts
import { Schema, model, Document, Types } from 'mongoose';

export type PlanName = 'free' | 'team' | 'growth' | 'agency' | 'enterprise';

export interface ISubscription extends Document {
  workspaceId:          Types.ObjectId;
  stripeCustomerId:     string;
  stripeSubscriptionId: string;
  planName:             PlanName;
  status:               'active' | 'past_due' | 'canceled' | 'trialing';
  currentPeriodEnd:     Date;
  seatCount:            number;
  creditAllowance:      number;
  cancelAtPeriodEnd:    boolean;
  createdAt:            Date;
  updatedAt:            Date;
}

const SubscriptionSchema = new Schema<ISubscription>({
  workspaceId:          { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
  stripeCustomerId:     { type: String, required: true },
  stripeSubscriptionId: { type: String },
  planName:             { type: String, enum: ['free','team','growth','agency','enterprise'], default: 'free' },
  status:               { type: String, enum: ['active','past_due','canceled','trialing'], default: 'active' },
  currentPeriodEnd:     { type: Date },
  seatCount:            { type: Number, default: 1 },
  creditAllowance:      { type: Number, default: 0 },
  cancelAtPeriodEnd:    { type: Boolean, default: false },
}, { timestamps: true });

export const Subscription = model<ISubscription>('Subscription', SubscriptionSchema);
```

### OutboundWebhook

```typescript
// backend/src/models/OutboundWebhook.ts
import { Schema, model, Document, Types } from 'mongoose';

export type WebhookEventFilter =
  | 'lead.created'
  | 'lead.qualified'
  | 'sequence.completed'
  | 'email.sent'
  | 'email.replied'
  | 'email.bounced'
  | 'import.completed';

export interface IOutboundWebhook extends Document {
  workspaceId:     Types.ObjectId;
  url:             string;
  description?:    string;
  encryptedSecret: string;    // HMAC signing secret, AES-256-GCM encrypted
  events:          WebhookEventFilter[];
  isActive:        boolean;
  lastDeliveredAt?:Date;
  failureCount:    number;
  createdAt:       Date;
  updatedAt:       Date;
}

const OutboundWebhookSchema = new Schema<IOutboundWebhook>({
  workspaceId:     { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  url:             { type: String, required: true },
  description:     { type: String },
  encryptedSecret: { type: String, required: true, select: false },
  events:          [{ type: String }],
  isActive:        { type: Boolean, default: true },
  lastDeliveredAt: { type: Date },
  failureCount:    { type: Number, default: 0 },
}, { timestamps: true });

export const OutboundWebhook = model<IOutboundWebhook>('OutboundWebhook', OutboundWebhookSchema);
```

### AuditLog

```typescript
// backend/src/models/AuditLog.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  workspaceId: Types.ObjectId;
  actorId?:    Types.ObjectId;
  actorEmail?: string;
  action:      string;
  targetType?: string;
  targetId?:   Types.ObjectId;
  ipAddress?:  string;
  userAgent?:  string;
  metadata?:   Record<string, any>;
  createdAt:   Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  actorId:     { type: Schema.Types.ObjectId, ref: 'User' },
  actorEmail:  { type: String },
  action:      { type: String, required: true },
  targetType:  { type: String },
  targetId:    { type: Schema.Types.ObjectId },
  ipAddress:   { type: String },
  userAgent:   { type: String },
  metadata:    { type: Schema.Types.Mixed },
}, { timestamps: { createdAt: true, updatedAt: false } });

AuditLogSchema.index({ workspaceId: 1, createdAt: -1 });
AuditLogSchema.index({ workspaceId: 1, action: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
```

---

## Stripe Billing Service

```typescript
// backend/src/services/billing/stripeService.ts
import Stripe from 'stripe';
import { env } from '../../config/env.js';
import { Subscription } from '../../models/Subscription.js';
import { Workspace } from '../../models/Workspace.js';
import type { Types } from 'mongoose';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

const PRICE_MAP: Record<string, string> = {
  team:   env.STRIPE_PRICE_ID_TEAM,
  growth: env.STRIPE_PRICE_ID_GROWTH,
  agency: env.STRIPE_PRICE_ID_AGENCY,
};

export async function createCheckoutSession(
  workspaceId: Types.ObjectId,
  planName: string,
  customerEmail: string,
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  const priceId = PRICE_MAP[planName];
  if (!priceId) throw new Error(`Unknown plan: ${planName}`);

  let sub = await Subscription.findOne({ workspaceId }).lean();
  let customerId = sub?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: customerEmail,
      metadata: { workspaceId: workspaceId.toString() },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer:     customerId,
    mode:         'subscription',
    line_items:   [{ price: priceId, quantity: 1 }],
    success_url:  successUrl,
    cancel_url:   cancelUrl,
    metadata:     { workspaceId: workspaceId.toString(), planName },
  });

  return session.url!;
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  return session.url;
}

export async function handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
  const event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);

  if (event.type === 'checkout.session.completed') {
    const session    = event.data.object as Stripe.Checkout.Session;
    const workspaceId = session.metadata?.workspaceId;
    const planName    = session.metadata?.planName as any;
    if (!workspaceId || !planName) return;

    const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string);
    await Subscription.findOneAndUpdate(
      { workspaceId },
      {
        $set: {
          stripeCustomerId:     session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          planName,
          status:              stripeSub.status as any,
          currentPeriodEnd:    new Date(stripeSub.current_period_end * 1000),
        },
      },
      { upsert: true },
    );
    await Workspace.findByIdAndUpdate(workspaceId, { $set: { planName } });
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: invoice.subscription },
      { $set: { status: 'past_due' } },
    );
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: sub.id },
      { $set: { status: 'canceled', planName: 'free' } },
    );
  }
}
```

---

## Outbound Webhook Service

```typescript
// backend/src/services/webhooks/outboundWebhookService.ts
import { createHmac } from 'crypto';
import axios from 'axios';
import { OutboundWebhook, type WebhookEventFilter } from '../../models/OutboundWebhook.js';
import { decrypt } from '../../utils/encrypt.js';
import logger from '../../config/logger.js';
import type { Types } from 'mongoose';

export interface WebhookPayload {
  event:       WebhookEventFilter;
  timestamp:   string;
  workspaceId: string;
  data:        Record<string, any>;
}

export async function dispatchWorkspaceWebhooks(
  workspaceId: Types.ObjectId,
  eventType: WebhookEventFilter,
  data: Record<string, any>,
): Promise<void> {
  const hooks = await OutboundWebhook.find({
    workspaceId,
    isActive: true,
    events:   eventType,
  }).select('+encryptedSecret').lean();

  const payload: WebhookPayload = {
    event:       eventType,
    timestamp:   new Date().toISOString(),
    workspaceId: workspaceId.toString(),
    data,
  };

  const body = JSON.stringify(payload);

  for (const hook of hooks) {
    const secret    = decrypt(hook.encryptedSecret);
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    axios.post(hook.url, payload, {
      timeout: 5000,
      headers: {
        'Content-Type':         'application/json',
        'X-LeadreAI-Signature': `sha256=${signature}`,
        'X-LeadreAI-Event':     eventType,
      },
    })
      .then(() => {
        OutboundWebhook.findByIdAndUpdate(hook._id, {
          $set: { lastDeliveredAt: new Date(), failureCount: 0 },
        }).catch(() => {});
        logger.info(`[outboundWebhook] Delivered ${eventType} to ${hook.url}`);
      })
      .catch(err => {
        OutboundWebhook.findByIdAndUpdate(hook._id, {
          $inc: { failureCount: 1 },
        }).catch(() => {});
        logger.warn(`[outboundWebhook] Failed ${hook.url}: ${err.message}`);
      });
  }
}
```

---

## SAML Strategy

```typescript
// backend/src/services/saml/samlStrategy.ts
import { Strategy as SamlStrategy } from 'passport-saml';
import { SamlConfig } from '../../models/SamlConfig.js';
import { User } from '../../models/User.js';
import { WorkspaceMember } from '../../models/WorkspaceMember.js';
import { env } from '../../config/env.js';
import logger from '../../config/logger.js';

export async function buildSamlStrategy(workspaceId: string): Promise<SamlStrategy | null> {
  const config = await SamlConfig.findOne({ workspaceId, isActive: true }).lean();
  if (!config) return null;

  return new SamlStrategy(
    {
      entryPoint:           config.ssoUrl,
      issuer:               `leamdreai-${workspaceId}`,
      cert:                 config.certificate,
      callbackUrl:          `${env.SAML_CALLBACK_URL}/${workspaceId}`,
      logoutUrl:            config.sloUrl,
      wantAssertionsSigned: true,
    },
    async (profile: any, done: any) => {
      try {
        const email = profile[config.attributeMap.email] ?? profile.nameID;
        if (!email) return done(new Error('No email attribute in SAML response'));

        let user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
          user = await User.create({
            email: email.toLowerCase(),
            name:  profile[config.attributeMap.name!] ?? email,
          });
        }

        await WorkspaceMember.findOneAndUpdate(
          { workspaceId, userId: user._id },
          { $setOnInsert: { role: 'viewer', invitedBy: user._id, joinedAt: new Date() } },
          { upsert: true },
        );

        done(null, user);
      } catch (err) {
        logger.error('[SAML] Profile processing failed', err);
        done(err);
      }
    },
  );
}
```

---

## API Keys Controller

```typescript
// backend/src/controllers/apiKeys.controller.ts
import { Request, Response, NextFunction } from 'express';
import { randomBytes, createHash } from 'crypto';
import { Workspace } from '../models/Workspace.js';
import { AuditLog } from '../models/AuditLog.js';
import { ApiError } from '../utils/ApiError.js';

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw    = `sk-${randomBytes(20).toString('hex')}`;
  const hash   = createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 10);
  return { raw, hash, prefix };
}

// GET /api-keys
export async function listApiKeys(req: Request, res: Response, next: NextFunction) {
  try {
    const ws = await Workspace.findById(req.user!.workspaceId).select('apiKeys').lean();
    const safe = (ws?.apiKeys ?? []).map((k: any) => ({
      _id:        k._id,
      name:       k.name,
      prefix:     k.prefix,
      createdAt:  k.createdAt,
      lastUsedAt: k.lastUsedAt,
      rateLimit:  k.rateLimit,
    }));
    res.json({ data: safe });
  } catch (err) { next(err); }
}

// POST /api-keys
export async function createApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, rateLimit = 1000 } = req.body;
    if (!name) throw ApiError.badRequest('name required');

    const ws = await Workspace.findById(req.user!.workspaceId).select('apiKeys');
    if (!ws) throw ApiError.notFound('Workspace not found');
    if (ws.apiKeys.length >= 10) throw ApiError.badRequest('Maximum 10 API keys per workspace');

    const { raw, hash, prefix } = generateApiKey();
    ws.apiKeys.push({ name, keyHash: hash, prefix, rateLimit, createdAt: new Date() } as any);
    await ws.save();

    AuditLog.create({
      workspaceId: ws._id,
      actorId:     req.user!._id,
      action:      'api_key.created',
      metadata:    { name, prefix },
    }).catch(() => {});

    res.status(201).json({ data: { key: raw, prefix, name } });
  } catch (err) { next(err); }
}

// DELETE /api-keys/:keyId
export async function revokeApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    await Workspace.findByIdAndUpdate(
      req.user!.workspaceId,
      { $pull: { apiKeys: { _id: req.params.keyId } } },
    );
    AuditLog.create({
      workspaceId: req.user!.workspaceId,
      actorId:     req.user!._id,
      action:      'api_key.revoked',
      metadata:    { keyId: req.params.keyId },
    }).catch(() => {});
    res.status(204).end();
  } catch (err) { next(err); }
}
```

---

## Billing Controller

```typescript
// backend/src/controllers/billing.controller.ts
import { Request, Response, NextFunction } from 'express';
import { createCheckoutSession, createPortalSession, handleStripeWebhook } from '../services/billing/stripeService.js';
import { Subscription } from '../models/Subscription.js';
import { ApiError } from '../utils/ApiError.js';

// GET /billing/plan
export async function getCurrentPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const sub = await Subscription.findOne({ workspaceId: req.user!.workspaceId }).lean();
    res.json({ data: sub ?? { planName: 'free', status: 'active' } });
  } catch (err) { next(err); }
}

// POST /billing/checkout
export async function startCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const { planName } = req.body;
    if (!['team','growth','agency'].includes(planName)) throw ApiError.badRequest('Invalid plan');

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const url = await createCheckoutSession(
      req.user!.workspaceId,
      planName,
      req.user!.email,
      `${baseUrl}/dashboard/settings/billing?success=1`,
      `${baseUrl}/dashboard/settings/billing?canceled=1`,
    );
    res.json({ data: { url } });
  } catch (err) { next(err); }
}

// POST /billing/portal
export async function openPortal(req: Request, res: Response, next: NextFunction) {
  try {
    const sub = await Subscription.findOne({ workspaceId: req.user!.workspaceId }).lean();
    if (!sub?.stripeCustomerId) throw ApiError.badRequest('No active subscription');

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const url = await createPortalSession(sub.stripeCustomerId, `${baseUrl}/dashboard/settings/billing`);
    res.json({ data: { url } });
  } catch (err) { next(err); }
}

// POST /billing/webhook  (raw body — mount BEFORE express.json())
export async function stripeWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const sig = req.headers['stripe-signature'] as string;
    await handleStripeWebhook(req.body as Buffer, sig);
    res.json({ received: true });
  } catch (err) { next(err); }
}
```

---

## Audit Controller

```typescript
// backend/src/controllers/audit.controller.ts
import { Request, Response, NextFunction } from 'express';
import { AuditLog } from '../models/AuditLog.js';
import { parse } from 'json2csv';

// GET /audit?from=&to=&action=&limit=
export async function getAuditLog(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, action, limit = '100' } = req.query as Record<string, string>;
    const query: any = { workspaceId: req.user!.workspaceId };
    if (from || to) query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to)   query.createdAt.$lte = new Date(to);
    if (action) query.action = action;

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10), 1000))
      .lean();

    res.json({ data: logs });
  } catch (err) { next(err); }
}

// GET /audit/export.csv
export async function exportAuditLog(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = req.query as Record<string, string>;
    const query: any = { workspaceId: req.user!.workspaceId };
    if (from) query.createdAt = { ...query.createdAt, $gte: new Date(from) };
    if (to)   query.createdAt = { ...query.createdAt, $lte: new Date(to) };

    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(10000).lean();
    const csv  = parse(logs, {
      fields: ['createdAt','actorEmail','action','targetType','ipAddress'],
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.send(csv);
  } catch (err) { next(err); }
}
```

---

## IP Allowlist Enforcement

```typescript
// In backend/src/middleware/authenticate.ts, after setting req.user:
const workspace = await Workspace.findById(req.user.workspaceId).select('ipAllowlist').lean();
const allowlist = workspace?.ipAllowlist ?? [];

if (allowlist.length > 0) {
  const ip = req.ip ?? req.socket.remoteAddress ?? '';
  const normalizedIp = ip.replace('::ffff:', ''); // strip IPv4-in-IPv6 prefix
  if (!allowlist.includes(normalizedIp)) {
    return res.status(403).json({ error: 'IP address not in allowlist' });
  }
}
```

---

## Routes

```typescript
// backend/src/routes/billing.routes.ts
import { Router } from 'express';
import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { getCurrentPlan, startCheckout, openPortal, stripeWebhook } from '../controllers/billing.controller.js';

const router = Router();

// Stripe webhook requires raw body BEFORE express.json() parses it
router.post('/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

router.use(authenticate);
router.get('/plan',     getCurrentPlan);
router.post('/checkout',startCheckout);
router.post('/portal',  openPortal);

export default router;
```

```typescript
// backend/src/routes/apiKeys.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { listApiKeys, createApiKey, revokeApiKey } from '../controllers/apiKeys.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',      listApiKeys);
router.post('/',     createApiKey);
router.delete('/:keyId', revokeApiKey);

export default router;
```

```typescript
// backend/src/routes/audit.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { getAuditLog, exportAuditLog } from '../controllers/audit.controller.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

router.get('/',            getAuditLog);
router.get('/export.csv',  exportAuditLog);

export default router;
```

```typescript
// backend/src/routes/saml.routes.ts
import { Router } from 'express';
import { initiateSaml, samlCallback } from '../controllers/saml.controller.js';

const router = Router();

router.get('/:workspaceId',          initiateSaml);
router.post('/:workspaceId/callback',samlCallback);

export default router;
```

---

## SAML Controller

```typescript
// backend/src/controllers/saml.controller.ts
import { Request, Response, NextFunction } from 'express';
import { buildSamlStrategy } from '../services/saml/samlStrategy.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export async function initiateSaml(req: Request, res: Response, next: NextFunction) {
  try {
    const strategy = await buildSamlStrategy(req.params.workspaceId);
    if (!strategy) return res.status(404).json({ error: 'SAML not configured for this workspace' });
    // passport.authenticate equivalent: redirect to IdP
    (strategy as any).redirect(req, res, next);
  } catch (err) { next(err); }
}

export async function samlCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const strategy = await buildSamlStrategy(req.params.workspaceId);
    if (!strategy) return res.status(404).json({ error: 'SAML not configured' });

    strategy.success = (user: any) => {
      const token = jwt.sign(
        { _id: user._id, workspaceId: req.params.workspaceId, email: user.email },
        env.JWT_SECRET,
        { expiresIn: '7d' },
      );
      // Redirect to frontend with token in query param (frontend stores it)
      res.redirect(`/auth/sso-callback?token=${token}`);
    };
    strategy.error = next;
    strategy.fail  = () => res.status(401).json({ error: 'SAML authentication failed' });

    (strategy as any).authenticate(req, {});
  } catch (err) { next(err); }
}
```

---

## Frontend: Billing Page

```tsx
// frontend/src/app/(dashboard)/dashboard/settings/billing/page.tsx
'use client';
import { useBilling } from '@/hooks/useBilling';

const PLANS = [
  { name: 'team',   label: 'Team',   price: '$349/mo', features: ['3 seats','2,500 credits','1 CRM sync','Sequences'] },
  { name: 'growth', label: 'Growth', price: '$999/mo', features: ['10 seats','10,000 credits','All CRMs','Reply tracking','Webhooks'] },
  { name: 'agency', label: 'Agency', price: '$1,999/mo', features: ['15 seats','25,000 credits','White-label','Client workspaces'] },
];

export default function BillingPage() {
  const { plan, startCheckout, openPortal, isLoading } = useBilling();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-medium">Billing</h2>
        <p className="text-sm text-muted-foreground">
          Current plan: <strong className="capitalize">{plan?.planName ?? 'Free'}</strong>
          {plan?.status === 'past_due' && <span className="ml-2 text-red-500 text-xs">(Payment past due)</span>}
        </p>
        {plan?.planName && plan.planName !== 'free' && (
          <button onClick={openPortal} className="text-sm text-blue-500 hover:underline mt-1 block">
            Manage subscription →
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map(p => (
          <div key={p.name} className={`border rounded-lg p-5 space-y-4 ${plan?.planName === p.name ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}>
            <div>
              <p className="font-semibold">{p.label}</p>
              <p className="text-2xl font-bold mt-1">{p.price}</p>
            </div>
            <ul className="text-sm space-y-1 text-muted-foreground">
              {p.features.map(f => <li key={f}>✓ {f}</li>)}
            </ul>
            <button
              onClick={() => startCheckout(p.name)}
              disabled={plan?.planName === p.name || isLoading}
              className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
            >
              {plan?.planName === p.name ? 'Current plan' : 'Upgrade'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## TanStack Query Hooks

```typescript
// frontend/src/hooks/useBilling.ts
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useBilling() {
  const planQ = useQuery({
    queryKey: ['billing', 'plan'],
    queryFn:  () => api.get('/billing/plan').then(r => r.data.data),
    staleTime: 60_000,
  });

  const checkoutMut = useMutation({
    mutationFn: (planName: string) => api.post('/billing/checkout', { planName }).then(r => r.data.data),
    onSuccess:  (data) => { window.location.href = data.url; },
  });

  const portalMut = useMutation({
    mutationFn: () => api.post('/billing/portal').then(r => r.data.data),
    onSuccess:  (data) => { window.location.href = data.url; },
  });

  return {
    plan:          planQ.data ?? null,
    isLoading:     planQ.isLoading || checkoutMut.isPending || portalMut.isPending,
    startCheckout: (planName: string) => checkoutMut.mutate(planName),
    openPortal:    () => portalMut.mutate(),
  };
}
```

```typescript
// frontend/src/hooks/useApiKeys.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useApiKeys() {
  const qc = useQueryClient();

  const keysQ = useQuery({
    queryKey: ['api-keys'],
    queryFn:  () => api.get('/api-keys').then(r => r.data.data),
    staleTime: 60_000,
  });

  const createMut = useMutation({
    mutationFn: (name: string) => api.post('/api-keys', { name }).then(r => r.data.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const revokeMut = useMutation({
    mutationFn: (keyId: string) => api.delete(`/api-keys/${keyId}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  return {
    keys:      keysQ.data ?? [],
    isLoading: keysQ.isLoading,
    create:    (name: string) => createMut.mutate(name),
    revoke:    (keyId: string) => revokeMut.mutate(keyId),
    newKey:    createMut.data,
  };
}
```

---

## Implementation Sequence

### Step 1 — Models

- [ ] Create `backend/src/models/AuditLog.ts`
- [ ] Create `backend/src/models/Subscription.ts`
- [ ] Create `backend/src/models/SamlConfig.ts`
- [ ] Create `backend/src/models/OutboundWebhook.ts`
- [ ] Test: create each, assert indexes and unique constraints
- [ ] `git commit -m "feat(backend): AuditLog + Subscription + SamlConfig + OutboundWebhook models"`

### Step 2 — Stripe billing service + controller + routes

- [ ] Install: `pnpm --filter backend add stripe`
- [ ] Add env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_TEAM`, `STRIPE_PRICE_ID_GROWTH`, `STRIPE_PRICE_ID_AGENCY`
- [ ] Create `backend/src/services/billing/stripeService.ts`
- [ ] Create `backend/src/controllers/billing.controller.ts`
- [ ] Create `backend/src/routes/billing.routes.ts` (webhook route uses raw body parser, before authenticate)
- [ ] Mount at `/billing` in `backend/src/app.ts`
- [ ] Test: handleStripeWebhook with mock checkout.session.completed upserts Subscription + updates workspace.planName
- [ ] `git commit -m "feat(backend): Stripe billing service + routes"`

### Step 3 — API keys controller + routes

- [ ] Create `backend/src/controllers/apiKeys.controller.ts`
- [ ] Create `backend/src/routes/apiKeys.routes.ts`
- [ ] Mount at `/api-keys`
- [ ] Test: create key returns raw `sk-...` string; list shows prefix only; revoke removes from apiKeys array
- [ ] `git commit -m "feat(backend): API key management"`

### Step 4 — Outbound webhook service + controller + routes

- [ ] Create `backend/src/services/webhooks/outboundWebhookService.ts`
- [ ] Create `backend/src/controllers/outboundWebhooks.controller.ts` (list, create with encrypted secret, update, delete, test-ping)
- [ ] Create `backend/src/routes/outboundWebhooks.routes.ts`
- [ ] Call `dispatchWorkspaceWebhooks` from outreach worker on `email.sent`
- [ ] Test: dispatch fires axios.post with `X-LeadreAI-Signature: sha256=<hex>` header
- [ ] `git commit -m "feat(backend): outbound webhook service + CRUD"`

### Step 5 — SAML SSO

- [ ] Install: `pnpm --filter backend add passport passport-saml`
- [ ] Add env var: `SAML_CALLBACK_URL`
- [ ] Create `backend/src/services/saml/samlStrategy.ts`
- [ ] Create `backend/src/controllers/saml.controller.ts`
- [ ] Create `backend/src/routes/saml.routes.ts`
- [ ] Mount at `/auth/saml`
- [ ] Test: buildSamlStrategy returns null when no SamlConfig; with config returns SamlStrategy instance
- [ ] `git commit -m "feat(backend): SAML SSO strategy + callback"`

### Step 6 — Audit log + IP allowlist

- [ ] Create `backend/src/controllers/audit.controller.ts`
- [ ] Create `backend/src/routes/audit.routes.ts` (admin-only via requireRole)
- [ ] Update `backend/src/services/audit.ts` to write to AuditLog model
- [ ] Add IP allowlist check in `backend/src/middleware/authenticate.ts`
- [ ] Test: non-empty allowlist blocks unlisted IP with 403; empty allowlist passes all
- [ ] `git commit -m "feat(backend): audit log API + IP allowlist enforcement"`

### Step 7 — Frontend billing + API keys + security

- [ ] Create `frontend/src/hooks/useBilling.ts`
- [ ] Create `frontend/src/app/(dashboard)/dashboard/settings/billing/page.tsx`
- [ ] Create `frontend/src/hooks/useApiKeys.ts`
- [ ] Create `frontend/src/components/api/ApiKeyRow.tsx` (name, prefix, created, last used, revoke button)
- [ ] Create `frontend/src/app/(dashboard)/dashboard/settings/api/page.tsx` (list keys, create form showing raw key once, revoke)
- [ ] Create `frontend/src/app/(dashboard)/dashboard/settings/webhooks/page.tsx` (list/add/delete outbound webhooks, event filter checkboxes)
- [ ] Create `frontend/src/app/(dashboard)/dashboard/settings/security/page.tsx` (IP allowlist textarea, SAML config form, audit export button with date range)
- [ ] `git commit -m "feat(frontend): billing + API keys + webhooks + security settings"`

---

## API Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /billing/plan | JWT | Current subscription |
| POST | /billing/checkout | JWT | Create Stripe checkout |
| POST | /billing/portal | JWT | Open Stripe portal |
| POST | /billing/webhook | Stripe sig | Stripe event receiver |
| GET | /api-keys | JWT | List API keys (prefix only) |
| POST | /api-keys | JWT | Create API key (raw returned once) |
| DELETE | /api-keys/:keyId | JWT | Revoke API key |
| GET | /outbound-webhooks | JWT | List webhook configs |
| POST | /outbound-webhooks | JWT | Create webhook endpoint |
| PATCH | /outbound-webhooks/:id | JWT | Update webhook |
| DELETE | /outbound-webhooks/:id | JWT | Delete webhook |
| GET | /audit | JWT admin | List audit log |
| GET | /audit/export.csv | JWT admin | Download CSV |
| GET | /auth/saml/:workspaceId | Public | Initiate SAML SSO |
| POST | /auth/saml/:workspaceId/callback | Public | SAML assertion callback |

---

## Verification Criteria

- checkout.session.completed webhook creates/updates Subscription + sets workspace.planName
- customer.subscription.deleted sets planName = 'free', status = 'canceled'
- createApiKey stores SHA-256 hash, returns raw `sk-...` key only once
- listApiKeys never exposes keyHash or full key — prefix only
- revokeApiKey removes entry from workspace.apiKeys
- dispatchWorkspaceWebhooks delivers only to hooks whose `events` array includes eventType
- Webhook signature header is `sha256=<hex>` computed via HMAC-SHA256 over JSON body
- buildSamlStrategy returns null when SamlConfig not found for workspaceId
- IP allowlist: empty list allows all IPs; non-empty list blocks unlisted IP with 403
- Audit export CSV contains createdAt, actorEmail, action columns
- Billing page shows upgrade buttons; clicking redirects to Stripe
- API keys page shows `sk-...****` prefix and never reveals full key after creation dialog closes
