# Phase 10 — ABM Workspace, TAM Builder & Intelligence Products

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the higher-end strategic product layer — account-based marketing workspaces with stakeholder maps, a TAM builder for market sizing, buying-signal monitoring, and the AI prospecting copilot — differentiating LeadreAI from simple lead-list tools.

**Architecture:** ABM workspaces are `AccountPlan` documents linked to a lead, containing stakeholder arrays, pain-point hypotheses, outreach angle maps, and next-best-action lists. TAM Builder is an aggregation query over leads segmented by geography/industry, stored as `TamSnapshot`. Buying signals are a BullMQ cron job that re-scrapes company web pages looking for trigger keywords (hiring, funding, leadership change) and writes `BuyingSignal` documents. The AI Copilot is a streaming Claude conversation endpoint with workspace context injected.

**Tech Stack:** Backend: Express, Mongoose, BullMQ, Anthropic SDK (claude-sonnet-4-6). Frontend: Next.js 14, shadcn/ui, TanStack Query, Recharts.

---

## Roadmap Modules Covered

- Module 11 — Account Planning Workspace (account summaries, pain-point hypotheses, stakeholder map, outreach angles, objection map, next-best actions)
- Module 12 — TAM Builder and Territory Mapping (market sizing by geography, whitespace detection, ICP heatmaps)
- Module 10 — Buying Signals and Trigger Intelligence (hiring spikes, funding signals, leadership changes, website copy changes)
- Module 20 — AI Prospecting Copilot (conversational interface over workspace)

---

## File Map

### New Backend Files

| File | Responsibility |
|---|---|
| `backend/src/models/AccountPlan.ts` | Account plan: linked lead, stakeholder map, pain-point hypotheses, outreach angles, objection map, next actions |
| `backend/src/models/TamSnapshot.ts` | TAM snapshot: segment breakdown by industry/geography, total addressable count, coverage % |
| `backend/src/models/BuyingSignal.ts` | Detected trigger: lead id, signal type, evidence text, detected at |
| `backend/src/services/accountPlan/accountPlanService.ts` | Generate initial account plan from AI using lead evidence |
| `backend/src/services/tam/tamBuilder.ts` | Aggregate leads into TAM segments; estimate uncovered market |
| `backend/src/services/signals/signalDetector.ts` | Scrape company site and detect trigger keywords; write BuyingSignal |
| `backend/src/jobs/signalMonitorCron.ts` | BullMQ nightly cron: check all high-score leads for new signals |
| `backend/src/services/copilot/copilotService.ts` | Build context-rich prompt, stream Claude response |
| `backend/src/controllers/accountPlan.controller.ts` | CRUD + AI generate for account plans |
| `backend/src/controllers/tam.controller.ts` | Run TAM analysis, get snapshot history |
| `backend/src/controllers/signals.controller.ts` | List signals, mark reviewed, dismiss |
| `backend/src/controllers/copilot.controller.ts` | POST /copilot/chat — SSE streaming |
| `backend/src/routes/accountPlan.routes.ts` | Mount under `/account-plans` |
| `backend/src/routes/tam.routes.ts` | Mount under `/tam` |
| `backend/src/routes/signals.routes.ts` | Mount under `/signals` |
| `backend/src/routes/copilot.routes.ts` | Mount under `/copilot` |

### New Frontend Files

| File | Responsibility |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/account-plans/page.tsx` | List account plans with search |
| `frontend/src/app/(dashboard)/dashboard/account-plans/[planId]/page.tsx` | Account plan detail: stakeholders, pain points, outreach angles, next actions |
| `frontend/src/app/(dashboard)/dashboard/tam/page.tsx` | TAM builder: industry/geography filters, chart, coverage score |
| `frontend/src/app/(dashboard)/dashboard/signals/page.tsx` | Buying signals feed: filter by type, mark reviewed |
| `frontend/src/app/(dashboard)/dashboard/copilot/page.tsx` | AI copilot chat interface |
| `frontend/src/components/accountPlan/StakeholderMap.tsx` | Editable stakeholder table with role, seniority, influence |
| `frontend/src/components/accountPlan/OutreachAnglesPanel.tsx` | Per-persona outreach angle cards |
| `frontend/src/components/accountPlan/NextActionsChecklist.tsx` | Editable checklist of next-best actions |
| `frontend/src/components/tam/TamSegmentChart.tsx` | Recharts bar chart of TAM segments |
| `frontend/src/components/signals/SignalCard.tsx` | Signal card: company, type, evidence snippet, review button |
| `frontend/src/components/copilot/CopilotChat.tsx` | Streaming chat UI with message history |
| `frontend/src/hooks/useAccountPlan.ts` | TanStack Query hooks |
| `frontend/src/hooks/useTam.ts` | TanStack Query hooks |
| `frontend/src/hooks/useSignals.ts` | TanStack Query hooks |
| `frontend/src/hooks/useCopilot.ts` | SSE streaming hook |

---

## Data Models

### AccountPlan

```typescript
// backend/src/models/AccountPlan.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IStakeholder {
  name:       string;
  title:      string;
  department: string;
  seniority:  'c-suite' | 'vp' | 'director' | 'manager' | 'individual';
  influence:  'high' | 'medium' | 'low';
  stance:     'champion' | 'neutral' | 'blocker' | 'unknown';
  contactId?: Types.ObjectId;
  notes?:     string;
}

