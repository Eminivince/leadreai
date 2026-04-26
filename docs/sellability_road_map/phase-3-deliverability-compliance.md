# Phase 3 — Deliverability Workspace & Compliance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give every workspace sending controls and health visibility so customers never accidentally burn a domain.

**Architecture:** DNS checks run on-demand and on a nightly cron. Sending identities (SMTP configs) are stored per workspace with encrypted credentials and linked to a daily cap tracker in Redis. Suppression list is stored in MongoDB with GDPR-compliant erase endpoints. A deliverability dashboard surfaces all health signals.

**Tech Stack:** Backend: Express, Mongoose, BullMQ, IORedis, dns/promises (Node built-in), nodemailer (SMTP verify), Resend/SendGrid webhook verification. Frontend: Next.js 14, shadcn/ui, Recharts, TanStack Query.

---

## Roadmap Modules Covered

- Module 5 — Deliverability Workspace (SPF/DKIM/DMARC checks, domain health, inbox rotation, daily send caps, warm-up)
- Module 4 partial — Suppression list management, bounce ingestion (extends Phase 2 webhook receiver)
- Platform — Compliance: retention policies, audit export stub, delete/erase workflows

---

## File Map

### New Backend Files

| File | Responsibility |
|---|---|
| `backend/src/services/dns/dnsChecker.ts` | Resolves TXT records for SPF, DKIM, DMARC; returns structured health result |
| `backend/src/services/dns/domainHealth.ts` | Orchestrates multi-check run, caches in Redis 1 h TTL |
| `backend/src/services/smtp/smtpVerifier.ts` | Verifies SMTP credentials with nodemailer createTransport().verify() |
| `backend/src/services/suppression/suppressionService.ts` | Upsert/query/erase suppression entries |
| `backend/src/services/warmup/warmupScheduler.ts` | Daily warm-up ramp plan per sending identity |
| `backend/src/controllers/deliverability.controller.ts` | REST handlers for all deliverability endpoints |
| `backend/src/controllers/suppression.controller.ts` | REST handlers for suppression list CRUD |
| `backend/src/routes/deliverability.routes.ts` | Mount deliverability routes under `/deliverability` |
| `backend/src/routes/suppression.routes.ts` | Mount suppression routes under `/suppression` |
| `backend/src/jobs/domainHealthCron.ts` | Nightly BullMQ repeatable job checking all workspace domains |
| `backend/src/models/SendingIdentity.ts` | Mongoose model: SMTP config per workspace (encrypted) |
| `backend/src/models/SuppressionEntry.ts` | Mongoose model: suppressed email/domain + reason + source |
| `backend/src/models/DomainHealthRecord.ts` | Mongoose model: persisted health check results with history |

### Modified Backend Files

| File | Changes |
|---|---|
| `backend/src/models/Workspace.ts` | Add `sendingIdentityIds[]`, `dailySendCap`, `currentDayCount` (Redis-managed), `warmupEnabled`, `warmupDay` |
| `backend/src/utils/encrypt.ts` | Already exists — used for SMTP password encryption |
| `backend/src/config/env.ts` | Add `DOMAIN_HEALTH_CRON`, `WARMUP_MAX_PER_DAY`, `SUPPRESSION_ERASE_GRACE_DAYS` |
| `backend/src/app.ts` | Mount deliverability and suppression routers |
| `workers/src/outreach.worker.ts` | Pre-send: check suppression, check daily cap in Redis before sending |

### New Frontend Files

| File | Responsibility |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/deliverability/page.tsx` | Deliverability dashboard — domain health cards, identity list, warm-up progress |
| `frontend/src/app/(dashboard)/dashboard/deliverability/identities/page.tsx` | Manage sending identities (SMTP configs) |
| `frontend/src/app/(dashboard)/dashboard/deliverability/suppression/page.tsx` | View and manage suppression list |
| `frontend/src/components/deliverability/DomainHealthCard.tsx` | SPF/DKIM/DMARC status card with color-coded badges |
| `frontend/src/components/deliverability/SendingIdentityForm.tsx` | Form to add/edit SMTP identity with verify button |
| `frontend/src/components/deliverability/WarmupProgressBar.tsx` | Bar showing day-over-day ramp |
| `frontend/src/components/deliverability/DailySendCapGauge.tsx` | Gauge showing today's send count vs cap |
| `frontend/src/components/deliverability/SuppressionTable.tsx` | Paginated table: email, reason, date, source, erase button |
| `frontend/src/hooks/useDeliverability.ts` | TanStack Query hooks for health, identities, suppression |

### Modified Frontend Files

| File | Changes |
|---|---|
| `frontend/src/components/layout/Sidebar.tsx` | Add Deliverability nav link |
| `frontend/src/app/(dashboard)/dashboard/settings/page.tsx` | Add "Sending Identities" tab |

---

## Data Models

### SendingIdentity

```typescript
// backend/src/models/SendingIdentity.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface ISendingIdentity extends Document {
  workspaceId: Types.ObjectId;
  name: string;                 // display label, e.g. "Sales Outbox"
  fromName: string;
  fromEmail: string;            // must match SMTP user
  host: string;
  port: number;
  secure: boolean;              // TLS
  user: string;
  encryptedPassword: string;   // AES-256-GCM via encrypt.ts
  isVerified: boolean;
  lastVerifiedAt?: Date;
  dailyCap: number;             // max emails per calendar day
  warmupEnabled: boolean;
  warmupDay: number;            // 0 = not started, 1..N = ramp day
  warmupDailyCap: number;       // computed from warmupDay
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SendingIdentitySchema = new Schema<ISendingIdentity>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  name:            { type: String, required: true },
  fromName:        { type: String, required: true },
  fromEmail:       { type: String, required: true },
  host:            { type: String, required: true },
  port:            { type: Number, default: 587 },
  secure:          { type: Boolean, default: false },
  user:            { type: String, required: true },
  encryptedPassword: { type: String, required: true, select: false },
  isVerified:      { type: Boolean, default: false },
  lastVerifiedAt:  { type: Date },
  dailyCap:        { type: Number, default: 50 },
  warmupEnabled:   { type: Boolean, default: false },
  warmupDay:       { type: Number, default: 0 },
  warmupDailyCap:  { type: Number, default: 0 },
  isActive:        { type: Boolean, default: true },
}, { timestamps: true });

