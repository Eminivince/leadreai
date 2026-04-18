# Phase 6 — Saved Searches, Automation & Triggers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn LeadreAI into an always-on prospecting engine — saves search queries, reruns them on a schedule, auto-enriches and auto-qualifies new matches, and notifies owners via Slack or email.

**Architecture:** `SavedSearch` documents store a query + schedule (cron expression) + action config. BullMQ's repeatable jobs run each saved search on its schedule, push new leads through the standard pipeline, then fire notification webhooks or Slack messages. A separate `WorkspaceNotification` collection records in-app notifications with read state.

**Tech Stack:** Backend: Express, Mongoose, BullMQ repeatable jobs, node-cron for validation. Slack: Slack webhook URLs stored per workspace. Frontend: Next.js 14, shadcn/ui, TanStack Query.

---

## Roadmap Modules Covered

- Module 8 — Automation and Triggers (saved searches, scheduled refreshes, trigger on new matching companies, auto-enrich, auto-qualify, auto-sync, notify via Slack/email)
- Module 10 partial — Buying Signals (trigger on new matches as a baseline for signal monitoring)

---

## File Map

### New Backend Files

| File | Responsibility |
|---|---|
| `backend/src/models/SavedSearch.ts` | Saved search: query text, filters, schedule cron, enabled flag, last run |
| `backend/src/models/WorkspaceNotification.ts` | In-app notification: title, body, link, isRead, type |
| `backend/src/services/savedSearch/savedSearchRunner.ts` | Runs a saved search: dispatches prospecting job, records results |
| `backend/src/services/notifications/notificationService.ts` | Create/list/mark-read workspace notifications |
| `backend/src/services/notifications/slackNotifier.ts` | POST to Slack webhook URL with structured message |
| `backend/src/jobs/savedSearchScheduler.ts` | BullMQ worker + repeatable job manager for saved searches |
| `backend/src/controllers/savedSearch.controller.ts` | CRUD for saved searches |
| `backend/src/controllers/notifications.controller.ts` | List, mark read, mark all read |
| `backend/src/routes/savedSearch.routes.ts` | Mount under `/saved-searches` |
| `backend/src/routes/notifications.routes.ts` | Mount under `/notifications` |

### Modified Backend Files

| File | Changes |
|---|---|
| `backend/src/models/Workspace.ts` | Add `slackWebhookUrl`, `notificationEmail` fields |
| `backend/src/controllers/workspace.controller.ts` | Expose update endpoint for slackWebhookUrl, notificationEmail |
| `backend/src/server.ts` | Start savedSearch scheduler worker on boot |

### New Frontend Files

| File | Responsibility |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/saved-searches/page.tsx` | List saved searches, run now button, enable/disable toggle |
| `frontend/src/components/savedSearch/SavedSearchForm.tsx` | Create/edit form: query, schedule picker, auto-actions checkboxes |
| `frontend/src/components/savedSearch/SavedSearchCard.tsx` | Card: query, schedule, last run, new leads count |
| `frontend/src/components/notifications/NotificationBell.tsx` | Bell icon in topbar with unread badge |
| `frontend/src/components/notifications/NotificationDropdown.tsx` | Dropdown list of recent notifications with mark-read |
| `frontend/src/hooks/useSavedSearches.ts` | TanStack Query hooks |
| `frontend/src/hooks/useNotifications.ts` | Query + mutation hooks for notifications |

### Modified Frontend Files

| File | Changes |
|---|---|
| `frontend/src/components/layout/Topbar.tsx` | Add NotificationBell component |
| `frontend/src/app/(dashboard)/dashboard/settings/page.tsx` | Add Slack Webhook URL + Notification Email fields |

---

## Data Models

### SavedSearch

```typescript
// backend/src/models/SavedSearch.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface ISavedSearchActions {
  autoEnrich:    boolean;   // run enrichment pipeline on new matches
  autoQualify:   boolean;   // run qualification stage
  autoSyncCrm:   boolean;   // push to HubSpot if connected
  notifySlack:   boolean;
  notifyEmail:   boolean;
  autoDraftOutreach: boolean; // generate outreach drafts for qualified leads
}

