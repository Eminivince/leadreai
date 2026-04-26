# Phase 4 — Evidence-First Lead Cards & Analytics Attribution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every lead explainable and every campaign measurable — surfaces source evidence on lead cards and connects outbound actions to business outcomes (replies, meetings, pipeline).

**Architecture:** Evidence snippets are stored as an embedded array on the Lead document, written by the enrichment pipeline stages. Analytics events are a separate normalised collection (CampaignEvent) written by the outreach worker on send, and by the webhook receiver on reply/bounce/open. Attribution queries aggregate events by lead → campaign → outcome. Frontend renders evidence per lead and a real-time analytics dashboard.

**Tech Stack:** Backend: Express, Mongoose aggregation pipelines, BullMQ. Frontend: Next.js 14, Recharts, TanStack Query, shadcn/ui.

---

## Roadmap Modules Covered

- Module 6 — Evidence-First Lead Cards (why matched, source snippets, freshness, confidence breakdown)
- Module 7 — Analytics and Attribution (reply rate, bounce rate, meeting-booked rate, conversion by query/campaign/persona, source-to-pipeline)
- Module 4 partial — Delivery event timeline (opens, clicks, bounces linked to campaign events)

---

## File Map

### New Backend Files

| File | Responsibility |
|---|---|
| `backend/src/models/CampaignEvent.ts` | Normalised event: sent / opened / clicked / replied / bounced / unsubscribed / meeting_booked |
| `backend/src/services/analytics/eventWriter.ts` | Upsert/create CampaignEvent records |
| `backend/src/services/analytics/attributionQuery.ts` | MongoDB aggregation pipelines for all dashboard metrics |
| `backend/src/controllers/analytics.controller.ts` | REST handlers: overview, by-campaign, by-query, by-persona, timeline |
| `backend/src/routes/analytics.routes.ts` | Mount analytics routes under `/analytics` |
| `backend/src/controllers/leads.evidence.controller.ts` | GET /leads/:id/evidence — returns structured evidence array |

### Modified Backend Files

| File | Changes |
|---|---|
| `backend/src/models/Lead.ts` | Add `evidence[]` subdocument array, `qualificationReasoning` string, `confidenceBreakdown` object |
| `workers/src/pipeline/serpScraper.ts` | Write evidence snippet with source, snippet, url, scrapedAt after each SERP result |
| `workers/src/pipeline/pageScraper.ts` | Write evidence snippet per page scraped |
| `workers/src/pipeline/qualifier.ts` | Write qualificationReasoning (AI reasoning text) + confidenceBreakdown |
| `workers/src/outreach.worker.ts` | Emit `sent` CampaignEvent on successful send |
| `backend/src/controllers/webhooks.controller.ts` | Emit `opened`/`clicked`/`bounced`/`replied` events from email provider webhooks |

### New Frontend Files

| File | Responsibility |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/analytics/page.tsx` | Analytics overview: KPI tiles + trend charts |
| `frontend/src/app/(dashboard)/dashboard/analytics/campaigns/[campaignId]/page.tsx` | Per-campaign funnel + timeline |
| `frontend/src/components/analytics/KpiTileGrid.tsx` | Grid of stat tiles (sent, opened, replied, bounced, meetings) |
| `frontend/src/components/analytics/FunnelChart.tsx` | Recharts funnel/bar showing sent→open→reply→meeting |
| `frontend/src/components/analytics/TimelineChart.tsx` | Area chart: events over time |
| `frontend/src/components/analytics/AttributionTable.tsx` | Table: lead source → outcome rate |
| `frontend/src/components/leads/EvidencePanel.tsx` | Accordion showing per-source evidence snippets |
| `frontend/src/components/leads/QualificationReasoningCard.tsx` | Card showing AI qualification reasoning + confidence bars |
| `frontend/src/hooks/useAnalytics.ts` | TanStack Query hooks for all analytics endpoints |

### Modified Frontend Files

| File | Changes |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/campaigns/[campaignId]/page.tsx` | Add Analytics tab with per-campaign funnel |
| `frontend/src/components/leads/LeadDetailDrawer.tsx` | Add Evidence tab (EvidencePanel + QualificationReasoningCard) |
| `frontend/src/components/layout/Sidebar.tsx` | Add Analytics nav link |

---

## Data Models

### Lead — Evidence Subdocument