export const SendingIdentity = model<ISendingIdentity>('SendingIdentity', SendingIdentitySchema);
```

### SuppressionEntry

```typescript
// backend/src/models/SuppressionEntry.ts
import { Schema, model, Document, Types } from 'mongoose';

export type SuppressionReason =
  | 'hard_bounce'
  | 'spam_complaint'
  | 'unsubscribe'
  | 'manual'
  | 'invalid_email';

export interface ISuppressionEntry extends Document {
  workspaceId: Types.ObjectId;
  email: string;                // normalized to lowercase
  domain?: string;              // populated for domain-level suppression
  reason: SuppressionReason;
  source: string;               // e.g. 'webhook:resend', 'ui:manual', 'sequence:bounce'
  sourceEventId?: string;       // idempotency key from provider webhook
  notes?: string;
  suppressedAt: Date;
  erasedAt?: Date;              // GDPR erase: PII removed, tombstone kept
}

const SuppressionEntrySchema = new Schema<ISuppressionEntry>({
  workspaceId:   { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  email:         { type: String, required: true, lowercase: true, trim: true },
  domain:        { type: String, lowercase: true },
  reason:        { type: String, enum: ['hard_bounce','spam_complaint','unsubscribe','manual','invalid_email'], required: true },
  source:        { type: String, required: true },
  sourceEventId: { type: String },
  notes:         { type: String },
  suppressedAt:  { type: Date, default: Date.now },
  erasedAt:      { type: Date },
}, { timestamps: true });

// Compound index: one record per email per workspace
SuppressionEntrySchema.index({ workspaceId: 1, email: 1 }, { unique: true, sparse: true });
SuppressionEntrySchema.index({ workspaceId: 1, domain: 1 });

export const SuppressionEntry = model<ISuppressionEntry>('SuppressionEntry', SuppressionEntrySchema);
```

### DomainHealthRecord

```typescript
// backend/src/models/DomainHealthRecord.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IDnsCheckResult {
  pass: boolean;
  raw?: string;       // raw TXT record value
  error?: string;
}

export interface IDomainHealthRecord extends Document {
  workspaceId: Types.ObjectId;
  domain: string;
  spf:   IDnsCheckResult;
  dkim:  IDnsCheckResult & { selector?: string };
  dmarc: IDnsCheckResult;
  overallScore: number;   // 0–100 computed from pass/fail
  checkedAt: Date;
}

const DnsCheckResultSchema = new Schema<IDnsCheckResult>({
  pass:  { type: Boolean, required: true },
  raw:   { type: String },
  error: { type: String },
}, { _id: false });