export interface ISavedSearch extends Document {
  workspaceId:    Types.ObjectId;
  name:           string;
  query:          string;
  filters: {
    minScore?:    number;
    maxResults?:  number;
    industry?:    string;
    geography?:   string;
  };
  schedule:       string;   // cron expression, e.g. '0 8 * * 1' = Mon 8am
  isEnabled:      boolean;
  actions:        ISavedSearchActions;
  lastRunAt?:     Date;
  lastRunStatus?: 'success' | 'failed' | 'running';
  lastRunNewLeads:number;   // how many new unique leads were found last run
  totalRunCount:  number;
  createdAt:      Date;
  updatedAt:      Date;
}

const SavedSearchSchema = new Schema<ISavedSearch>({
  workspaceId:      { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  name:             { type: String, required: true },
  query:            { type: String, required: true },
  filters: {
    minScore:       { type: Number },
    maxResults:     { type: Number, default: 20 },
    industry:       { type: String },
    geography:      { type: String },
  },
  schedule:         { type: String, required: true },
  isEnabled:        { type: Boolean, default: true },
  actions: {
    autoEnrich:          { type: Boolean, default: true },
    autoQualify:         { type: Boolean, default: true },
    autoSyncCrm:         { type: Boolean, default: false },
    notifySlack:         { type: Boolean, default: false },
    notifyEmail:         { type: Boolean, default: false },
    autoDraftOutreach:   { type: Boolean, default: false },
  },
  lastRunAt:         { type: Date },
  lastRunStatus:     { type: String, enum: ['success', 'failed', 'running'] },
  lastRunNewLeads:   { type: Number, default: 0 },
  totalRunCount:     { type: Number, default: 0 },
}, { timestamps: true });

export const SavedSearch = model<ISavedSearch>('SavedSearch', SavedSearchSchema);
```

### WorkspaceNotification

```typescript
// backend/src/models/WorkspaceNotification.ts
import { Schema, model, Document, Types } from 'mongoose';

export type NotificationType =
  | 'saved_search_completed'
  | 'new_leads_found'
  | 'campaign_reply'
  | 'sequence_completed'
  | 'domain_health_degraded'
  | 'credit_low';

export interface IWorkspaceNotification extends Document {
  workspaceId: Types.ObjectId;
  type:        NotificationType;
  title:       string;
  body:        string;
  link?:       string;         // frontend route to navigate to
  isRead:      boolean;
  metadata?:   Record<string, any>;
  createdAt:   Date;
}

const WorkspaceNotificationSchema = new Schema<IWorkspaceNotification>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  type:        { type: String, required: true },
  title:       { type: String, required: true },
  body:        { type: String, required: true },
  link:        { type: String },
  isRead:      { type: Boolean, default: false, index: true },
  metadata:    { type: Schema.Types.Mixed },
}, { timestamps: true });

WorkspaceNotificationSchema.index({ workspaceId: 1, isRead: 1, createdAt: -1 });

export const WorkspaceNotification = model<IWorkspaceNotification>('WorkspaceNotification', WorkspaceNotificationSchema);
```

---

## Saved Search Runner

```typescript
// backend/src/services/savedSearch/savedSearchRunner.ts
import { SavedSearch } from '../../models/SavedSearch.js';
import { Job as BullJob } from '../../models/Job.js';         // existing Job model
import { createNotification } from '../notifications/notificationService.js';
import { postSlackMessage } from '../notifications/slackNotifier.js';
import { Workspace } from '../../models/Workspace.js';
import { getProspectingQueue } from '../../queues/index.js';   // existing queue getter
import logger from '../../config/logger.js';