```typescript
// Add to backend/src/models/Lead.ts

export interface IEvidenceSnippet {
  source: 'serp' | 'page' | 'file' | 'osint' | 'contact_enrichment' | 'ai_inference';
  url?: string;
  title?: string;
  snippet: string;       // excerpt from source proving the lead matches
  scrapedAt: Date;
  confidence: number;    // 0.0–1.0 per-snippet confidence
}

export interface IConfidenceBreakdown {
  icp_match: number;       // 0–100
  data_freshness: number;  // 0–100
  signal_strength: number; // 0–100
  contact_coverage: number;// 0–100
  overall: number;         // 0–100
}

// Add to ILead interface:
evidence: IEvidenceSnippet[];
qualificationReasoning: string;       // AI explanation paragraph
confidenceBreakdown: IConfidenceBreakdown;
verificationHistory: Array<{
  checkedAt: Date;
  result: 'passed' | 'failed' | 'degraded';
  note?: string;
}>;

// Add to LeadSchema:
const EvidenceSnippetSchema = new Schema<IEvidenceSnippet>({
  source:     { type: String, enum: ['serp','page','file','osint','contact_enrichment','ai_inference'], required: true },
  url:        { type: String },
  title:      { type: String },
  snippet:    { type: String, required: true },
  scrapedAt:  { type: Date, default: Date.now },
  confidence: { type: Number, default: 0.5 },
}, { _id: false });

const ConfidenceBreakdownSchema = new Schema<IConfidenceBreakdown>({
  icp_match:        { type: Number, default: 0 },
  data_freshness:   { type: Number, default: 0 },
  signal_strength:  { type: Number, default: 0 },
  contact_coverage: { type: Number, default: 0 },
  overall:          { type: Number, default: 0 },
}, { _id: false });

// In LeadSchema:
evidence:                { type: [EvidenceSnippetSchema], default: [] },
qualificationReasoning:  { type: String, default: '' },
confidenceBreakdown:     { type: ConfidenceBreakdownSchema, default: () => ({}) },
verificationHistory:     { type: [{
  checkedAt: { type: Date },
  result:    { type: String, enum: ['passed','failed','degraded'] },
  note:      { type: String },
}], default: [] },
```

### CampaignEvent

```typescript
// backend/src/models/CampaignEvent.ts
import { Schema, model, Document, Types } from 'mongoose';

export type EventType =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'bounced'
  | 'unsubscribed'
  | 'meeting_booked'
  | 'spam_complaint';

export interface ICampaignEvent extends Document {
  workspaceId:     Types.ObjectId;
  campaignId:      Types.ObjectId;
  leadId:          Types.ObjectId;
  contactId?:      Types.ObjectId;         // if contact-level targeting
  sequenceId?:     Types.ObjectId;
  enrollmentId?:   Types.ObjectId;
  stepIndex?:      number;                 // which sequence step generated this event
  eventType:       EventType;
  occurredAt:      Date;
  metadata: {
    messageId?:    string;                 // provider message ID
    provider?:     string;                 // 'resend' | 'sendgrid' | 'smtp'
    subject?:      string;
    replyText?:    string;
    bounceCode?:   string;                 // e.g. '550' hard bounce
    bounceType?:   'hard' | 'soft';
    clickUrl?:     string;
    meetingUrl?:   string;
    ipAddress?:    string;
    userAgent?:    string;
  };
  sourceQuery?:    string;                 // original prospecting query text (denormalised for attribution)
  personaTag?:     string;                 // ICP persona tag (denormalised)
  createdAt:       Date;
}

const CampaignEventSchema = new Schema<ICampaignEvent>({
  workspaceId:  { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  campaignId:   { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  leadId:       { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  contactId:    { type: Schema.Types.ObjectId, ref: 'Contact' },
  sequenceId:   { type: Schema.Types.ObjectId, ref: 'Sequence' },
  enrollmentId: { type: Schema.Types.ObjectId, ref: 'SequenceEnrollment' },
  stepIndex:    { type: Number },
  eventType:    { type: String, enum: ['sent','delivered','opened','clicked','replied','bounced','unsubscribed','meeting_booked','spam_complaint'], required: true, index: true },
  occurredAt:   { type: Date, default: Date.now, index: true },
  metadata:     {
    messageId:  String,
    provider:   String,
    subject:    String,
    replyText:  String,
    bounceCode: String,
    bounceType: { type: String, enum: ['hard','soft'] },
    clickUrl:   String,
    meetingUrl: String,
    ipAddress:  String,
    userAgent:  String,
  },
  sourceQuery:  { type: String },
  personaTag:   { type: String },
}, { timestamps: true });

CampaignEventSchema.index({ workspaceId: 1, occurredAt: -1 });
CampaignEventSchema.index({ campaignId: 1, eventType: 1, occurredAt: -1 });
CampaignEventSchema.index({ leadId: 1, eventType: 1 });

export const CampaignEvent = model<ICampaignEvent>('CampaignEvent', CampaignEventSchema);
```