const DomainHealthSchema = new Schema<IDomainHealthRecord>({
  workspaceId:  { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  domain:       { type: String, required: true },
  spf:          { type: DnsCheckResultSchema, required: true },
  dkim:         { type: new Schema({ pass: Boolean, raw: String, error: String, selector: String }, { _id: false }), required: true },
  dmarc:        { type: DnsCheckResultSchema, required: true },
  overallScore: { type: Number, default: 0 },
  checkedAt:    { type: Date, default: Date.now },
}, { timestamps: true });

DomainHealthSchema.index({ workspaceId: 1, domain: 1, checkedAt: -1 });

export const DomainHealthRecord = model<IDomainHealthRecord>('DomainHealthRecord', DomainHealthSchema);
```

---

## DNS Checker Service

```typescript
// backend/src/services/dns/dnsChecker.ts
import { promises as dns } from 'dns';
import type { IDnsCheckResult } from '../../models/DomainHealthRecord.js';

export async function checkSpf(domain: string): Promise<IDnsCheckResult> {
  try {
    const records = await dns.resolveTxt(domain);
    const flat = records.map(r => r.join('')).filter(r => r.startsWith('v=spf1'));
    if (flat.length === 0) return { pass: false, error: 'No SPF TXT record found' };
    if (flat.length > 1) return { pass: false, raw: flat[0], error: 'Multiple SPF records (RFC violation)' };
    return { pass: true, raw: flat[0] };
  } catch (err: any) {
    return { pass: false, error: err.message };
  }
}

export async function checkDkim(domain: string, selector = 'google'): Promise<IDnsCheckResult & { selector: string }> {
  const dkimHost = `${selector}._domainkey.${domain}`;
  try {
    const records = await dns.resolveTxt(dkimHost);
    const flat = records.map(r => r.join('')).find(r => r.includes('v=DKIM1'));
    if (!flat) return { pass: false, selector, error: `No DKIM record at ${dkimHost}` };
    return { pass: true, raw: flat, selector };
  } catch (err: any) {
    return { pass: false, selector, error: `DKIM lookup failed for selector '${selector}': ${err.message}` };
  }
}

export async function checkDmarc(domain: string): Promise<IDnsCheckResult> {
  const dmarcHost = `_dmarc.${domain}`;
  try {
    const records = await dns.resolveTxt(dmarcHost);
    const flat = records.map(r => r.join('')).find(r => r.startsWith('v=DMARC1'));
    if (!flat) return { pass: false, error: 'No DMARC record found' };
    const policyMatch = flat.match(/p=(\w+)/);
    const policy = policyMatch?.[1] ?? 'none';
    const pass = policy === 'quarantine' || policy === 'reject';
    return { pass, raw: flat, ...(pass ? {} : { error: `DMARC policy is '${policy}' — use quarantine or reject` }) };
  } catch (err: any) {
    return { pass: false, error: err.message };
  }
}

export function computeScore(spf: IDnsCheckResult, dkim: IDnsCheckResult, dmarc: IDnsCheckResult): number {
  let score = 0;
  if (spf.pass) score += 34;
  if (dkim.pass) score += 33;
  if (dmarc.pass) score += 33;
  return score;
}
```

---

## Domain Health Orchestrator (with Redis Cache)

```typescript
// backend/src/services/dns/domainHealth.ts
import { getRedis } from '../../config/redis.js';
import { checkSpf, checkDkim, checkDmarc, computeScore } from './dnsChecker.js';
import { DomainHealthRecord } from '../../models/DomainHealthRecord.js';
import type { Types } from 'mongoose';

const CACHE_TTL_SECONDS = 3600; // 1 hour

export async function runDomainHealthCheck(
  workspaceId: Types.ObjectId,
  domain: string,
  dkimSelector = 'google',
): Promise<InstanceType<typeof DomainHealthRecord>> {
  const cacheKey = `dh:${workspaceId}:${domain}`;
  const redis = getRedis();
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as any;
  }

  const [spf, dkim, dmarc] = await Promise.all([
    checkSpf(domain),
    checkDkim(domain, dkimSelector),
    checkDmarc(domain),
  ]);

  const overallScore = computeScore(spf, dkim, dmarc);

  const record = await DomainHealthRecord.findOneAndUpdate(
    { workspaceId, domain },
    { $set: { spf, dkim, dmarc, overallScore, checkedAt: new Date() } },
    { upsert: true, new: true },
  );

  await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(record));
  return record;
}

export async function invalidateDomainHealthCache(workspaceId: string, domain: string): Promise<void> {
  await getRedis().del(`dh:${workspaceId}:${domain}`);
}
```

---

## SMTP Verifier

```typescript
// backend/src/services/smtp/smtpVerifier.ts
import nodemailer from 'nodemailer';
import { decrypt } from '../../utils/encrypt.js';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  encryptedPassword: string;
}

export async function verifySmtpCredentials(config: SmtpConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const password = decrypt(config.encryptedPassword);
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: password },
      connectionTimeout: 8000,
      greetingTimeout: 5000,
    });
    await transporter.verify();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
```

---

## Daily Send Cap — Redis Counter Pattern

```typescript
// backend/src/services/smtp/sendCapTracker.ts
import { getRedis } from '../../config/redis.js';

function todayKey(identityId: string): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  return `sendcap:${identityId}:${ymd}`;
}

export async function getTodayCount(identityId: string): Promise<number> {
  const val = await getRedis().get(todayKey(identityId));
  return val ? parseInt(val, 10) : 0;
}

export async function incrementSendCount(identityId: string): Promise<number> {
  const key = todayKey(identityId);
  const redis = getRedis();
  const newCount = await redis.incr(key);
  if (newCount === 1) {
    // First increment today: set expiry to end of day + 1 hour buffer
    const secondsUntilMidnight = 86400 - (Math.floor(Date.now() / 1000) % 86400);
    await redis.expire(key, secondsUntilMidnight + 3600);
  }
  return newCount;
}

export async function checkCapAndIncrement(
  identityId: string,
  cap: number,
): Promise<{ allowed: boolean; count: number }> {
  const count = await getTodayCount(identityId);
  if (count >= cap) return { allowed: false, count };
  const newCount = await incrementSendCount(identityId);
  return { allowed: true, count: newCount };
}
```

---

## Suppression Service

```typescript
// backend/src/services/suppression/suppressionService.ts
import { SuppressionEntry, type SuppressionReason } from '../../models/SuppressionEntry.js';
import type { Types } from 'mongoose';