export async function runSavedSearch(savedSearchId: string): Promise<void> {
  const ss = await SavedSearch.findById(savedSearchId);
  if (!ss || !ss.isEnabled) return;

  ss.lastRunStatus = 'running';
  ss.lastRunAt     = new Date();
  await ss.save();

  try {
    // Dispatch a standard prospecting job with the saved search query
    const job = await BullJob.create({
      workspaceId: ss.workspaceId,
      type:        'prospecting',
      query:       ss.query,
      filters:     ss.filters,
      source:      'saved_search',
      savedSearchId: ss._id,
      autoEnrich:  ss.actions.autoEnrich,
      autoQualify: ss.actions.autoQualify,
    });

    await getProspectingQueue().add('run', { jobId: job._id.toString() });

    // BullMQ job completion is async; the job worker will call finalizeSavedSearchRun()
    logger.info(`[savedSearch] Queued run for "${ss.name}" (${savedSearchId})`);
  } catch (err) {
    ss.lastRunStatus = 'failed';
    await ss.save();
    logger.error(`[savedSearch] Failed to queue run for ${savedSearchId}`, err);
    throw err;
  }
}

// Called by the prospecting worker after job completes
export async function finalizeSavedSearchRun(
  savedSearchId: string,
  newLeadsCount: number,
): Promise<void> {
  const ss = await SavedSearch.findById(savedSearchId);
  if (!ss) return;

  ss.lastRunStatus  = 'success';
  ss.lastRunNewLeads = newLeadsCount;
  ss.totalRunCount  += 1;
  await ss.save();

  const ws = await Workspace.findById(ss.workspaceId).select('slackWebhookUrl notificationEmail').lean();

  // In-app notification
  await createNotification(ss.workspaceId, {
    type:  'saved_search_completed',
    title: `Saved search "${ss.name}" completed`,
    body:  `${newLeadsCount} new lead${newLeadsCount !== 1 ? 's' : ''} found.`,
    link:  `/dashboard/campaigns`,
    metadata: { savedSearchId: ss._id, newLeadsCount },
  });

  // Slack notification
  if (ss.actions.notifySlack && ws?.slackWebhookUrl) {
    await postSlackMessage(ws.slackWebhookUrl, {
      text: `*LeadreAI* — Saved search *${ss.name}* found ${newLeadsCount} new lead${newLeadsCount !== 1 ? 's' : ''}.`,
    });
  }
}
```

---

## Notification Service

```typescript
// backend/src/services/notifications/notificationService.ts
import { WorkspaceNotification, type NotificationType } from '../../models/WorkspaceNotification.js';
import type { Types } from 'mongoose';

interface CreateOpts {
  type:     NotificationType;
  title:    string;
  body:     string;
  link?:    string;
  metadata?: Record<string, any>;
}

export async function createNotification(workspaceId: Types.ObjectId, opts: CreateOpts) {
  return WorkspaceNotification.create({ workspaceId, ...opts });
}