export interface IOutreachAngle {
  persona:     string;    // e.g. 'CEO', 'Head of Sales'
  angle:       string;    // core message angle
  painPoint:   string;
  proof:       string;    // social proof or evidence to use
  cta:         string;    // call to action
}

export interface IAccountPlan extends Document {
  workspaceId:       Types.ObjectId;
  leadId:            Types.ObjectId;
  companyName:       string;
  accountSummary:    string;
  painPoints:        string[];
  stakeholders:      IStakeholder[];
  outreachAngles:    IOutreachAngle[];
  objectionMap:      Array<{ objection: string; response: string }>;
  nextActions:       Array<{ action: string; completed: boolean; dueAt?: Date }>;
  relationshipNotes: string;
  generatedByAi:     boolean;
  createdAt:         Date;
  updatedAt:         Date;
}

const StakeholderSchema = new Schema<IStakeholder>({
  name:       { type: String, required: true },
  title:      { type: String },
  department: { type: String },
  seniority:  { type: String, enum: ['c-suite','vp','director','manager','individual'] },
  influence:  { type: String, enum: ['high','medium','low'], default: 'medium' },
  stance:     { type: String, enum: ['champion','neutral','blocker','unknown'], default: 'unknown' },
  contactId:  { type: Schema.Types.ObjectId, ref: 'Contact' },
  notes:      { type: String },
}, { _id: false });

const OutreachAngleSchema = new Schema<IOutreachAngle>({
  persona:   { type: String, required: true },
  angle:     { type: String, required: true },
  painPoint: { type: String },
  proof:     { type: String },
  cta:       { type: String },
}, { _id: false });

const AccountPlanSchema = new Schema<IAccountPlan>({
  workspaceId:       { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  leadId:            { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  companyName:       { type: String, required: true },
  accountSummary:    { type: String, default: '' },
  painPoints:        [{ type: String }],
  stakeholders:      [StakeholderSchema],
  outreachAngles:    [OutreachAngleSchema],
  objectionMap:      [{ objection: String, response: String }],
  nextActions:       [{ action: String, completed: Boolean, dueAt: Date }],
  relationshipNotes: { type: String, default: '' },
  generatedByAi:     { type: Boolean, default: false },
}, { timestamps: true });

export const AccountPlan = model<IAccountPlan>('AccountPlan', AccountPlanSchema);
```

### TamSnapshot

```typescript
// backend/src/models/TamSnapshot.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface ITamSegment {
  label:      string;   // e.g. 'SaaS - USA', 'Manufacturing - UK'
  dimension:  'industry' | 'geography' | 'combined';
  total:      number;   // total leads matching this segment
  qualified:  number;
  contacted:  number;
  coverage:   number;   // % of total that has been contacted
}

export interface ITamSnapshot extends Document {
  workspaceId: Types.ObjectId;
  queryFilter: {
    industry?:  string;
    geography?: string;
    minScore?:  number;
  };
  segments:    ITamSegment[];
  totalLeads:  number;
  totalMarketEstimate?: number;  // user-provided external estimate for comparison
  createdAt:   Date;
}

const TamSnapshotSchema = new Schema<ITamSnapshot>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  queryFilter: {
    industry:  { type: String },
    geography: { type: String },
    minScore:  { type: Number },
  },
  segments: [{
    label:     String,
    dimension: String,
    total:     Number,
    qualified: Number,
    contacted: Number,
    coverage:  Number,
  }],
  totalLeads:           { type: Number, default: 0 },
  totalMarketEstimate:  { type: Number },
}, { timestamps: true });

export const TamSnapshot = model<ITamSnapshot>('TamSnapshot', TamSnapshotSchema);
```

### BuyingSignal

```typescript
// backend/src/models/BuyingSignal.ts
import { Schema, model, Document, Types } from 'mongoose';

export type SignalType =
  | 'hiring_spike'
  | 'funding_announcement'
  | 'leadership_change'
  | 'technology_change'
  | 'expansion_signal'
  | 'website_copy_change'
  | 'new_partnership';