---

## Analytics Attribution Service

```typescript
// backend/src/services/analytics/attributionQuery.ts
import { CampaignEvent } from '../../models/CampaignEvent.js';
import type { Types } from 'mongoose';

export interface OverviewMetrics {
  totalSent:      number;
  totalDelivered: number;
  totalOpened:    number;
  totalReplied:   number;
  totalBounced:   number;
  totalMeetings:  number;
  openRate:       number;  // %
  replyRate:      number;  // %
  bounceRate:     number;  // %
  meetingRate:    number;  // %
}

export async function getOverviewMetrics(
  workspaceId: Types.ObjectId,
  fromDate: Date,
  toDate: Date,
): Promise<OverviewMetrics> {
  const pipeline = [
    { $match: { workspaceId, occurredAt: { $gte: fromDate, $lte: toDate } } },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
      },
    },
  ];
  const results = await CampaignEvent.aggregate(pipeline);
  const map = Object.fromEntries(results.map(r => [r._id, r.count])) as Record<string, number>;

  const sent      = map['sent']      ?? 0;
  const delivered = map['delivered'] ?? 0;
  const opened    = map['opened']    ?? 0;
  const replied   = map['replied']   ?? 0;
  const bounced   = map['bounced']   ?? 0;
  const meetings  = map['meeting_booked'] ?? 0;

  const rate = (numerator: number, denominator: number) =>
    denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;

  return {
    totalSent: sent, totalDelivered: delivered, totalOpened: opened,
    totalReplied: replied, totalBounced: bounced, totalMeetings: meetings,
    openRate:    rate(opened,  sent),
    replyRate:   rate(replied, sent),
    bounceRate:  rate(bounced, sent),
    meetingRate: rate(meetings, replied),
  };
}

export async function getEventsByDay(
  workspaceId: Types.ObjectId,
  fromDate: Date,
  toDate: Date,
  campaignId?: Types.ObjectId,
): Promise<Array<{ date: string; sent: number; opened: number; replied: number; bounced: number }>> {
  const match: any = { workspaceId, occurredAt: { $gte: fromDate, $lte: toDate } };
  if (campaignId) match.campaignId = campaignId;

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } },
          type: '$eventType',
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.date',
        events: { $push: { type: '$_id.type', count: '$count' } },
      },
    },
    { $sort: { _id: 1 } },
  ];

  const raw = await CampaignEvent.aggregate(pipeline);
  return raw.map(day => {
    const byType = Object.fromEntries(day.events.map((e: any) => [e.type, e.count]));
    return {
      date:    day._id,
      sent:    byType['sent'] ?? 0,
      opened:  byType['opened'] ?? 0,
      replied: byType['replied'] ?? 0,
      bounced: byType['bounced'] ?? 0,
    };
  });
}

export async function getCampaignFunnel(campaignId: Types.ObjectId): Promise<Array<{ stage: string; count: number }>> {
  const pipeline = [
    { $match: { campaignId } },
    { $group: { _id: '$eventType', count: { $sum: 1 } } },
  ];
  const results = await CampaignEvent.aggregate(pipeline);
  const map = Object.fromEntries(results.map(r => [r._id, r.count]));
  const stages: Array<[string, string]> = [
    ['Sent',      'sent'],
    ['Delivered', 'delivered'],
    ['Opened',    'opened'],
    ['Clicked',   'clicked'],
    ['Replied',   'replied'],
    ['Meeting',   'meeting_booked'],
  ];
  return stages.map(([label, key]) => ({ stage: label, count: (map as any)[key] ?? 0 }));
}

export async function getAttributionByQuery(
  workspaceId: Types.ObjectId,
  fromDate: Date,
  toDate: Date,
): Promise<Array<{ query: string; sent: number; replied: number; meetings: number; replyRate: number }>> {
  const pipeline = [
    { $match: { workspaceId, occurredAt: { $gte: fromDate, $lte: toDate }, sourceQuery: { $exists: true, $ne: '' } } },
    {
      $group: {
        _id: '$sourceQuery',
        sent:     { $sum: { $cond: [{ $eq: ['$eventType', 'sent'] }, 1, 0] } },
        replied:  { $sum: { $cond: [{ $eq: ['$eventType', 'replied'] }, 1, 0] } },
        meetings: { $sum: { $cond: [{ $eq: ['$eventType', 'meeting_booked'] }, 1, 0] } },
      },
    },
    {
      $project: {
        query:     '$_id',
        sent:      1,
        replied:   1,
        meetings:  1,
        replyRate: { $cond: [{ $gt: ['$sent', 0] }, { $multiply: [{ $divide: ['$replied', '$sent'] }, 100] }, 0] },
      },
    },
    { $sort: { replied: -1 } },
    { $limit: 20 },
  ];
  return CampaignEvent.aggregate(pipeline);
}

export async function getLeadTimeline(leadId: Types.ObjectId): Promise<ICampaignEvent[]> {
  return CampaignEvent.find({ leadId }).sort({ occurredAt: 1 }).lean() as any;
}
```