export async function isSuppressed(workspaceId: Types.ObjectId, email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  const domain = normalized.split('@')[1];
  const entry = await SuppressionEntry.findOne({
    workspaceId,
    erasedAt: { $exists: false },
    $or: [{ email: normalized }, { domain }],
  }).lean();
  return !!entry;
}

export async function addSuppression(
  workspaceId: Types.ObjectId,
  email: string,
  reason: SuppressionReason,
  source: string,
  opts: { notes?: string; sourceEventId?: string } = {},
): Promise<void> {
  const normalized = email.toLowerCase().trim();
  await SuppressionEntry.findOneAndUpdate(
    { workspaceId, email: normalized },
    {
      $setOnInsert: { suppressedAt: new Date() },
      $set: { reason, source, ...opts },
    },
    { upsert: true },
  );
}

export async function eraseSuppressionEntry(
  workspaceId: Types.ObjectId,
  entryId: string,
): Promise<void> {
  // GDPR: replace PII with tombstone, keep record for audit
  await SuppressionEntry.findOneAndUpdate(
    { _id: entryId, workspaceId },
    {
      $set: {
        email: `erased-${entryId}@erased.invalid`,
        domain: undefined,
        notes: '[erased]',
        erasedAt: new Date(),
      },
    },
  );
}

export async function listSuppressions(
  workspaceId: Types.ObjectId,
  page: number,
  limit: number,
  search?: string,
): Promise<{ entries: any[]; total: number }> {
  const query: any = { workspaceId, erasedAt: { $exists: false } };
  if (search) query.email = { $regex: search, $options: 'i' };
  const [entries, total] = await Promise.all([
    SuppressionEntry.find(query).sort({ suppressedAt: -1 }).skip((page-1)*limit).limit(limit).lean(),
    SuppressionEntry.countDocuments(query),
  ]);
  return { entries, total };
}
```

---

## Deliverability Controller

```typescript
// backend/src/controllers/deliverability.controller.ts
import { Request, Response, NextFunction } from 'express';
import { runDomainHealthCheck, invalidateDomainHealthCache } from '../services/dns/domainHealth.js';
import { verifySmtpCredentials } from '../services/smtp/smtpVerifier.js';
import { getTodayCount } from '../services/smtp/sendCapTracker.js';
import { SendingIdentity } from '../models/SendingIdentity.js';
import { DomainHealthRecord } from '../models/DomainHealthRecord.js';
import { encrypt } from '../utils/encrypt.js';
import { ApiError } from '../utils/ApiError.js';

// GET /deliverability/domain-health
export async function getDomainHealth(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const { domain, selector } = req.query as { domain?: string; selector?: string };
    if (!domain) throw ApiError.badRequest('domain query param required');
    const result = await runDomainHealthCheck(workspaceId, domain, selector ?? 'google');
    res.json({ data: result });
  } catch (err) { next(err); }
}

// POST /deliverability/domain-health/refresh
export async function refreshDomainHealth(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const { domain, selector } = req.body as { domain: string; selector?: string };
    if (!domain) throw ApiError.badRequest('domain required');
    await invalidateDomainHealthCache(String(workspaceId), domain);
    const result = await runDomainHealthCheck(workspaceId, domain, selector ?? 'google');
    res.json({ data: result });
  } catch (err) { next(err); }
}

// GET /deliverability/domain-health/history?domain=&limit=
export async function getDomainHealthHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const { domain, limit = '10' } = req.query as { domain?: string; limit?: string };
    if (!domain) throw ApiError.badRequest('domain required');
    const records = await DomainHealthRecord.find({ workspaceId, domain })
      .sort({ checkedAt: -1 }).limit(parseInt(limit, 10)).lean();
    res.json({ data: records });
  } catch (err) { next(err); }
}

// GET /deliverability/identities
export async function listIdentities(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const identities = await SendingIdentity.find({ workspaceId, isActive: true }).lean();
    const withCounts = await Promise.all(
      identities.map(async (id) => ({
        ...id,
        todayCount: await getTodayCount(String(id._id)),
      })),
    );
    res.json({ data: withCounts });
  } catch (err) { next(err); }
}

// POST /deliverability/identities
export async function createIdentity(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const { name, fromName, fromEmail, host, port, secure, user, password, dailyCap } = req.body;
    if (!password) throw ApiError.badRequest('password required');
    const encryptedPassword = encrypt(password);
    const identity = await SendingIdentity.create({
      workspaceId, name, fromName, fromEmail, host, port: port ?? 587,
      secure: secure ?? false, user, encryptedPassword, dailyCap: dailyCap ?? 50,
    });
    res.status(201).json({ data: { ...identity.toObject(), encryptedPassword: undefined } });
  } catch (err) { next(err); }
}

// POST /deliverability/identities/:id/verify
export async function verifyIdentity(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const identity = await SendingIdentity.findOne({ _id: req.params.id, workspaceId }).select('+encryptedPassword');
    if (!identity) throw ApiError.notFound('Identity not found');
    const result = await verifySmtpCredentials(identity);
    if (result.success) {
      identity.isVerified = true;
      identity.lastVerifiedAt = new Date();
      await identity.save();
    }
    res.json({ data: result });
  } catch (err) { next(err); }
}