export interface IBuyingSignal extends Document {
  workspaceId:  Types.ObjectId;
  leadId:       Types.ObjectId;
  companyName:  string;
  signalType:   SignalType;
  evidence:     string;        // excerpt proving the signal
  sourceUrl?:   string;
  confidence:   number;        // 0.0–1.0
  detectedAt:   Date;
  isReviewed:   boolean;
  isDismissed:  boolean;
  createdAt:    Date;
}

const BuyingSignalSchema = new Schema<IBuyingSignal>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  leadId:      { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  companyName: { type: String, required: true },
  signalType:  { type: String, enum: ['hiring_spike','funding_announcement','leadership_change','technology_change','expansion_signal','website_copy_change','new_partnership'], required: true },
  evidence:    { type: String, required: true },
  sourceUrl:   { type: String },
  confidence:  { type: Number, default: 0.5 },
  detectedAt:  { type: Date, default: Date.now },
  isReviewed:  { type: Boolean, default: false },
  isDismissed: { type: Boolean, default: false },
}, { timestamps: true });

BuyingSignalSchema.index({ workspaceId: 1, isReviewed: 1, isDismissed: 1, detectedAt: -1 });

export const BuyingSignal = model<IBuyingSignal>('BuyingSignal', BuyingSignalSchema);
```

---

## Account Plan AI Generator

```typescript
// backend/src/services/accountPlan/accountPlanService.ts
import Anthropic from '@anthropic-ai/sdk';
import { Lead } from '../../models/Lead.js';
import { AccountPlan } from '../../models/AccountPlan.js';
import { Workspace } from '../../models/Workspace.js';
import type { Types } from 'mongoose';

const client = new Anthropic();

export async function generateAccountPlan(
  workspaceId: Types.ObjectId,
  leadId: Types.ObjectId,
): Promise<InstanceType<typeof AccountPlan>> {
  const [lead, workspace] = await Promise.all([
    Lead.findById(leadId).lean(),
    Workspace.findById(workspaceId).select('knowledgeBase').lean(),
  ]);
  if (!lead) throw new Error('Lead not found');

  const evidenceText = (lead.evidence ?? [])
    .slice(0, 5)
    .map((e: any) => `[${e.source}] ${e.snippet}`)
    .join('\n');

  const prompt = `You are an expert B2B account strategist. Based on the following company data and evidence, generate a comprehensive account plan.

Company: ${lead.company}
Domain: ${lead.domain ?? 'unknown'}
Industry: ${lead.industry ?? 'unknown'}
Size: ${lead.employeeCount ?? 'unknown'} employees
Score: ${lead.score ?? 0}/100
Qualification Reasoning: ${lead.qualificationReasoning ?? 'none'}
Evidence:
${evidenceText}

Return a JSON object with these exact keys:
{
  "accountSummary": "2-3 sentence summary of why this account is interesting",
  "painPoints": ["pain point 1", "pain point 2", "pain point 3"],
  "stakeholders": [
    {"name": "Unknown", "title": "CEO", "department": "Executive", "seniority": "c-suite", "influence": "high", "stance": "unknown", "notes": "Key decision maker"}
  ],
  "outreachAngles": [
    {"persona": "CEO", "angle": "core message angle", "painPoint": "specific pain", "proof": "social proof to use", "cta": "proposed call to action"}
  ],
  "objectionMap": [
    {"objection": "We already have a tool for that", "response": "Here's how we're different..."}
  ],
  "nextActions": [
    {"action": "Research CEO LinkedIn profile", "completed": false},
    {"action": "Identify warm intro path", "completed": false},
    {"action": "Personalize first email draft", "completed": false}
  ]
}`;

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2000,
    system:     'You are a B2B account planning expert. Return only valid JSON.',
    messages:   [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content?.type !== 'text') throw new Error('Unexpected AI response type');

  const jsonStr = content.text.replace(/```json\n?|\n?```/g, '').trim();
  const parsed  = JSON.parse(jsonStr);

  const plan = await AccountPlan.findOneAndUpdate(
    { workspaceId, leadId },
    {
      $set: {
        companyName:    lead.company,
        accountSummary: parsed.accountSummary,
        painPoints:     parsed.painPoints,
        stakeholders:   parsed.stakeholders,
        outreachAngles: parsed.outreachAngles,
        objectionMap:   parsed.objectionMap,
        nextActions:    parsed.nextActions,
        generatedByAi:  true,
      },
    },
    { upsert: true, new: true },
  );

  return plan;
}
```

---

## TAM Builder

```typescript
// backend/src/services/tam/tamBuilder.ts
import { Lead } from '../../models/Lead.js';
import { TamSnapshot } from '../../models/TamSnapshot.js';
import type { Types } from 'mongoose';

export interface TamFilter {
  industry?:  string;
  geography?: string;
  minScore?:  number;
}