---

## Event Writer Service

```typescript
// backend/src/services/analytics/eventWriter.ts
import { CampaignEvent, type EventType } from '../../models/CampaignEvent.js';
import type { Types } from 'mongoose';

export interface EmitEventOpts {
  workspaceId:   Types.ObjectId;
  campaignId:    Types.ObjectId;
  leadId:        Types.ObjectId;
  contactId?:    Types.ObjectId;
  sequenceId?:   Types.ObjectId;
  enrollmentId?: Types.ObjectId;
  stepIndex?:    number;
  eventType:     EventType;
  occurredAt?:   Date;
  metadata?:     Record<string, any>;
  sourceQuery?:  string;
  personaTag?:   string;
}

export async function emitEvent(opts: EmitEventOpts): Promise<void> {
  await CampaignEvent.create({
    ...opts,
    occurredAt: opts.occurredAt ?? new Date(),
  });
}

// Fire-and-forget variant for use in hot paths (outreach worker, webhook receiver)
export function emitEventAsync(opts: EmitEventOpts): void {
  emitEvent(opts).catch(err => {
    console.error('[eventWriter] Failed to emit event', err);
  });
}
```

---

## Analytics Controller

```typescript
// backend/src/controllers/analytics.controller.ts
import { Request, Response, NextFunction } from 'express';
import {
  getOverviewMetrics,
  getEventsByDay,
  getCampaignFunnel,
  getAttributionByQuery,
  getLeadTimeline,
} from '../services/analytics/attributionQuery.js';
import { ApiError } from '../utils/ApiError.js';

function parseDateRange(query: any): { fromDate: Date; toDate: Date } {
  const now = new Date();
  const fromDate = query.from ? new Date(query.from as string) : new Date(now.getFullYear(), now.getMonth(), 1);
  const toDate   = query.to   ? new Date(query.to   as string) : now;
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) throw ApiError.badRequest('Invalid date range');
  return { fromDate, toDate };
}

// GET /analytics/overview?from=&to=
export async function getOverview(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const { fromDate, toDate } = parseDateRange(req.query);
    const metrics = await getOverviewMetrics(workspaceId, fromDate, toDate);
    res.json({ data: metrics });
  } catch (err) { next(err); }
}

// GET /analytics/daily?from=&to=&campaignId=
export async function getDailyBreakdown(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const { fromDate, toDate } = parseDateRange(req.query);
    const { campaignId } = req.query as { campaignId?: string };
    const data = await getEventsByDay(workspaceId, fromDate, toDate, campaignId as any);
    res.json({ data });
  } catch (err) { next(err); }
}

// GET /analytics/campaigns/:campaignId/funnel
export async function getCampaignFunnelHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getCampaignFunnel(req.params.campaignId as any);
    res.json({ data });
  } catch (err) { next(err); }
}

// GET /analytics/attribution/query?from=&to=
export async function getQueryAttribution(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const { fromDate, toDate } = parseDateRange(req.query);
    const data = await getAttributionByQuery(workspaceId, fromDate, toDate);
    res.json({ data });
  } catch (err) { next(err); }
}

// GET /analytics/leads/:leadId/timeline
export async function getLeadTimelineHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getLeadTimeline(req.params.leadId as any);
    res.json({ data });
  } catch (err) { next(err); }
}
```

---

## Analytics Routes

```typescript
// backend/src/routes/analytics.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  getOverview, getDailyBreakdown, getCampaignFunnelHandler,
  getQueryAttribution, getLeadTimelineHandler,
} from '../controllers/analytics.controller.js';

const router = Router();
router.use(authenticate);

router.get('/overview',                         getOverview);
router.get('/daily',                            getDailyBreakdown);
router.get('/campaigns/:campaignId/funnel',     getCampaignFunnelHandler);
router.get('/attribution/query',                getQueryAttribution);
router.get('/leads/:leadId/timeline',           getLeadTimelineHandler);

export default router;
```

---

## Evidence Snippets Written by Pipeline Workers

### serpScraper.ts — write evidence after each result