// PATCH /deliverability/identities/:id
export async function updateIdentity(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const { password, ...rest } = req.body;
    const update: any = { ...rest };
    if (password) {
      update.encryptedPassword = encrypt(password);
      update.isVerified = false;
    }
    const identity = await SendingIdentity.findOneAndUpdate(
      { _id: req.params.id, workspaceId }, { $set: update }, { new: true },
    );
    if (!identity) throw ApiError.notFound('Identity not found');
    res.json({ data: identity });
  } catch (err) { next(err); }
}

// DELETE /deliverability/identities/:id
export async function deleteIdentity(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    await SendingIdentity.findOneAndUpdate(
      { _id: req.params.id, workspaceId }, { $set: { isActive: false } },
    );
    res.status(204).end();
  } catch (err) { next(err); }
}
```

---

## Suppression Controller

```typescript
// backend/src/controllers/suppression.controller.ts
import { Request, Response, NextFunction } from 'express';
import { addSuppression, eraseSuppressionEntry, listSuppressions } from '../services/suppression/suppressionService.js';
import { ApiError } from '../utils/ApiError.js';

// GET /suppression?page=1&limit=25&search=
export async function getSuppressions(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = Math.min(parseInt((req.query.limit as string) ?? '25', 10), 100);
    const { search } = req.query as { search?: string };
    const result = await listSuppressions(workspaceId, page, limit, search);
    res.json({ data: result });
  } catch (err) { next(err); }
}

// POST /suppression
export async function addToSuppression(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const { email, reason, notes } = req.body;
    if (!email || !reason) throw ApiError.badRequest('email and reason required');
    await addSuppression(workspaceId, email, reason, 'ui:manual', { notes });
    res.status(201).json({ data: { message: 'Added to suppression list' } });
  } catch (err) { next(err); }
}

// POST /suppression/bulk
export async function bulkAddToSuppression(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const { emails, reason } = req.body as { emails: string[]; reason: string };
    if (!Array.isArray(emails) || emails.length === 0) throw ApiError.badRequest('emails array required');
    if (emails.length > 1000) throw ApiError.badRequest('max 1000 emails per bulk request');
    const results = await Promise.allSettled(
      emails.map(e => addSuppression(workspaceId, e, reason as any, 'ui:bulk')),
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    res.json({ data: { succeeded, failed: results.length - succeeded } });
  } catch (err) { next(err); }
}

// DELETE /suppression/:id/erase  (GDPR erase — not a soft delete)
export async function eraseEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    await eraseSuppressionEntry(workspaceId, req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
}

// GET /suppression/check?email=
export async function checkSuppression(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const { email } = req.query as { email?: string };
    if (!email) throw ApiError.badRequest('email required');
    const { isSuppressed } = await import('../services/suppression/suppressionService.js');
    const suppressed = await isSuppressed(workspaceId, email);
    res.json({ data: { suppressed } });
  } catch (err) { next(err); }
}
```

---

## Deliverability Routes

```typescript
// backend/src/routes/deliverability.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  getDomainHealth, refreshDomainHealth, getDomainHealthHistory,
  listIdentities, createIdentity, verifyIdentity, updateIdentity, deleteIdentity,
} from '../controllers/deliverability.controller.js';

const router = Router();
router.use(authenticate);

router.get('/domain-health', getDomainHealth);
router.post('/domain-health/refresh', refreshDomainHealth);
router.get('/domain-health/history', getDomainHealthHistory);

router.get('/identities', listIdentities);
router.post('/identities', createIdentity);
router.post('/identities/:id/verify', verifyIdentity);
router.patch('/identities/:id', updateIdentity);
router.delete('/identities/:id', deleteIdentity);

export default router;
```

```typescript
// backend/src/routes/suppression.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { getSuppressions, addToSuppression, bulkAddToSuppression, eraseEntry, checkSuppression } from '../controllers/suppression.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', getSuppressions);
router.post('/', addToSuppression);
router.post('/bulk', bulkAddToSuppression);
router.delete('/:id/erase', eraseEntry);
router.get('/check', checkSuppression);

export default router;
```

---

## Domain Health Nightly Cron

```typescript
// backend/src/jobs/domainHealthCron.ts
import { Queue, Worker } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { Workspace } from '../models/Workspace.js';
import { runDomainHealthCheck, invalidateDomainHealthCache } from '../services/dns/domainHealth.js';
import logger from '../config/logger.js';

const QUEUE_NAME = 'domain-health-cron';

export function createDomainHealthQueue() {
  return new Queue(QUEUE_NAME, { connection: getRedis() });
}