export async function buildTamSnapshot(
  workspaceId: Types.ObjectId,
  filter: TamFilter,
): Promise<InstanceType<typeof TamSnapshot>> {
  const baseQuery: any = { workspaceId };
  if (filter.minScore) baseQuery.score = { $gte: filter.minScore };

  // Segment by industry
  const industryPipeline = [
    { $match: { ...baseQuery, industry: { $exists: true, $ne: '' } } },
    {
      $group: {
        _id:       '$industry',
        total:     { $sum: 1 },
        qualified: { $sum: { $cond: ['$isQualified', 1, 0] } },
        contacted: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$campaignIds', []] } }, 0] }, 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
    { $limit: 20 },
  ];

  const industryResults = await Lead.aggregate(industryPipeline);
  const segments = industryResults.map(r => ({
    label:     r._id as string,
    dimension: 'industry' as const,
    total:     r.total,
    qualified: r.qualified,
    contacted: r.contacted,
    coverage:  r.total > 0 ? Math.round((r.contacted / r.total) * 100) : 0,
  }));

  const totalLeads = await Lead.countDocuments(baseQuery);

  const snapshot = await TamSnapshot.create({
    workspaceId,
    queryFilter: filter,
    segments,
    totalLeads,
  });

  return snapshot;
}
```

---

## Buying Signal Detector

```typescript
// backend/src/services/signals/signalDetector.ts
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { BuyingSignal, type SignalType } from '../../models/BuyingSignal.js';
import type { Types } from 'mongoose';

const client = new Anthropic();

const SIGNAL_KEYWORDS: Record<SignalType, string[]> = {
  hiring_spike:          ['we\'re hiring', 'join our team', 'open positions', 'talent acquisition'],
  funding_announcement:  ['series a', 'series b', 'funding round', 'raised $', 'investment'],
  leadership_change:     ['new ceo', 'new cto', 'appointed as', 'joins as', 'welcome our new'],
  technology_change:     ['migrating to', 'switching to', 'now using', 'launched on', 'powered by'],
  expansion_signal:      ['new office', 'expanding to', 'opening in', 'new market', 'international'],
  website_copy_change:   [],  // detected by AI comparison only
  new_partnership:       ['partnership with', 'partner with', 'integration with', 'announcing'],
};

export async function detectSignalsForLead(
  workspaceId: Types.ObjectId,
  leadId: Types.ObjectId,
  companyName: string,
  domain: string,
): Promise<void> {
  let pageContent = '';
  try {
    const response = await axios.get(`https://${domain}`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadreAI-Bot/1.0)' },
    });
    pageContent = (response.data as string)
      .replace(/<[^>]+>/g, ' ')         // strip HTML tags
      .replace(/\s+/g, ' ')
      .slice(0, 4000);
  } catch {
    return; // unreachable domain — skip silently
  }

  const lowerContent = pageContent.toLowerCase();

  // Keyword scan
  for (const [signalType, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
    if (!keywords.length) continue;
    const matched = keywords.find(kw => lowerContent.includes(kw.toLowerCase()));
    if (!matched) continue;

    const startIdx = Math.max(0, lowerContent.indexOf(matched.toLowerCase()) - 100);
    const evidence = pageContent.slice(startIdx, startIdx + 300);

    await BuyingSignal.findOneAndUpdate(
      { workspaceId, leadId, signalType: signalType as SignalType },
      {
        $setOnInsert: {
          companyName, evidence, sourceUrl: `https://${domain}`,
          confidence: 0.7, detectedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }
}
```

---

## Signal Monitor Cron

```typescript
// backend/src/jobs/signalMonitorCron.ts
import { Queue, Worker } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { Lead } from '../models/Lead.js';
import { detectSignalsForLead } from '../services/signals/signalDetector.js';
import logger from '../config/logger.js';

const QUEUE_NAME = 'signal-monitor';

export function getSignalMonitorQueue() {
  return new Queue(QUEUE_NAME, { connection: getRedis() });
}

export async function scheduleSignalMonitor() {
  const queue = getSignalMonitorQueue();
  await queue.add('nightly-scan', {}, {
    repeat: { pattern: '0 3 * * *' }, // 03:00 UTC daily
    removeOnComplete: 5,
    removeOnFail: 5,
  });
  logger.info('[signalMonitor] Scheduled nightly at 03:00 UTC');
}

export function startSignalMonitorWorker() {
  const worker = new Worker(QUEUE_NAME, async () => {
    // Scan top 200 qualified leads across all workspaces
    const leads = await Lead.find({
      isQualified: true,
      domain: { $exists: true, $ne: '' },
    }).select('workspaceId domain company').limit(200).lean();

    logger.info(`[signalMonitor] Scanning ${leads.length} leads`);

    for (const lead of leads) {
      try {
        await detectSignalsForLead(lead.workspaceId, lead._id, lead.company, lead.domain!);
      } catch (err) {
        logger.warn(`[signalMonitor] Error scanning ${lead.domain}`, err);
      }
    }
  }, { connection: getRedis(), concurrency: 1 });

  worker.on('failed', (job, err) => logger.error('[signalMonitor] Job failed', err));
  return worker;
}
```

---

## AI Copilot Service

```typescript
// backend/src/services/copilot/copilotService.ts
import Anthropic from '@anthropic-ai/sdk';
import { Lead } from '../../models/Lead.js';
import { Campaign } from '../../models/Campaign.js';
import { Workspace } from '../../models/Workspace.js';
import type { Response } from 'express';
import type { Types } from 'mongoose';

const client = new Anthropic();

export interface CopilotMessage {
  role:    'user' | 'assistant';
  content: string;
}

export async function streamCopilotResponse(
  workspaceId: Types.ObjectId,
  messages: CopilotMessage[],
  res: Response,
): Promise<void> {
  // Build workspace context for the system prompt
  const [leadCount, campaignCount, workspace] = await Promise.all([
    Lead.countDocuments({ workspaceId }),
    Campaign.countDocuments({ workspaceId }),
    Workspace.findById(workspaceId).select('name knowledgeBase').lean(),
  ]);

  const knowledgeBase = (workspace?.knowledgeBase ?? [])
    .slice(0, 3)
    .map((kb: any) => kb.content ?? '')
    .join('\n\n');

  const systemPrompt = `You are an AI prospecting copilot for LeadreAI. You help the user understand their lead data, campaign performance, and suggest next actions.

Workspace: ${workspace?.name ?? 'Unknown'}
Total leads in workspace: ${leadCount}
Active campaigns: ${campaignCount}
${knowledgeBase ? `Company knowledge base:\n${knowledgeBase}` : ''}

You can help with:
- Explaining why a lead was qualified
- Suggesting better prospecting queries
- Recommending next campaigns to launch
- Summarizing market coverage
- Suggesting follow-up messaging options
- Identifying gaps in outreach strategy

Be concise and actionable. When suggesting queries, use specific language. When referencing data, be honest about what you know and don't know.`;

  // Set up SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');

  const stream = await client.messages.stream({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    system:     systemPrompt,
    messages:   messages.map(m => ({ role: m.role, content: m.content })),
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      res.write(`data: ${JSON.stringify({ delta: chunk.delta.text })}\n\n`);
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();
}
```

---

## Controllers

```typescript
// backend/src/controllers/accountPlan.controller.ts
import { Request, Response, NextFunction } from 'express';
import { AccountPlan } from '../models/AccountPlan.js';
import { generateAccountPlan } from '../services/accountPlan/accountPlanService.js';
import { ApiError } from '../utils/ApiError.js';

export async function listAccountPlans(req: Request, res: Response, next: NextFunction) {
  try {
    const plans = await AccountPlan.find({ workspaceId: req.user!.workspaceId })
      .sort({ updatedAt: -1 }).select('companyName leadId updatedAt generatedByAi').lean();
    res.json({ data: plans });
  } catch (err) { next(err); }
}

export async function getAccountPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await AccountPlan.findOne({ _id: req.params.id, workspaceId: req.user!.workspaceId }).lean();
    if (!plan) throw ApiError.notFound('Account plan not found');
    res.json({ data: plan });
  } catch (err) { next(err); }
}

export async function createOrGenerateAccountPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const { leadId } = req.body;
    if (!leadId) throw ApiError.badRequest('leadId required');
    const plan = await generateAccountPlan(req.user!.workspaceId, leadId);
    res.status(201).json({ data: plan });
  } catch (err) { next(err); }
}

export async function updateAccountPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await AccountPlan.findOneAndUpdate(
      { _id: req.params.id, workspaceId: req.user!.workspaceId },
      { $set: req.body },
      { new: true },
    );
    if (!plan) throw ApiError.notFound('Account plan not found');
    res.json({ data: plan });
  } catch (err) { next(err); }
}
```

```typescript
// backend/src/controllers/tam.controller.ts
import { Request, Response, NextFunction } from 'express';
import { buildTamSnapshot } from '../services/tam/tamBuilder.js';
import { TamSnapshot } from '../models/TamSnapshot.js';