export async function listNotifications(
  workspaceId: Types.ObjectId,
  limit = 20,
): Promise<{ notifications: any[]; unreadCount: number }> {
  const [notifications, unreadCount] = await Promise.all([
    WorkspaceNotification.find({ workspaceId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    WorkspaceNotification.countDocuments({ workspaceId, isRead: false }),
  ]);
  return { notifications, unreadCount };
}

export async function markRead(workspaceId: Types.ObjectId, notificationId: string) {
  return WorkspaceNotification.findOneAndUpdate(
    { _id: notificationId, workspaceId },
    { $set: { isRead: true } },
  );
}

export async function markAllRead(workspaceId: Types.ObjectId) {
  return WorkspaceNotification.updateMany({ workspaceId, isRead: false }, { $set: { isRead: true } });
}
```

---

## Slack Notifier

```typescript
// backend/src/services/notifications/slackNotifier.ts
import axios from 'axios';
import logger from '../../config/logger.js';

interface SlackMessage {
  text: string;
  blocks?: any[];
}

export async function postSlackMessage(webhookUrl: string, message: SlackMessage): Promise<void> {
  try {
    await axios.post(webhookUrl, message, { timeout: 5000 });
    logger.info('[slack] Message posted');
  } catch (err: any) {
    logger.warn('[slack] Failed to post message', { error: err.message });
  }
}
```

---

## Saved Search BullMQ Scheduler

```typescript
// backend/src/jobs/savedSearchScheduler.ts
import { Queue, Worker } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { SavedSearch } from '../models/SavedSearch.js';
import { runSavedSearch } from '../services/savedSearch/savedSearchRunner.js';
import logger from '../config/logger.js';

const QUEUE_NAME = 'saved-search-scheduler';

export function getSavedSearchQueue() {
  return new Queue(QUEUE_NAME, { connection: getRedis() });
}

// Register all enabled saved searches as BullMQ repeatable jobs
export async function syncSavedSearchJobs(): Promise<void> {
  const queue = getSavedSearchQueue();
  const searches = await SavedSearch.find({ isEnabled: true }).lean();

  // Remove all existing repeatables; re-add from current DB state
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  for (const ss of searches) {
    await queue.add(
      'run-saved-search',
      { savedSearchId: ss._id.toString() },
      {
        repeat: { pattern: ss.schedule },
        jobId:  `saved-search-${ss._id}`,
        removeOnComplete: 5,
        removeOnFail: 5,
      },
    );
    logger.info(`[savedSearchScheduler] Registered "${ss.name}" on schedule ${ss.schedule}`);
  }
}

export function startSavedSearchWorker() {
  const worker = new Worker(QUEUE_NAME, async (job) => {
    const { savedSearchId } = job.data as { savedSearchId: string };
    await runSavedSearch(savedSearchId);
  }, { connection: getRedis(), concurrency: 2 });

  worker.on('failed', (job, err) => {
    logger.error('[savedSearchScheduler] Job failed', { jobId: job?.id, err });
  });

  return worker;
}
```

---

## Saved Search Controller

```typescript
// backend/src/controllers/savedSearch.controller.ts
import { Request, Response, NextFunction } from 'express';
import { SavedSearch } from '../models/SavedSearch.js';
import { syncSavedSearchJobs } from '../jobs/savedSearchScheduler.js';
import { runSavedSearch } from '../services/savedSearch/savedSearchRunner.js';
import { ApiError } from '../utils/ApiError.js';

const VALID_CRON = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;

function validateCron(cron: string): boolean {
  return VALID_CRON.test(cron.trim());
}

// GET /saved-searches
export async function listSavedSearches(req: Request, res: Response, next: NextFunction) {
  try {
    const searches = await SavedSearch.find({ workspaceId: req.user!.workspaceId })
      .sort({ createdAt: -1 }).lean();
    res.json({ data: searches });
  } catch (err) { next(err); }
}

// POST /saved-searches
export async function createSavedSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, query, filters, schedule, actions } = req.body;
    if (!validateCron(schedule)) throw ApiError.badRequest('Invalid cron expression');
    const ss = await SavedSearch.create({
      workspaceId: req.user!.workspaceId,
      name, query, filters, schedule, actions,
    });
    await syncSavedSearchJobs();
    res.status(201).json({ data: ss });
  } catch (err) { next(err); }
}

// PATCH /saved-searches/:id
export async function updateSavedSearch(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body.schedule && !validateCron(req.body.schedule)) {
      throw ApiError.badRequest('Invalid cron expression');
    }
    const ss = await SavedSearch.findOneAndUpdate(
      { _id: req.params.id, workspaceId: req.user!.workspaceId },
      { $set: req.body },
      { new: true },
    );
    if (!ss) throw ApiError.notFound('Saved search not found');
    await syncSavedSearchJobs();
    res.json({ data: ss });
  } catch (err) { next(err); }
}

// DELETE /saved-searches/:id
export async function deleteSavedSearch(req: Request, res: Response, next: NextFunction) {
  try {
    await SavedSearch.findOneAndDelete({ _id: req.params.id, workspaceId: req.user!.workspaceId });
    await syncSavedSearchJobs();
    res.status(204).end();
  } catch (err) { next(err); }
}