```typescript
// In workers/src/pipeline/serpScraper.ts, after processing each SERP result:
await Lead.findByIdAndUpdate(lead._id, {
  $push: {
    evidence: {
      source: 'serp',
      url: result.link,
      title: result.title,
      snippet: result.snippet,
      scrapedAt: new Date(),
      confidence: 0.7,
    },
  },
});
```

### qualifier.ts — write AI reasoning + confidence breakdown

```typescript
// In workers/src/pipeline/qualifier.ts, after AI qualification response:
const breakdown: IConfidenceBreakdown = {
  icp_match:        icpScore,        // parsed from AI JSON response
  data_freshness:   freshnessScore,
  signal_strength:  signalScore,
  contact_coverage: contactScore,
  overall:          Math.round((icpScore + freshnessScore + signalScore + contactScore) / 4),
};

await Lead.findByIdAndUpdate(lead._id, {
  $set: {
    qualificationReasoning: aiResponse.reasoning,
    confidenceBreakdown:    breakdown,
  },
});
```

Ask the AI qualifier to return a JSON object in this shape:
```json
{
  "qualified": true,
  "score": 82,
  "reasoning": "This company matches the ICP because...",
  "breakdown": {
    "icp_match": 85,
    "data_freshness": 90,
    "signal_strength": 75,
    "contact_coverage": 70
  }
}
```

---

## Outreach Worker — Emit `sent` Event

```typescript
// In workers/src/outreach.worker.ts, after successful nodemailer.sendMail():
import { emitEventAsync } from '../services/analytics/eventWriter.js';

emitEventAsync({
  workspaceId: job.data.workspaceId,
  campaignId:  job.data.campaignId,
  leadId:      job.data.leadId,
  contactId:   job.data.contactId,
  sequenceId:  job.data.sequenceId,
  enrollmentId:job.data.enrollmentId,
  stepIndex:   job.data.stepIndex,
  eventType:   'sent',
  metadata: {
    messageId: sendResult.messageId,
    provider:  'smtp',
    subject:   job.data.subject,
  },
  sourceQuery: job.data.sourceQuery,
  personaTag:  job.data.personaTag,
});
```

---

## Webhook Receiver — Emit Delivery Events

```typescript
// In backend/src/controllers/webhooks.controller.ts
// After verifying HMAC and parsing provider event:

import { emitEventAsync } from '../services/analytics/eventWriter.js';
import { addSuppression } from '../services/suppression/suppressionService.js';

// Map provider event type to our EventType
function mapProviderEvent(type: string): EventType | null {
  const map: Record<string, EventType> = {
    'email.delivered':     'delivered',
    'email.opened':        'opened',
    'email.clicked':       'clicked',
    'email.bounced':       'bounced',
    'email.complained':    'spam_complaint',
    // SendGrid equivalents:
    'delivered':           'delivered',
    'open':                'opened',
    'click':               'clicked',
    'bounce':              'bounced',
    'spamreport':          'spam_complaint',
  };
  return map[type] ?? null;
}

// In the webhook handler body:
const eventType = mapProviderEvent(providerEventType);
if (!eventType) return; // unknown event, ignore

// Look up campaign + lead by provider messageId
const event = await CampaignEvent.findOne({ 'metadata.messageId': messageId, eventType: 'sent' });
if (!event) return; // no matching sent event found

emitEventAsync({
  workspaceId:  event.workspaceId,
  campaignId:   event.campaignId,
  leadId:       event.leadId,
  contactId:    event.contactId,
  sequenceId:   event.sequenceId,
  enrollmentId: event.enrollmentId,
  stepIndex:    event.stepIndex,
  eventType,
  occurredAt:   new Date(providerTimestamp),
  metadata:     { messageId, provider: 'resend', bounceCode, bounceType },
  sourceQuery:  event.sourceQuery,
  personaTag:   event.personaTag,
});

// Auto-suppress hard bounces and spam complaints
if (eventType === 'bounced' && bounceType === 'hard') {
  await addSuppression(event.workspaceId, recipientEmail, 'hard_bounce', `webhook:${provider}`, { sourceEventId: webhookEventId });
}
if (eventType === 'spam_complaint') {
  await addSuppression(event.workspaceId, recipientEmail, 'spam_complaint', `webhook:${provider}`, { sourceEventId: webhookEventId });
}
```

---

## Frontend: Analytics Dashboard