export async function runTamAnalysis(req: Request, res: Response, next: NextFunction) {
  try {
    const { industry, geography, minScore } = req.body;
    const snapshot = await buildTamSnapshot(req.user!.workspaceId, { industry, geography, minScore });
    res.status(201).json({ data: snapshot });
  } catch (err) { next(err); }
}

export async function getTamHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const snapshots = await TamSnapshot.find({ workspaceId: req.user!.workspaceId })
      .sort({ createdAt: -1 }).limit(10).lean();
    res.json({ data: snapshots });
  } catch (err) { next(err); }
}
```

```typescript
// backend/src/controllers/signals.controller.ts
import { Request, Response, NextFunction } from 'express';
import { BuyingSignal } from '../models/BuyingSignal.js';
import { ApiError } from '../utils/ApiError.js';

export async function listSignals(req: Request, res: Response, next: NextFunction) {
  try {
    const { signalType, reviewed } = req.query as { signalType?: string; reviewed?: string };
    const query: any = {
      workspaceId: req.user!.workspaceId,
      isDismissed: false,
    };
    if (signalType) query.signalType = signalType;
    if (reviewed !== undefined) query.isReviewed = reviewed === 'true';

    const signals = await BuyingSignal.find(query)
      .sort({ detectedAt: -1 }).limit(50).lean();
    res.json({ data: signals });
  } catch (err) { next(err); }
}