// POST /saved-searches/:id/run  — manual trigger
export async function runNow(req: Request, res: Response, next: NextFunction) {
  try {
    const ss = await SavedSearch.findOne({ _id: req.params.id, workspaceId: req.user!.workspaceId });
    if (!ss) throw ApiError.notFound('Saved search not found');
    await runSavedSearch(ss._id.toString());
    res.json({ data: { message: 'Run queued' } });
  } catch (err) { next(err); }
}
```

---

## Routes

```typescript
// backend/src/routes/savedSearch.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  listSavedSearches, createSavedSearch, updateSavedSearch,
  deleteSavedSearch, runNow,
} from '../controllers/savedSearch.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',          listSavedSearches);
router.post('/',         createSavedSearch);
router.patch('/:id',     updateSavedSearch);
router.delete('/:id',    deleteSavedSearch);
router.post('/:id/run',  runNow);

export default router;
```

```typescript
// backend/src/routes/notifications.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  listNotifications, markRead, markAllRead,
} from '../controllers/notifications.controller.ts';

const router = Router();
router.use(authenticate);

router.get('/',               listNotifications);
router.patch('/:id/read',     markRead);
router.post('/mark-all-read', markAllRead);

export default router;
```

---

## Notifications Controller

```typescript
// backend/src/controllers/notifications.controller.ts
import { Request, Response, NextFunction } from 'express';
import {
  listNotifications as listSvc,
  markRead as markReadSvc,
  markAllRead as markAllReadSvc,
} from '../services/notifications/notificationService.js';