export function startDomainHealthWorker() {
  const worker = new Worker(QUEUE_NAME, async (job) => {
    const workspaces = await Workspace.find({ isActive: true }).select('_id sendingDomain dkimSelector').lean();
    logger.info(`[domainHealthCron] Checking ${workspaces.length} workspaces`);
    for (const ws of workspaces) {
      if (!ws.sendingDomain) continue;
      try {
        await invalidateDomainHealthCache(String(ws._id), ws.sendingDomain);
        await runDomainHealthCheck(ws._id, ws.sendingDomain, ws.dkimSelector ?? 'google');
        logger.info(`[domainHealthCron] ${ws.sendingDomain} checked`);
      } catch (err) {
        logger.warn(`[domainHealthCron] Failed for ${ws.sendingDomain}`, err);
      }
    }
  }, { connection: getRedis() });

  worker.on('failed', (job, err) => {
    logger.error('[domainHealthCron] Job failed', err);
  });

  return worker;
}

// Schedule: run at 02:00 UTC every day
export async function scheduleDomainHealthCron() {
  const queue = createDomainHealthQueue();
  await queue.add(
    'nightly-check',
    {},
    {
      repeat: { pattern: '0 2 * * *' },
      removeOnComplete: 10,
      removeOnFail: 10,
    },
  );
  logger.info('[domainHealthCron] Scheduled nightly at 02:00 UTC');
}
```

---

## Outreach Worker — Pre-Send Suppression + Cap Check

In `workers/src/outreach.worker.ts`, before calling the actual send function, add:

```typescript
// Inside the per-recipient send loop, before nodemailer.sendMail(...)
import { isSuppressed } from '../services/suppressionService.js';
import { checkCapAndIncrement } from '../services/sendCapTracker.js';

// 1. Check suppression
const suppressed = await isSuppressed(job.data.workspaceId, recipientEmail);
if (suppressed) {
  logger.info(`[outreach] ${recipientEmail} is suppressed — skipping`);
  continue;
}

// 2. Check and increment daily cap
const identityId = job.data.sendingIdentityId;
const identity = await SendingIdentity.findById(identityId).select('+encryptedPassword');
if (!identity) throw new Error(`Sending identity ${identityId} not found`);

const cap = identity.warmupEnabled ? identity.warmupDailyCap : identity.dailyCap;
const { allowed, count } = await checkCapAndIncrement(identityId, cap);
if (!allowed) {
  logger.warn(`[outreach] Daily cap (${cap}) reached for identity ${identityId} — requeueing`);
  // Delay requeue until next UTC day
  const msUntilMidnight = 86400000 - (Date.now() % 86400000);
  await job.moveToDelayed(Date.now() + msUntilMidnight);
  return;
}
```

---

## Warm-Up Scheduler

```typescript
// backend/src/services/warmup/warmupScheduler.ts
// Warm-up ramp: day 1 = 5, day 2 = 10, day 3 = 20, day 7 = 50, day 14 = 100, day 21 = 200
const WARMUP_RAMP = [5, 10, 20, 30, 40, 50, 60, 80, 100, 120, 150, 180, 200, 250, 300];

export function computeWarmupCap(warmupDay: number): number {
  if (warmupDay <= 0) return 0;
  const idx = Math.min(warmupDay - 1, WARMUP_RAMP.length - 1);
  return WARMUP_RAMP[idx]!;
}

export async function advanceWarmupDay(identityId: string) {
  const { SendingIdentity } = await import('../../models/SendingIdentity.js');
  const identity = await SendingIdentity.findById(identityId);
  if (!identity || !identity.warmupEnabled) return;
  identity.warmupDay += 1;
  identity.warmupDailyCap = computeWarmupCap(identity.warmupDay);
  await identity.save();
}
```

---

## Frontend: Deliverability Dashboard

```typescript
// frontend/src/app/(dashboard)/dashboard/deliverability/page.tsx
'use client';
import { useDeliverability } from '@/hooks/useDeliverability';
import DomainHealthCard from '@/components/deliverability/DomainHealthCard';
import DailySendCapGauge from '@/components/deliverability/DailySendCapGauge';
import WarmupProgressBar from '@/components/deliverability/WarmupProgressBar';