export async function markSignalReviewed(req: Request, res: Response, next: NextFunction) {
  try {
    const signal = await BuyingSignal.findOneAndUpdate(
      { _id: req.params.id, workspaceId: req.user!.workspaceId },
      { $set: { isReviewed: true } },
      { new: true },
    );
    if (!signal) throw ApiError.notFound('Signal not found');
    res.json({ data: signal });
  } catch (err) { next(err); }
}

export async function dismissSignal(req: Request, res: Response, next: NextFunction) {
  try {
    await BuyingSignal.findOneAndUpdate(
      { _id: req.params.id, workspaceId: req.user!.workspaceId },
      { $set: { isDismissed: true } },
    );
    res.status(204).end();
  } catch (err) { next(err); }
}
```

```typescript
// backend/src/controllers/copilot.controller.ts
import { Request, Response, NextFunction } from 'express';
import { streamCopilotResponse } from '../services/copilot/copilotService.js';
import { ApiError } from '../utils/ApiError.js';

export async function chatWithCopilot(req: Request, res: Response, next: NextFunction) {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw ApiError.badRequest('messages array required');
    }
    await streamCopilotResponse(req.user!.workspaceId, messages, res);
  } catch (err) { next(err); }
}
```

---

## Routes

```typescript
// backend/src/routes/accountPlan.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { listAccountPlans, getAccountPlan, createOrGenerateAccountPlan, updateAccountPlan } from '../controllers/accountPlan.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',       listAccountPlans);
router.get('/:id',    getAccountPlan);
router.post('/',      createOrGenerateAccountPlan);
router.patch('/:id',  updateAccountPlan);

export default router;
```

```typescript
// backend/src/routes/tam.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { runTamAnalysis, getTamHistory } from '../controllers/tam.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',   getTamHistory);
router.post('/',  runTamAnalysis);

export default router;
```

```typescript
// backend/src/routes/signals.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { listSignals, markSignalReviewed, dismissSignal } from '../controllers/signals.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',                   listSignals);
router.patch('/:id/reviewed',     markSignalReviewed);
router.delete('/:id',             dismissSignal);

export default router;
```

```typescript
// backend/src/routes/copilot.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { chatWithCopilot } from '../controllers/copilot.controller.js';

const router = Router();
router.use(authenticate);
router.post('/chat', chatWithCopilot);

export default router;
```

---

## Frontend: Copilot Chat

```tsx
// frontend/src/components/copilot/CopilotChat.tsx
'use client';
import { useState, useRef } from 'react';
import { Send } from 'lucide-react';

interface Message { role: 'user' | 'assistant'; content: string; }