```typescript
// frontend/src/app/(dashboard)/dashboard/analytics/page.tsx
'use client';
import { useState } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import KpiTileGrid from '@/components/analytics/KpiTileGrid';
import TimelineChart from '@/components/analytics/TimelineChart';
import AttributionTable from '@/components/analytics/AttributionTable';

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const { overview, daily, attribution, isLoading } = useAnalytics(dateRange);

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        {/* Date range picker (shadcn DatePickerWithRange) */}
      </div>

      <KpiTileGrid metrics={overview} isLoading={isLoading} />

      <section>
        <h2 className="text-lg font-medium mb-3">Trend</h2>
        <TimelineChart data={daily} />
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Attribution by Query</h2>
        <AttributionTable rows={attribution} />
      </section>
    </div>
  );
}
```

```typescript
// frontend/src/components/analytics/KpiTileGrid.tsx
interface Metrics {
  totalSent: number; totalOpened: number; totalReplied: number;
  totalBounced: number; totalMeetings: number;
  openRate: number; replyRate: number; bounceRate: number; meetingRate: number;
}
interface Props { metrics: Metrics | null; isLoading: boolean; }

export default function KpiTileGrid({ metrics, isLoading }: Props) {
  const tiles = [
    { label: 'Sent',        value: metrics?.totalSent,    sub: null },
    { label: 'Open Rate',   value: metrics ? `${metrics.openRate}%`   : null, sub: `${metrics?.totalOpened} opened` },
    { label: 'Reply Rate',  value: metrics ? `${metrics.replyRate}%`  : null, sub: `${metrics?.totalReplied} replied` },
    { label: 'Bounce Rate', value: metrics ? `${metrics.bounceRate}%` : null, sub: `${metrics?.totalBounced} bounced` },
    { label: 'Meetings',    value: metrics?.totalMeetings, sub: metrics ? `${metrics.meetingRate}% of replies` : null },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {tiles.map(tile => (
        <div key={tile.label} className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">{tile.label}</p>
          <p className="text-2xl font-bold mt-1">
            {isLoading ? '—' : (tile.value ?? '0')}
          </p>
          {tile.sub && <p className="text-xs text-muted-foreground mt-0.5">{isLoading ? '' : tile.sub}</p>}
        </div>
      ))}
    </div>
  );
}
```

```typescript
// frontend/src/components/analytics/TimelineChart.tsx
'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface DayRow { date: string; sent: number; opened: number; replied: number; bounced: number; }
interface Props { data: DayRow[]; }

export default function TimelineChart({ data }: Props) {
  return (
    <div className="h-64 border rounded-lg p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Area type="monotone" dataKey="sent"    stroke="#94a3b8" fill="#f1f5f9" strokeWidth={2} />
          <Area type="monotone" dataKey="opened"  stroke="#3b82f6" fill="#eff6ff" strokeWidth={2} />
          <Area type="monotone" dataKey="replied" stroke="#22c55e" fill="#f0fdf4" strokeWidth={2} />
          <Area type="monotone" dataKey="bounced" stroke="#ef4444" fill="#fef2f2" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

```typescript
// frontend/src/components/analytics/FunnelChart.tsx
'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Stage { stage: string; count: number; }
interface Props { data: Stage[]; }

const COLORS = ['#94a3b8','#60a5fa','#34d399','#a78bfa','#fb923c','#22c55e'];