export default function DeliverabilityPage() {
  const { identities, domainHealth, isLoading } = useDeliverability();

  if (isLoading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Deliverability</h1>

      {/* Domain Health */}
      <section>
        <h2 className="text-lg font-medium mb-3">Domain Health</h2>
        {domainHealth ? (
          <DomainHealthCard health={domainHealth} />
        ) : (
          <p className="text-muted-foreground text-sm">No domain health data yet.</p>
        )}
      </section>

      {/* Sending Identities */}
      <section>
        <h2 className="text-lg font-medium mb-3">Sending Identities</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {identities.map((identity) => (
            <div key={identity._id} className="border rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{identity.name}</p>
                  <p className="text-sm text-muted-foreground">{identity.fromEmail}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  identity.isVerified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {identity.isVerified ? 'Verified' : 'Unverified'}
                </span>
              </div>
              <DailySendCapGauge count={identity.todayCount} cap={identity.warmupEnabled ? identity.warmupDailyCap : identity.dailyCap} />
              {identity.warmupEnabled && <WarmupProgressBar day={identity.warmupDay} />}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

```typescript
// frontend/src/components/deliverability/DomainHealthCard.tsx
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface DnsResult { pass: boolean; raw?: string; error?: string; selector?: string; }
interface DomainHealthCardProps {
  health: {
    domain: string;
    spf: DnsResult;
    dkim: DnsResult;
    dmarc: DnsResult;
    overallScore: number;
    checkedAt: string;
  };
}

function StatusIcon({ pass }: { pass: boolean }) {
  return pass
    ? <CheckCircle2 className="h-5 w-5 text-green-500" />
    : <XCircle className="h-5 w-5 text-red-500" />;
}

export default function DomainHealthCard({ health }: DomainHealthCardProps) {
  const scoreColor = health.overallScore >= 90 ? 'text-green-600' : health.overallScore >= 50 ? 'text-yellow-600' : 'text-red-600';
  return (
    <div className="border rounded-lg p-5 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="font-semibold text-lg">{health.domain}</p>
          <p className="text-xs text-muted-foreground">Checked {new Date(health.checkedAt).toLocaleString()}</p>
        </div>
        <span className={`text-3xl font-bold ${scoreColor}`}>{health.overallScore}</span>
      </div>
      <div className="space-y-2">
        {(['spf', 'dkim', 'dmarc'] as const).map((check) => (
          <div key={check} className="flex items-start gap-3">
            <StatusIcon pass={health[check].pass} />
            <div>
              <p className="text-sm font-medium uppercase">{check}</p>
              {health[check].raw && <p className="text-xs text-muted-foreground font-mono truncate max-w-sm">{health[check].raw}</p>}
              {health[check].error && <p className="text-xs text-red-500">{health[check].error}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

```typescript
// frontend/src/components/deliverability/DailySendCapGauge.tsx
interface Props { count: number; cap: number; }
export default function DailySendCapGauge({ count, cap }: Props) {
  const pct = cap > 0 ? Math.min((count / cap) * 100, 100) : 0;
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Today's sends</span>
        <span>{count} / {cap}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

```typescript
// frontend/src/components/deliverability/WarmupProgressBar.tsx
const TOTAL_WARMUP_DAYS = 15;
interface Props { day: number; }
export default function WarmupProgressBar({ day }: Props) {
  const pct = Math.min((day / TOTAL_WARMUP_DAYS) * 100, 100);
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Warm-up: Day {day} of {TOTAL_WARMUP_DAYS}</p>
      <div className="h-1.5 bg-blue-100 rounded-full">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

```typescript
// frontend/src/hooks/useDeliverability.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDeliverability() {
  const identitiesQ = useQuery({
    queryKey: ['deliverability', 'identities'],
    queryFn: () => api.get('/deliverability/identities').then(r => r.data.data),
    staleTime: 30_000,
  });

  const domainHealthQ = useQuery({
    queryKey: ['deliverability', 'domain-health'],
    queryFn: async () => {
      const ws = await api.get('/workspaces/me').then(r => r.data.data);
      if (!ws?.sendingDomain) return null;
      return api.get(`/deliverability/domain-health?domain=${ws.sendingDomain}`).then(r => r.data.data);
    },
    staleTime: 60_000,
  });

  return {
    identities: identitiesQ.data ?? [],
    domainHealth: domainHealthQ.data ?? null,
    isLoading: identitiesQ.isLoading || domainHealthQ.isLoading,
  };
}

export function useSuppressionList(page = 1, limit = 25, search = '') {
  return useQuery({
    queryKey: ['suppression', page, limit, search],
    queryFn: () => api.get(`/suppression?page=${page}&limit=${limit}&search=${search}`).then(r => r.data.data),
    staleTime: 30_000,
  });
}
```

---

## Implementation Sequence

### Step 1 — DNS models + checker

- [ ] Create `backend/src/models/DomainHealthRecord.ts` (IDnsCheckResult + IDomainHealthRecord)
- [ ] Create `backend/src/services/dns/dnsChecker.ts` (checkSpf, checkDkim, checkDmarc, computeScore)
- [ ] Write unit tests: `backend/src/__tests__/dnsChecker.test.ts` — mock `dns.promises.resolveTxt`, assert SPF pass/fail logic, DMARC policy enforcement, multi-SPF-record rejection
- [ ] Verify tests pass: `pnpm --filter backend test`

### Step 2 — Domain health orchestrator

- [ ] Create `backend/src/services/dns/domainHealth.ts` (runDomainHealthCheck with Redis cache, invalidateDomainHealthCache)
- [ ] Test: integration test with mocked Redis + DNS, verify cache hit skips DNS calls, upsert creates DomainHealthRecord
- [ ] `git commit -m "feat(backend): domain health DNS checker + Redis cache"`

### Step 3 — SendingIdentity model + SMTP verifier

- [ ] Create `backend/src/models/SendingIdentity.ts`
- [ ] Create `backend/src/services/smtp/smtpVerifier.ts` (uses nodemailer createTransport().verify())
- [ ] Test: `smtpVerifier.test.ts` — mock nodemailer, assert success/failure response shape
- [ ] `git commit -m "feat(backend): SendingIdentity model + SMTP verifier"`

### Step 4 — Daily send cap tracker

- [ ] Create `backend/src/services/smtp/sendCapTracker.ts` (todayKey, getTodayCount, incrementSendCount, checkCapAndIncrement)
- [ ] Test: mock IORedis, assert INCR increments, first increment sets expiry, cap enforcement returns allowed:false
- [ ] `git commit -m "feat(backend): Redis daily send cap tracker"`

### Step 5 — Suppression model + service

- [ ] Create `backend/src/models/SuppressionEntry.ts`
- [ ] Create `backend/src/services/suppression/suppressionService.ts` (isSuppressed, addSuppression, eraseSuppressionEntry, listSuppressions)
- [ ] Test: isSuppressed by email, by domain, erasure tombstone keeps record with erased email
- [ ] `git commit -m "feat(backend): suppression list model + service"`

### Step 6 — Deliverability controller + routes

- [ ] Create `backend/src/controllers/deliverability.controller.ts` (all 8 handlers)
- [ ] Create `backend/src/routes/deliverability.routes.ts`
- [ ] Create `backend/src/controllers/suppression.controller.ts` (all 5 handlers)
- [ ] Create `backend/src/routes/suppression.routes.ts`
- [ ] Mount both routers in `backend/src/app.ts`
- [ ] `git commit -m "feat(backend): deliverability + suppression routes"`

### Step 7 — Outreach worker pre-send checks

- [ ] Modify `workers/src/outreach.worker.ts`: add suppression check + cap check/increment before nodemailer.sendMail
- [ ] Test: worker test with suppressed recipient — assert send not called; cap exceeded — assert moveToDelayed called
- [ ] `git commit -m "feat(workers): pre-send suppression + daily cap check"`

### Step 8 — Warm-up scheduler

- [ ] Create `backend/src/services/warmup/warmupScheduler.ts` (computeWarmupCap, advanceWarmupDay)
- [ ] Create nightly cron via BullMQ repeatable job in `backend/src/jobs/domainHealthCron.ts`
- [ ] Start worker in `backend/src/server.ts` alongside other workers
- [ ] `git commit -m "feat(backend): warm-up ramp + domain health nightly cron"`

### Step 9 — Frontend deliverability dashboard

- [ ] Create `frontend/src/hooks/useDeliverability.ts`
- [ ] Create `frontend/src/components/deliverability/DomainHealthCard.tsx`
- [ ] Create `frontend/src/components/deliverability/DailySendCapGauge.tsx`
- [ ] Create `frontend/src/components/deliverability/WarmupProgressBar.tsx`
- [ ] Create `frontend/src/components/deliverability/SendingIdentityForm.tsx` (name, fromName, fromEmail, host, port, secure, user, password fields + verify button)
- [ ] Create `frontend/src/app/(dashboard)/dashboard/deliverability/page.tsx`
- [ ] Create `frontend/src/app/(dashboard)/dashboard/deliverability/identities/page.tsx`
- [ ] Add Deliverability link to Sidebar
- [ ] `git commit -m "feat(frontend): deliverability dashboard + sending identities"`

### Step 10 — Suppression list UI

- [ ] Create `frontend/src/components/deliverability/SuppressionTable.tsx` (paginated table with search, add button, erase button)
- [ ] Create `frontend/src/app/(dashboard)/dashboard/deliverability/suppression/page.tsx`
- [ ] Wire `useSuppressionList` hook
- [ ] `git commit -m "feat(frontend): suppression list UI"`

---

## API Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /deliverability/domain-health | JWT/API key | Check domain SPF/DKIM/DMARC |
| POST | /deliverability/domain-health/refresh | JWT/API key | Bust cache + re-check |
| GET | /deliverability/domain-health/history | JWT/API key | Last N check results |
| GET | /deliverability/identities | JWT/API key | List sending identities |
| POST | /deliverability/identities | JWT | Create sending identity |
| POST | /deliverability/identities/:id/verify | JWT | SMTP credential verify |
| PATCH | /deliverability/identities/:id | JWT | Update identity |
| DELETE | /deliverability/identities/:id | JWT | Soft-delete identity |
| GET | /suppression | JWT | Paginated suppression list |
| POST | /suppression | JWT | Add single entry |
| POST | /suppression/bulk | JWT | Add up to 1000 entries |
| DELETE | /suppression/:id/erase | JWT | GDPR erase (tombstone) |
| GET | /suppression/check?email= | JWT | Check if email is suppressed |

---

## Verification Criteria

- DNS check returns correct pass/fail for known TXT records (mock or live)
- SPF multi-record detection returns pass:false with descriptive error
- DMARC policy:none returns pass:false with guidance message
- Redis cache key expires after 1 hour; forced refresh busts key
- SMTP verify returns success:true on valid test credentials, success:false with error message on bad credentials
- Daily cap tracker: incrementSendCount returns new count; checkCapAndIncrement returns allowed:false after cap exhausted
- Suppression: isSuppressed returns true for direct email match and for domain-level suppression
- Suppression: eraseSuppressionEntry replaces email with erased-{id}@erased.invalid, sets erasedAt
- Outreach worker skips suppressed recipients (no send call)
- Outreach worker defers job to next UTC midnight if cap exceeded
- Warm-up day 1 = 5 emails, day 7 = 60 emails, day 15 = 300 emails per ramp table
- Frontend deliverability dashboard renders domain health with color-coded SPF/DKIM/DMARC badges
- Daily send gauge fills and turns red at 90 %+ usage