export default function CopilotChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! I\'m your AI prospecting copilot. Ask me about your leads, campaigns, or what to do next.' }
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function sendMessage() {
    if (!input.trim() || streaming) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages([...updatedMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    try {
      const response = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            assistantText += parsed.delta ?? '';
            setMessages(prev => [
              ...prev.slice(0, -1),
              { role: 'assistant', content: assistantText },
            ]);
          } catch {}
        }
      }
    } finally {
      setStreaming(false);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-lg rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-muted text-foreground'
            }`}>
              {m.content}
              {m.role === 'assistant' && streaming && i === messages.length - 1 && (
                <span className="inline-block w-1 h-3 ml-0.5 bg-current animate-pulse" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Ask about your leads or campaigns…"
          disabled={streaming}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

---

## Frontend: Account Plan Detail

```tsx
// frontend/src/app/(dashboard)/dashboard/account-plans/[planId]/page.tsx
'use client';
import { use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import StakeholderMap from '@/components/accountPlan/StakeholderMap';
import OutreachAnglesPanel from '@/components/accountPlan/OutreachAnglesPanel';
import NextActionsChecklist from '@/components/accountPlan/NextActionsChecklist';

export default function AccountPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const qc = useQueryClient();

  const planQ = useQuery({
    queryKey: ['account-plan', planId],
    queryFn:  () => api.get(`/account-plans/${planId}`).then(r => r.data.data),
  });

  const updateMut = useMutation({
    mutationFn: (data: any) => api.patch(`/account-plans/${planId}`, data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['account-plan', planId] }),
  });

  const plan = planQ.data;
  if (planQ.isLoading) return <div className="p-6">Loading…</div>;
  if (!plan) return <div className="p-6 text-muted-foreground">Plan not found.</div>;

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">{plan.companyName}</h1>
        {plan.generatedByAi && (
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ml-2">AI Generated</span>
        )}
        <p className="text-sm text-muted-foreground mt-2">{plan.accountSummary}</p>
      </div>

      <section>
        <h2 className="text-base font-medium mb-2">Pain Points</h2>
        <ul className="space-y-1">
          {plan.painPoints.map((p: string, i: number) => (
            <li key={i} className="text-sm text-muted-foreground flex gap-2">
              <span className="text-red-500">•</span> {p}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-base font-medium mb-3">Stakeholder Map</h2>
        <StakeholderMap stakeholders={plan.stakeholders} />
      </section>

      <section>
        <h2 className="text-base font-medium mb-3">Outreach Angles</h2>
        <OutreachAnglesPanel angles={plan.outreachAngles} />
      </section>

      <section>
        <h2 className="text-base font-medium mb-3">Next Actions</h2>
        <NextActionsChecklist
          actions={plan.nextActions}
          onChange={(nextActions) => updateMut.mutate({ nextActions })}
        />
      </section>
    </div>
  );
}
```

---

## Frontend: Signal Feed

```tsx
// frontend/src/components/signals/SignalCard.tsx
import { TrendingUp, Users, DollarSign, Zap, Building2, Globe } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const SIGNAL_ICONS: Record<string, any> = {
  hiring_spike:           Users,
  funding_announcement:   DollarSign,
  leadership_change:      Users,
  technology_change:      Zap,
  expansion_signal:       Building2,
  new_partnership:        Globe,
  website_copy_change:    TrendingUp,
};

const SIGNAL_LABELS: Record<string, string> = {
  hiring_spike:          'Hiring Spike',
  funding_announcement:  'Funding',
  leadership_change:     'Leadership Change',
  technology_change:     'Tech Change',
  expansion_signal:      'Expansion',
  new_partnership:       'New Partnership',
  website_copy_change:   'Website Change',
};

interface Signal {
  _id: string; companyName: string; signalType: string; evidence: string;
  confidence: number; detectedAt: string; isReviewed: boolean;
}

interface Props { signal: Signal; onReview: () => void; onDismiss: () => void; }

export default function SignalCard({ signal, onReview, onDismiss }: Props) {
  const Icon = SIGNAL_ICONS[signal.signalType] ?? TrendingUp;
  return (
    <div className={`border rounded-lg p-4 space-y-2 ${signal.isReviewed ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-blue-500" />
          <span className="text-xs font-medium text-blue-600 uppercase">{SIGNAL_LABELS[signal.signalType]}</span>
          <span className="text-xs text-muted-foreground">{Math.round(signal.confidence * 100)}% confidence</span>
        </div>
        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(signal.detectedAt))} ago</span>
      </div>
      <p className="font-medium text-sm">{signal.companyName}</p>
      <p className="text-xs text-muted-foreground line-clamp-2">{signal.evidence}</p>
      <div className="flex gap-2">
        {!signal.isReviewed && (
          <button onClick={onReview} className="text-xs text-blue-500 hover:underline">Mark reviewed</button>
        )}
        <button onClick={onDismiss} className="text-xs text-muted-foreground hover:text-red-500">Dismiss</button>
      </div>
    </div>
  );
}
```

---

## Implementation Sequence

### Step 1 — AccountPlan + TamSnapshot + BuyingSignal models

- [ ] Create `backend/src/models/AccountPlan.ts`
- [ ] Create `backend/src/models/TamSnapshot.ts`
- [ ] Create `backend/src/models/BuyingSignal.ts`
- [ ] Test: create each, assert indexes
- [ ] `git commit -m "feat(backend): AccountPlan + TamSnapshot + BuyingSignal models"`

### Step 2 — Account plan AI generator

- [ ] Create `backend/src/services/accountPlan/accountPlanService.ts` (generateAccountPlan)
- [ ] Test: generateAccountPlan with a seeded lead returns JSON with all required keys (accountSummary, painPoints, stakeholders, outreachAngles, objectionMap, nextActions)
- [ ] Test: calling generateAccountPlan twice for same leadId upserts instead of duplicating
- [ ] `git commit -m "feat(backend): AI account plan generator"`

### Step 3 — TAM builder

- [ ] Create `backend/src/services/tam/tamBuilder.ts` (buildTamSnapshot)
- [ ] Test: with seeded leads, buildTamSnapshot returns segments with correct totals
- [ ] `git commit -m "feat(backend): TAM builder aggregation service"`

### Step 4 — Signal detector + monitor cron

- [ ] Create `backend/src/services/signals/signalDetector.ts` (detectSignalsForLead)
- [ ] Create `backend/src/jobs/signalMonitorCron.ts` (scheduleSignalMonitor, startSignalMonitorWorker)
- [ ] Start worker in `backend/src/server.ts`
- [ ] Test: detectSignalsForLead with mock HTML containing 'series a' creates funding_announcement BuyingSignal; calling again does not duplicate (upsert)
- [ ] `git commit -m "feat(backend): buying signal detector + nightly cron"`

### Step 5 — Copilot streaming service

- [ ] Create `backend/src/services/copilot/copilotService.ts` (streamCopilotResponse)
- [ ] Test: streamCopilotResponse writes SSE events to mock res object; final event is `data: [DONE]`
- [ ] `git commit -m "feat(backend): AI copilot streaming service"`

### Step 6 — All controllers + routes

- [ ] Create `backend/src/controllers/accountPlan.controller.ts` (4 handlers)
- [ ] Create `backend/src/controllers/tam.controller.ts` (2 handlers)
- [ ] Create `backend/src/controllers/signals.controller.ts` (3 handlers)
- [ ] Create `backend/src/controllers/copilot.controller.ts` (1 handler)
- [ ] Create all 4 route files
- [ ] Mount all in `backend/src/app.ts`
- [ ] `git commit -m "feat(backend): account plan + TAM + signals + copilot routes"`

### Step 7 — Frontend account plans

- [ ] Create `frontend/src/app/(dashboard)/dashboard/account-plans/page.tsx` (list + create button)
- [ ] Create `frontend/src/components/accountPlan/StakeholderMap.tsx` (table with seniority/influence/stance columns)
- [ ] Create `frontend/src/components/accountPlan/OutreachAnglesPanel.tsx` (card per persona)
- [ ] Create `frontend/src/components/accountPlan/NextActionsChecklist.tsx` (checkbox list, editable, persists on change)
- [ ] Create `frontend/src/app/(dashboard)/dashboard/account-plans/[planId]/page.tsx`
- [ ] Add "Account Plans" to Sidebar
- [ ] `git commit -m "feat(frontend): account plan workspace"`

### Step 8 — Frontend TAM builder + signals + copilot

- [ ] Create `frontend/src/components/tam/TamSegmentChart.tsx` (Recharts BarChart of segments)
- [ ] Create `frontend/src/app/(dashboard)/dashboard/tam/page.tsx` (filter form, run button, chart, history)
- [ ] Create `frontend/src/components/signals/SignalCard.tsx`
- [ ] Create `frontend/src/app/(dashboard)/dashboard/signals/page.tsx` (feed with type filter)
- [ ] Create `frontend/src/components/copilot/CopilotChat.tsx` (SSE streaming chat)
- [ ] Create `frontend/src/app/(dashboard)/dashboard/copilot/page.tsx`
- [ ] Add TAM, Signals, Copilot links to Sidebar
- [ ] `git commit -m "feat(frontend): TAM builder + signals feed + AI copilot"`

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | /account-plans | List account plans |
| POST | /account-plans | Generate AI account plan for leadId |
| GET | /account-plans/:id | Get account plan |
| PATCH | /account-plans/:id | Update account plan (stakeholders, actions, etc.) |
| GET | /tam | TAM snapshot history |
| POST | /tam | Run TAM analysis |
| GET | /signals | List buying signals |
| PATCH | /signals/:id/reviewed | Mark signal reviewed |
| DELETE | /signals/:id | Dismiss signal |
| POST | /copilot/chat | SSE streaming copilot response |

---

## Verification Criteria

- generateAccountPlan returns JSON with all 6 required keys; invalid JSON from AI throws and is caught by controller
- buildTamSnapshot with 0 leads returns empty segments array, totalLeads = 0
- detectSignalsForLead finds 'series a' text → creates `funding_announcement` signal; second call does not create duplicate
- streamCopilotResponse writes SSE lines starting with `data: `; final line is `data: [DONE]`; response ends cleanly
- listSignals excludes dismissed signals (isDismissed = true)
- markSignalReviewed sets isReviewed = true; dismissSignal soft-deletes with isDismissed = true
- Account plan page renders all sections: summary, pain points, stakeholder table, outreach angles, next actions checklist
- Checking a next action checkbox calls PATCH with updated nextActions array
- TAM chart renders with correct bar labels from segment.label
- Copilot chat renders streaming tokens progressively with cursor animation
- Signal feed shows type badge and confidence percentage on each card