export async function listNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listSvc(req.user!.workspaceId, 30);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    await markReadSvc(req.user!.workspaceId, req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    await markAllReadSvc(req.user!.workspaceId);
    res.status(204).end();
  } catch (err) { next(err); }
}
```

---

## Frontend: Saved Searches Page

```tsx
// frontend/src/app/(dashboard)/dashboard/saved-searches/page.tsx
'use client';
import { useSavedSearches } from '@/hooks/useSavedSearches';
import SavedSearchCard from '@/components/savedSearch/SavedSearchCard';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function SavedSearchesPage() {
  const { searches, isLoading, runNow } = useSavedSearches();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Saved Searches</h1>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Search</Button>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 border rounded-lg animate-pulse bg-muted" />)}
        </div>
      ) : searches.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>No saved searches yet. Create one to run automated prospecting.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {searches.map(ss => (
            <SavedSearchCard key={ss._id} search={ss} onRunNow={() => runNow(ss._id)} />
          ))}
        </div>
      )}
    </div>
  );
}
```

```tsx
// frontend/src/components/savedSearch/SavedSearchCard.tsx
import { Play, Pause, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SavedSearch {
  _id: string; name: string; query: string; schedule: string;
  isEnabled: boolean; lastRunAt?: string; lastRunNewLeads: number;
  lastRunStatus?: string;
}

interface Props { search: SavedSearch; onRunNow: () => void; }

export default function SavedSearchCard({ search, onRunNow }: Props) {
  return (
    <div className="border rounded-lg p-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{search.name}</p>
        <p className="text-sm text-muted-foreground truncate">{search.query}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Schedule: <code>{search.schedule}</code>
          {search.lastRunAt && (
            <> &nbsp;·&nbsp; Last run {formatDistanceToNow(new Date(search.lastRunAt))} ago
            — {search.lastRunNewLeads} new lead{search.lastRunNewLeads !== 1 ? 's' : ''}</>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          search.isEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {search.isEnabled ? 'Active' : 'Paused'}
        </span>
        <button
          onClick={onRunNow}
          title="Run now"
          className="p-1.5 rounded hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
```

---

## Notification Bell Component

```tsx
// frontend/src/components/notifications/NotificationBell.tsx
'use client';
import { useNotifications } from '@/hooks/useNotifications';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import NotificationDropdown from './NotificationDropdown';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { unreadCount } = useNotifications();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-md hover:bg-muted"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 text-[10px] font-bold bg-red-500 text-white rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && <NotificationDropdown onClose={() => setOpen(false)} />}
    </div>
  );
}
```

```tsx
// frontend/src/components/notifications/NotificationDropdown.tsx
'use client';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface Props { onClose: () => void; }

export default function NotificationDropdown({ onClose }: Props) {
  const { notifications, markAllRead, markRead } = useNotifications();

  return (
    <div className="absolute right-0 top-10 z-50 w-80 border rounded-lg bg-background shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <p className="text-sm font-medium">Notifications</p>
        <button onClick={markAllRead} className="text-xs text-blue-500 hover:underline">
          Mark all read
        </button>
      </div>
      <ul className="max-h-80 overflow-y-auto divide-y">
        {notifications.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications</li>
        )}
        {notifications.map(n => (
          <li
            key={n._id}
            className={`px-3 py-2.5 hover:bg-muted cursor-pointer ${!n.isRead ? 'bg-blue-50' : ''}`}
            onClick={() => markRead(n._id)}
          >
            {n.link ? (
              <Link href={n.link} onClick={onClose} className="block">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.body}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(n.createdAt))} ago
                </p>
              </Link>
            ) : (
              <>
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.body}</p>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## TanStack Query Hooks

```typescript
// frontend/src/hooks/useSavedSearches.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useSavedSearches() {
  const qc = useQueryClient();

  const searchesQ = useQuery({
    queryKey: ['saved-searches'],
    queryFn:  () => api.get('/saved-searches').then(r => r.data.data),
    staleTime: 30_000,
  });

  const runNowMut = useMutation({
    mutationFn: (id: string) => api.post(`/saved-searches/${id}/run`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });

  return {
    searches:  searchesQ.data ?? [],
    isLoading: searchesQ.isLoading,
    runNow:    (id: string) => runNowMut.mutate(id),
  };
}
```

```typescript
// frontend/src/hooks/useNotifications.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useNotifications() {
  const qc = useQueryClient();

  const notifQ = useQuery({
    queryKey: ['notifications'],
    queryFn:  () => api.get('/notifications').then(r => r.data.data),
    staleTime: 15_000,
    refetchInterval: 30_000, // poll every 30s
  });

  const markReadMut = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMut = useMutation({
    mutationFn: () => api.post('/notifications/mark-all-read'),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return {
    notifications: notifQ.data?.notifications ?? [],
    unreadCount:   notifQ.data?.unreadCount   ?? 0,
    markRead:      (id: string) => markReadMut.mutate(id),
    markAllRead:   () => markAllMut.mutate(),
  };
}
```

---

## Implementation Sequence

### Step 1 — Data models

- [ ] Create `backend/src/models/SavedSearch.ts`
- [ ] Create `backend/src/models/WorkspaceNotification.ts`
- [ ] Test: create SavedSearch, assert indexes; create WorkspaceNotification, assert compound index
- [ ] `git commit -m "feat(backend): SavedSearch + WorkspaceNotification models"`

### Step 2 — Notification service + Slack notifier

- [ ] Create `backend/src/services/notifications/notificationService.ts`
- [ ] Create `backend/src/services/notifications/slackNotifier.ts`
- [ ] Test: createNotification inserts doc; listNotifications returns unreadCount correctly; markAllRead sets isRead on all
- [ ] `git commit -m "feat(backend): notification service + Slack notifier"`

### Step 3 — Saved search runner + finalizer

- [ ] Create `backend/src/services/savedSearch/savedSearchRunner.ts` (runSavedSearch, finalizeSavedSearchRun)
- [ ] Call `finalizeSavedSearchRun` from the prospecting worker when `job.data.savedSearchId` is present
- [ ] Test: finalizeSavedSearchRun updates ss.lastRunStatus, totalRunCount, creates WorkspaceNotification
- [ ] `git commit -m "feat(backend): saved search runner + finalizer"`

### Step 4 — BullMQ scheduler

- [ ] Create `backend/src/jobs/savedSearchScheduler.ts` (syncSavedSearchJobs, startSavedSearchWorker)
- [ ] Call `startSavedSearchWorker()` and `syncSavedSearchJobs()` in `backend/src/server.ts`
- [ ] Test: syncSavedSearchJobs registers repeatable jobs matching DB records; second call re-syncs cleanly
- [ ] `git commit -m "feat(backend): saved search BullMQ scheduler"`

### Step 5 — Saved search controller + routes

- [ ] Create `backend/src/controllers/savedSearch.controller.ts` (5 handlers)
- [ ] Create `backend/src/routes/savedSearch.routes.ts`
- [ ] Mount at `/saved-searches` in `backend/src/app.ts`
- [ ] Test: invalid cron returns 400; create + delete sync scheduler
- [ ] `git commit -m "feat(backend): saved search CRUD + run-now"`

### Step 6 — Notifications controller + routes

- [ ] Create `backend/src/controllers/notifications.controller.ts` (3 handlers)
- [ ] Create `backend/src/routes/notifications.routes.ts`
- [ ] Mount at `/notifications` in `backend/src/app.ts`
- [ ] Workspace model: add `slackWebhookUrl` and `notificationEmail` fields
- [ ] `git commit -m "feat(backend): notifications routes + workspace Slack URL"`

### Step 7 — Frontend saved searches

- [ ] Create `frontend/src/hooks/useSavedSearches.ts`
- [ ] Create `frontend/src/components/savedSearch/SavedSearchCard.tsx`
- [ ] Create `frontend/src/components/savedSearch/SavedSearchForm.tsx` (name, query, schedule input with helper text, actions checkboxes)
- [ ] Create `frontend/src/app/(dashboard)/dashboard/saved-searches/page.tsx`
- [ ] Add "Saved Searches" to Sidebar nav
- [ ] `git commit -m "feat(frontend): saved searches page + cards"`

### Step 8 — Notification bell + dropdown

- [ ] Create `frontend/src/hooks/useNotifications.ts`
- [ ] Create `frontend/src/components/notifications/NotificationBell.tsx`
- [ ] Create `frontend/src/components/notifications/NotificationDropdown.tsx`
- [ ] Add NotificationBell to `frontend/src/components/layout/Topbar.tsx`
- [ ] Add Slack Webhook URL + Notification Email fields to `frontend/src/app/(dashboard)/dashboard/settings/page.tsx`
- [ ] `git commit -m "feat(frontend): notification bell + dropdown"`

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | /saved-searches | List workspace saved searches |
| POST | /saved-searches | Create saved search |
| PATCH | /saved-searches/:id | Update saved search |
| DELETE | /saved-searches/:id | Delete saved search |
| POST | /saved-searches/:id/run | Trigger manual run |
| GET | /notifications | List notifications + unread count |
| PATCH | /notifications/:id/read | Mark single notification read |
| POST | /notifications/mark-all-read | Mark all read |

---

## Verification Criteria

- Creating a saved search with an invalid cron expression returns 400
- After creating a saved search, a repeatable BullMQ job exists with the correct cron pattern
- runSavedSearch queues a prospecting job and sets lastRunStatus = 'running'
- finalizeSavedSearchRun sets lastRunStatus = 'success', increments totalRunCount, creates WorkspaceNotification
- postSlackMessage fires only when notifySlack = true and slackWebhookUrl is set
- listNotifications returns unreadCount matching actual unread records
- markAllRead sets isRead = true on all unread notifications for workspace
- syncSavedSearchJobs called twice does not double-register repeatable jobs
- Frontend saved searches page shows cards with last run time and new lead count
- Notification bell shows red badge with correct count; clicking shows dropdown
- Mark all read clears the badge