export default function FunnelChart({ data }: Props) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <XAxis type="number" tick={{ fontSize: 12 }} />
          <YAxis dataKey="stage" type="category" width={80} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="count" radius={[0,4,4,0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

```typescript
// frontend/src/components/analytics/AttributionTable.tsx
interface Row { query: string; sent: number; replied: number; meetings: number; replyRate: number; }
interface Props { rows: Row[]; }

export default function AttributionTable({ rows }: Props) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            {['Query','Sent','Replied','Reply Rate','Meetings'].map(h => (
              <th key={h} className="text-left px-4 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              <td className="px-4 py-2 max-w-xs truncate">{row.query}</td>
              <td className="px-4 py-2">{row.sent}</td>
              <td className="px-4 py-2">{row.replied}</td>
              <td className="px-4 py-2">{row.replyRate.toFixed(1)}%</td>
              <td className="px-4 py-2">{row.meetings}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No data yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Lead Evidence Panel

```typescript
// frontend/src/components/leads/EvidencePanel.tsx
import { ExternalLink, Globe, FileText, Search } from 'lucide-react';

interface Snippet {
  source: string; url?: string; title?: string; snippet: string; scrapedAt: string; confidence: number;
}
interface Props { evidence: Snippet[]; }

const SOURCE_ICONS: Record<string, any> = {
  serp: Search, page: Globe, file: FileText,
};

export default function EvidencePanel({ evidence }: Props) {
  if (!evidence || evidence.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No evidence snippets collected yet.</p>;
  }
  return (
    <div className="space-y-3">
      {evidence.map((ev, i) => {
        const Icon = SOURCE_ICONS[ev.source] ?? Globe;
        return (
          <div key={i} className="border rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs uppercase font-medium text-muted-foreground">{ev.source}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {Math.round(ev.confidence * 100)}% confidence
              </span>
            </div>
            {ev.title && <p className="text-sm font-medium">{ev.title}</p>}
            <p className="text-sm text-muted-foreground line-clamp-3">{ev.snippet}</p>
            {ev.url && (
              <a href={ev.url} target="_blank" rel="noopener noreferrer"
                 className="text-xs text-blue-500 hover:underline flex items-center gap-1 w-fit">
                {ev.url.slice(0, 60)}{ev.url.length > 60 ? '…' : ''}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

```typescript
// frontend/src/components/leads/QualificationReasoningCard.tsx
interface Breakdown {
  icp_match: number; data_freshness: number; signal_strength: number; contact_coverage: number; overall: number;
}
interface Props { reasoning: string; breakdown: Breakdown; }

function ConfidenceBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span><span>{value}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function QualificationReasoningCard({ reasoning, breakdown }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium mb-1">AI Qualification Reasoning</h4>
        <p className="text-sm text-muted-foreground">{reasoning || 'No reasoning recorded.'}</p>
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Confidence Breakdown</h4>
        <ConfidenceBar label="ICP Match"        value={breakdown?.icp_match        ?? 0} />
        <ConfidenceBar label="Data Freshness"   value={breakdown?.data_freshness   ?? 0} />
        <ConfidenceBar label="Signal Strength"  value={breakdown?.signal_strength  ?? 0} />
        <ConfidenceBar label="Contact Coverage" value={breakdown?.contact_coverage ?? 0} />
        <ConfidenceBar label="Overall"          value={breakdown?.overall          ?? 0} />
      </div>
    </div>
  );
}
```

---

## TanStack Query Hooks

```typescript
// frontend/src/hooks/useAnalytics.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface DateRange { from: string; to: string; }

function buildParams(range: DateRange) {
  const p = new URLSearchParams();
  if (range.from) p.set('from', range.from);
  if (range.to)   p.set('to', range.to);
  return p.toString() ? `?${p.toString()}` : '';
}

export function useAnalytics(dateRange: DateRange) {
  const params = buildParams(dateRange);

  const overviewQ = useQuery({
    queryKey: ['analytics', 'overview', dateRange],
    queryFn: () => api.get(`/analytics/overview${params}`).then(r => r.data.data),
    staleTime: 60_000,
  });

  const dailyQ = useQuery({
    queryKey: ['analytics', 'daily', dateRange],
    queryFn: () => api.get(`/analytics/daily${params}`).then(r => r.data.data),
    staleTime: 60_000,
  });

  const attributionQ = useQuery({
    queryKey: ['analytics', 'attribution', dateRange],
    queryFn: () => api.get(`/analytics/attribution/query${params}`).then(r => r.data.data),
    staleTime: 60_000,
  });

  return {
    overview:    overviewQ.data ?? null,
    daily:       dailyQ.data ?? [],
    attribution: attributionQ.data ?? [],
    isLoading:   overviewQ.isLoading || dailyQ.isLoading,
  };
}

export function useCampaignFunnel(campaignId: string) {
  return useQuery({
    queryKey: ['analytics', 'funnel', campaignId],
    queryFn: () => api.get(`/analytics/campaigns/${campaignId}/funnel`).then(r => r.data.data),
    enabled: !!campaignId,
    staleTime: 30_000,
  });
}

export function useLeadTimeline(leadId: string) {
  return useQuery({
    queryKey: ['analytics', 'lead-timeline', leadId],
    queryFn: () => api.get(`/analytics/leads/${leadId}/timeline`).then(r => r.data.data),
    enabled: !!leadId,
    staleTime: 30_000,
  });
}
```

---

## Implementation Sequence

### Step 1 — CampaignEvent model

- [ ] Create `backend/src/models/CampaignEvent.ts` with all EventType variants, metadata sub-schema, and indexes
- [ ] Write model unit test: create event, query by campaignId+eventType, verify indexes exist
- [ ] `git commit -m "feat(backend): CampaignEvent model"`

### Step 2 — Event writer service

- [ ] Create `backend/src/services/analytics/eventWriter.ts` (emitEvent, emitEventAsync)
- [ ] Test: emitEvent creates CampaignEvent; emitEventAsync does not throw on failure
- [ ] `git commit -m "feat(backend): event writer service"`

### Step 3 — Attribution aggregation queries

- [ ] Create `backend/src/services/analytics/attributionQuery.ts` (getOverviewMetrics, getEventsByDay, getCampaignFunnel, getAttributionByQuery, getLeadTimeline)
- [ ] Test: seed CampaignEvent documents, assert getOverviewMetrics sums correctly, getAttributionByQuery groups by sourceQuery
- [ ] `git commit -m "feat(backend): attribution aggregation service"`

### Step 4 — Analytics routes + controller

- [ ] Create `backend/src/controllers/analytics.controller.ts` (5 handlers)
- [ ] Create `backend/src/routes/analytics.routes.ts`
- [ ] Mount router in `backend/src/app.ts`
- [ ] `git commit -m "feat(backend): analytics REST API"`

### Step 5 — Lead evidence schema

- [ ] Modify `backend/src/models/Lead.ts`: add evidence[], qualificationReasoning, confidenceBreakdown, verificationHistory
- [ ] Write migration guard: existing leads without evidence field return empty array (Mongoose default handles this)
- [ ] `git commit -m "feat(backend): Lead evidence + confidence breakdown fields"`

### Step 6 — Pipeline workers write evidence

- [ ] Modify `workers/src/pipeline/serpScraper.ts`: push evidence snippet per SERP result
- [ ] Modify `workers/src/pipeline/pageScraper.ts`: push evidence snippet per scraped page
- [ ] Modify `workers/src/pipeline/qualifier.ts`: set qualificationReasoning + confidenceBreakdown from AI response JSON
- [ ] Test: run pipeline in test mode, assert lead.evidence has > 0 entries after scraping
- [ ] `git commit -m "feat(workers): evidence + reasoning written by pipeline stages"`

### Step 7 — Outreach worker emits sent events

- [ ] Modify `workers/src/outreach.worker.ts`: call emitEventAsync after successful send
- [ ] Test: assert CampaignEvent of type 'sent' created after mock send
- [ ] `git commit -m "feat(workers): emit sent CampaignEvent on outreach"`

### Step 8 — Webhook receiver emits delivery events

- [ ] Modify `backend/src/controllers/webhooks.controller.ts`: add mapProviderEvent, emit delivery events, auto-suppress hard bounces and spam complaints
- [ ] Test: send mock webhook payload, assert CampaignEvent created with correct eventType
- [ ] `git commit -m "feat(backend): emit delivery events from webhooks"`

### Step 9 — Frontend analytics dashboard

- [ ] Create `frontend/src/hooks/useAnalytics.ts`
- [ ] Create `frontend/src/components/analytics/KpiTileGrid.tsx`
- [ ] Create `frontend/src/components/analytics/TimelineChart.tsx`
- [ ] Create `frontend/src/components/analytics/FunnelChart.tsx`
- [ ] Create `frontend/src/components/analytics/AttributionTable.tsx`
- [ ] Create `frontend/src/app/(dashboard)/dashboard/analytics/page.tsx`
- [ ] Add Analytics link to Sidebar
- [ ] `git commit -m "feat(frontend): analytics dashboard"`

### Step 10 — Lead evidence UI

- [ ] Create `frontend/src/components/leads/EvidencePanel.tsx`
- [ ] Create `frontend/src/components/leads/QualificationReasoningCard.tsx`
- [ ] Modify `frontend/src/components/leads/LeadDetailDrawer.tsx`: add "Evidence" tab with EvidencePanel + QualificationReasoningCard
- [ ] Modify `frontend/src/app/(dashboard)/dashboard/campaigns/[campaignId]/page.tsx`: add funnel chart tab
- [ ] `git commit -m "feat(frontend): lead evidence panel + qualification reasoning"`

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | /analytics/overview | KPI summary for date range |
| GET | /analytics/daily | Day-by-day event breakdown |
| GET | /analytics/campaigns/:id/funnel | Per-campaign stage funnel |
| GET | /analytics/attribution/query | Outcome rates by source query |
| GET | /analytics/leads/:id/timeline | Event timeline for a lead |

---

## Verification Criteria

- CampaignEvent created after each outreach send (eventType: 'sent')
- CampaignEvent created after webhook delivers opened/clicked/bounced/replied events
- Hard bounce auto-adds email to suppression list
- Spam complaint auto-adds email to suppression list
- getOverviewMetrics returns correct open/reply/bounce rates for seeded test data
- getAttributionByQuery groups events by sourceQuery with correct reply rate math
- Analytics dashboard renders KPI tiles with real data, no blank state after seeding
- TimelineChart renders with correct x-axis dates
- Lead detail drawer shows Evidence tab with snippet cards and source badges
- Qualification reasoning card shows confidence bars with correct colours (green ≥ 70, yellow ≥ 40, red < 40)
