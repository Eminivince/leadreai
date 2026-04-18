# Phase 8 — Collaborative Review & Approval Flows

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make LeadreAI usable by teams — add reviewer queues, lead ownership assignment, manager sign-off before send, threaded comments, and a workspace activity feed.

**Architecture:** A `WorkspaceMember` model links users to workspaces with role (owner, admin, reviewer, viewer). Lead and draft ownership is tracked via `assignedTo` fields. Review requests are stored as `ReviewRequest` documents with state machine (pending → approved/rejected). Comments live on a `Comment` polymorphic collection (target: lead or draft). An activity feed is a capped collection of audit events.

**Tech Stack:** Backend: Express, Mongoose, BullMQ. Frontend: Next.js 14, shadcn/ui, TanStack Query.

---

## Roadmap Modules Covered

- Module 19 — Collaborative Review and Approval Flows (approval queues, reviewer comments, lead assignment, escalation, manager sign-off, activity feed)
- Platform — Role-based access control (admin vs reviewer vs viewer)

---

## File Map

### New Backend Files

| File | Responsibility |
|---|---|
| `backend/src/models/WorkspaceMember.ts` | User-to-workspace membership with role |
| `backend/src/models/ReviewRequest.ts` | Review request: target (lead or draft), assignedReviewerId, status, due date |
| `backend/src/models/Comment.ts` | Polymorphic comment on lead or draft |
| `backend/src/models/ActivityEvent.ts` | Append-only activity log (capped collection) |
| `backend/src/services/review/reviewService.ts` | Create/approve/reject review requests, escalate |
| `backend/src/services/activity/activityLogger.ts` | Fire-and-forget activity event creation |
| `backend/src/controllers/members.controller.ts` | Invite, list, update role, remove member |
| `backend/src/controllers/review.controller.ts` | Review request CRUD + approve/reject |
| `backend/src/controllers/comments.controller.ts` | Comment CRUD on any target |
| `backend/src/controllers/activity.controller.ts` | Activity feed with cursor pagination |
| `backend/src/routes/members.routes.ts` | Mount under `/members` |
| `backend/src/routes/review.routes.ts` | Mount under `/reviews` |
| `backend/src/routes/comments.routes.ts` | Mount under `/comments` |
| `backend/src/routes/activity.routes.ts` | Mount under `/activity` |
| `backend/src/middleware/requireRole.ts` | Role guard middleware factory |

### Modified Backend Files

| File | Changes |
|---|---|
| `backend/src/models/Lead.ts` | Add `assignedToId?`, `assignedAt?`, `reviewStatus` |
| `backend/src/models/OutreachDraft.ts` | Add `assignedToId?`, `requiresApproval` (auto-set by workspace settings) |
| `backend/src/models/Workspace.ts` | Add `settings.requireApprovalBeforeSend`, `settings.defaultAssignee` |
| `backend/src/middleware/authenticate.ts` | Load WorkspaceMember role into req.user |

### New Frontend Files

| File | Responsibility |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/reviews/page.tsx` | Review queue: pending items, assigned to me |
| `frontend/src/app/(dashboard)/dashboard/activity/page.tsx` | Activity feed with infinite scroll |
| `frontend/src/app/(dashboard)/dashboard/settings/members/page.tsx` | Team members: list, invite, change role |
| `frontend/src/components/review/ReviewRequestCard.tsx` | Card: target summary, due date, approve/reject buttons |
| `frontend/src/components/review/AssignLeadDropdown.tsx` | Dropdown to assign lead to team member |
| `frontend/src/components/comments/CommentThread.tsx` | Threaded comments list |
| `frontend/src/components/comments/CommentInput.tsx` | Textarea + submit for new comment |
| `frontend/src/components/activity/ActivityFeed.tsx` | Chronological activity list with infinite scroll |
| `frontend/src/hooks/useReviews.ts` | TanStack Query hooks |
| `frontend/src/hooks/useComments.ts` | TanStack Query hooks |
| `frontend/src/hooks/useActivity.ts` | Infinite query hook |
| `frontend/src/hooks/useMembers.ts` | TanStack Query hooks |

---

## Data Models

### WorkspaceMember

```typescript
// backend/src/models/WorkspaceMember.ts
import { Schema, model, Document, Types } from 'mongoose';

export type WorkspaceRole = 'owner' | 'admin' | 'reviewer' | 'viewer';

export interface IWorkspaceMember extends Document {
  workspaceId: Types.ObjectId;
  userId:      Types.ObjectId;
  role:        WorkspaceRole;
  invitedBy:   Types.ObjectId;
  inviteEmail: string;       // email used at invite time (for pending invites)
  isPending:   boolean;      // true until invite accepted
  joinedAt?:   Date;
  createdAt:   Date;
  updatedAt:   Date;
}

const WorkspaceMemberSchema = new Schema<IWorkspaceMember>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  userId:      { type: Schema.Types.ObjectId, ref: 'User', index: true },
  role:        { type: String, enum: ['owner','admin','reviewer','viewer'], default: 'viewer' },
  invitedBy:   { type: Schema.Types.ObjectId, ref: 'User' },
  inviteEmail: { type: String, lowercase: true },
  isPending:   { type: Boolean, default: false },
  joinedAt:    { type: Date },
}, { timestamps: true });

WorkspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true, sparse: true });

export const WorkspaceMember = model<IWorkspaceMember>('WorkspaceMember', WorkspaceMemberSchema);
```

### ReviewRequest

```typescript
// backend/src/models/ReviewRequest.ts
import { Schema, model, Document, Types } from 'mongoose';

export type ReviewTargetType = 'lead' | 'draft';
export type ReviewStatus     = 'pending' | 'approved' | 'rejected' | 'escalated';

export interface IReviewRequest extends Document {
  workspaceId:        Types.ObjectId;
  targetType:         ReviewTargetType;
  targetId:           Types.ObjectId;       // Lead._id or OutreachDraft._id
  requestedBy:        Types.ObjectId;
  assignedReviewerId: Types.ObjectId;
  status:             ReviewStatus;
  dueAt?:             Date;
  resolvedAt?:        Date;
  reviewerNote?:      string;
  escalatedTo?:       Types.ObjectId;
  escalationReason?:  string;
  createdAt:          Date;
  updatedAt:          Date;
}

const ReviewRequestSchema = new Schema<IReviewRequest>({
  workspaceId:        { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  targetType:         { type: String, enum: ['lead','draft'], required: true },
  targetId:           { type: Schema.Types.ObjectId, required: true, index: true },
  requestedBy:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  assignedReviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status:             { type: String, enum: ['pending','approved','rejected','escalated'], default: 'pending' },
  dueAt:              { type: Date },
  resolvedAt:         { type: Date },
  reviewerNote:       { type: String },
  escalatedTo:        { type: Schema.Types.ObjectId, ref: 'User' },
  escalationReason:   { type: String },
}, { timestamps: true });

ReviewRequestSchema.index({ workspaceId: 1, status: 1, assignedReviewerId: 1 });

export const ReviewRequest = model<IReviewRequest>('ReviewRequest', ReviewRequestSchema);
```

### Comment

```typescript
// backend/src/models/Comment.ts
import { Schema, model, Document, Types } from 'mongoose';

export type CommentTargetType = 'lead' | 'draft' | 'review';

export interface IComment extends Document {
  workspaceId: Types.ObjectId;
  targetType:  CommentTargetType;
  targetId:    Types.ObjectId;
  authorId:    Types.ObjectId;
  body:        string;
  parentId?:   Types.ObjectId;    // for threaded replies
  isEdited:    boolean;
  createdAt:   Date;
  updatedAt:   Date;
}

const CommentSchema = new Schema<IComment>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  targetType:  { type: String, enum: ['lead','draft','review'], required: true },
  targetId:    { type: Schema.Types.ObjectId, required: true, index: true },
  authorId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  body:        { type: String, required: true, maxlength: 4000 },
  parentId:    { type: Schema.Types.ObjectId, ref: 'Comment' },
  isEdited:    { type: Boolean, default: false },
}, { timestamps: true });

CommentSchema.index({ targetId: 1, createdAt: 1 });

export const Comment = model<IComment>('Comment', CommentSchema);
```

### ActivityEvent

```typescript
// backend/src/models/ActivityEvent.ts
import { Schema, model, Document, Types } from 'mongoose';

export type ActivityType =
  | 'lead_assigned'
  | 'lead_qualified'
  | 'review_requested'
  | 'review_approved'
  | 'review_rejected'
  | 'draft_approved'
  | 'draft_sent'
  | 'comment_added'
  | 'member_invited'
  | 'member_role_changed'
  | 'campaign_created'
  | 'import_completed';

export interface IActivityEvent extends Document {
  workspaceId: Types.ObjectId;
  actorId:     Types.ObjectId;
  type:        ActivityType;
  targetType?: string;
  targetId?:   Types.ObjectId;
  summary:     string;           // human-readable one-liner
  metadata?:   Record<string, any>;
  createdAt:   Date;
}

const ActivityEventSchema = new Schema<IActivityEvent>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  actorId:     { type: Schema.Types.ObjectId, ref: 'User' },
  type:        { type: String, required: true },
  targetType:  { type: String },
  targetId:    { type: Schema.Types.ObjectId },
  summary:     { type: String, required: true },
  metadata:    { type: Schema.Types.Mixed },
}, {
  timestamps:  { createdAt: true, updatedAt: false },
  capped:      { size: 50 * 1024 * 1024, max: 10000 },  // 50 MB capped collection
});

ActivityEventSchema.index({ workspaceId: 1, createdAt: -1 });

export const ActivityEvent = model<IActivityEvent>('ActivityEvent', ActivityEventSchema);
```

---

## Role Guard Middleware

```typescript
// backend/src/middleware/requireRole.ts
import { Request, Response, NextFunction } from 'express';
import { WorkspaceMember, type WorkspaceRole } from '../models/WorkspaceMember.js';
import { ApiError } from '../utils/ApiError.js';

const ROLE_RANK: Record<WorkspaceRole, number> = { owner: 4, admin: 3, reviewer: 2, viewer: 1 };

export function requireRole(minRole: WorkspaceRole) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const member = await WorkspaceMember.findOne({
        workspaceId: req.user!.workspaceId,
        userId: req.user!._id,
        isPending: false,
      }).lean();

      if (!member) throw ApiError.forbidden('Not a workspace member');
      if (ROLE_RANK[member.role] < ROLE_RANK[minRole]) {
        throw ApiError.forbidden(`Requires ${minRole} role or higher`);
      }
      (req as any).memberRole = member.role;
      next();
    } catch (err) { next(err); }
  };
}
```

---

## Review Service

```typescript
// backend/src/services/review/reviewService.ts
import { ReviewRequest } from '../../models/ReviewRequest.js';
import { logActivity } from '../activity/activityLogger.js';
import { createNotification } from '../notifications/notificationService.js';
import type { Types } from 'mongoose';

export async function createReviewRequest(
  workspaceId: Types.ObjectId,
  requestedBy: Types.ObjectId,
  targetType: 'lead' | 'draft',
  targetId: Types.ObjectId,
  assignedReviewerId: Types.ObjectId,
  dueAt?: Date,
) {
  const existing = await ReviewRequest.findOne({ workspaceId, targetId, status: 'pending' });
  if (existing) return existing; // idempotent

  const rr = await ReviewRequest.create({
    workspaceId, targetType, targetId, requestedBy, assignedReviewerId, dueAt,
  });

  await createNotification(workspaceId, {
    type: 'review_requested' as any,
    title: 'Review requested',
    body: `You have a new ${targetType} to review.`,
    link: `/dashboard/reviews`,
    metadata: { reviewRequestId: rr._id },
  });

  logActivity(workspaceId, requestedBy, 'review_requested', {
    summary: `Review requested for ${targetType}`,
    targetType, targetId,
  });

  return rr;
}

export async function resolveReview(
  workspaceId: Types.ObjectId,
  reviewId: string,
  reviewerId: Types.ObjectId,
  decision: 'approved' | 'rejected',
  note?: string,
) {
  const rr = await ReviewRequest.findOne({ _id: reviewId, workspaceId, assignedReviewerId: reviewerId });
  if (!rr) throw new Error('Review not found or not assigned to you');
  if (rr.status !== 'pending') throw new Error('Review already resolved');

  rr.status       = decision;
  rr.resolvedAt   = new Date();
  rr.reviewerNote = note;
  await rr.save();

  logActivity(workspaceId, reviewerId, decision === 'approved' ? 'review_approved' : 'review_rejected', {
    summary: `Review ${decision} for ${rr.targetType}`,
    targetType: rr.targetType,
    targetId: rr.targetId,
  });

  return rr;
}

export async function getReviewQueue(
  workspaceId: Types.ObjectId,
  reviewerId: Types.ObjectId,
) {
  return ReviewRequest.find({
    workspaceId,
    assignedReviewerId: reviewerId,
    status: 'pending',
  }).sort({ dueAt: 1, createdAt: 1 }).lean();
}
```

---

## Activity Logger

```typescript
// backend/src/services/activity/activityLogger.ts
import { ActivityEvent, type ActivityType } from '../../models/ActivityEvent.js';
import type { Types } from 'mongoose';

interface LogOpts {
  summary:     string;
  targetType?: string;
  targetId?:   Types.ObjectId;
  metadata?:   Record<string, any>;
}

export function logActivity(
  workspaceId: Types.ObjectId,
  actorId: Types.ObjectId,
  type: ActivityType,
  opts: LogOpts,
): void {
  ActivityEvent.create({
    workspaceId,
    actorId,
    type,
    ...opts,
  }).catch(err => {
    console.error('[activityLogger] Failed to log activity', err);
  });
}
```

---

## Review Controller

```typescript
// backend/src/controllers/review.controller.ts
import { Request, Response, NextFunction } from 'express';
import { createReviewRequest, resolveReview, getReviewQueue } from '../services/review/reviewService.js';
import { ReviewRequest } from '../models/ReviewRequest.js';
import { ApiError } from '../utils/ApiError.js';

// GET /reviews/queue  — reviews assigned to current user
export async function getQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const queue = await getReviewQueue(req.user!.workspaceId, req.user!._id);
    res.json({ data: queue });
  } catch (err) { next(err); }
}

// GET /reviews  — all reviews in workspace (admin/owner)
export async function listReviews(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.query as { status?: string };
    const query: any = { workspaceId: req.user!.workspaceId };
    if (status) query.status = status;
    const reviews = await ReviewRequest.find(query)
      .sort({ createdAt: -1 }).limit(50)
      .populate('requestedBy', 'name email')
      .populate('assignedReviewerId', 'name email')
      .lean();
    res.json({ data: reviews });
  } catch (err) { next(err); }
}

// POST /reviews
export async function createReview(req: Request, res: Response, next: NextFunction) {
  try {
    const { targetType, targetId, assignedReviewerId, dueAt } = req.body;
    const rr = await createReviewRequest(
      req.user!.workspaceId,
      req.user!._id,
      targetType,
      targetId,
      assignedReviewerId,
      dueAt ? new Date(dueAt) : undefined,
    );
    res.status(201).json({ data: rr });
  } catch (err) { next(err); }
}

// POST /reviews/:id/approve
export async function approveReview(req: Request, res: Response, next: NextFunction) {
  try {
    const rr = await resolveReview(req.user!.workspaceId, req.params.id, req.user!._id, 'approved', req.body.note);
    res.json({ data: rr });
  } catch (err) { next(err); }
}

// POST /reviews/:id/reject
export async function rejectReview(req: Request, res: Response, next: NextFunction) {
  try {
    const rr = await resolveReview(req.user!.workspaceId, req.params.id, req.user!._id, 'rejected', req.body.note);
    res.json({ data: rr });
  } catch (err) { next(err); }
}
```

---

## Comments Controller

```typescript
// backend/src/controllers/comments.controller.ts
import { Request, Response, NextFunction } from 'express';
import { Comment } from '../models/Comment.js';
import { logActivity } from '../services/activity/activityLogger.js';
import { ApiError } from '../utils/ApiError.js';

// GET /comments?targetType=lead&targetId=xxx
export async function listComments(req: Request, res: Response, next: NextFunction) {
  try {
    const { targetType, targetId } = req.query as { targetType: string; targetId: string };
    if (!targetType || !targetId) throw ApiError.badRequest('targetType and targetId required');
    const comments = await Comment.find({ targetType, targetId })
      .sort({ createdAt: 1 })
      .populate('authorId', 'name email')
      .lean();
    res.json({ data: comments });
  } catch (err) { next(err); }
}

// POST /comments
export async function addComment(req: Request, res: Response, next: NextFunction) {
  try {
    const { targetType, targetId, body, parentId } = req.body;
    if (!body?.trim()) throw ApiError.badRequest('body required');
    const comment = await Comment.create({
      workspaceId: req.user!.workspaceId,
      targetType,
      targetId,
      authorId: req.user!._id,
      body: body.trim(),
      parentId,
    });

    logActivity(req.user!.workspaceId, req.user!._id, 'comment_added', {
      summary: `Comment added on ${targetType}`,
      targetType, targetId,
    });

    res.status(201).json({ data: comment });
  } catch (err) { next(err); }
}

// PATCH /comments/:id
export async function editComment(req: Request, res: Response, next: NextFunction) {
  try {
    const comment = await Comment.findOne({ _id: req.params.id, authorId: req.user!._id });
    if (!comment) throw ApiError.notFound('Comment not found');
    comment.body     = req.body.body.trim();
    comment.isEdited = true;
    await comment.save();
    res.json({ data: comment });
  } catch (err) { next(err); }
}

// DELETE /comments/:id
export async function deleteComment(req: Request, res: Response, next: NextFunction) {
  try {
    await Comment.findOneAndDelete({ _id: req.params.id, authorId: req.user!._id, workspaceId: req.user!.workspaceId });
    res.status(204).end();
  } catch (err) { next(err); }
}
```

---

## Members Controller

```typescript
// backend/src/controllers/members.controller.ts
import { Request, Response, NextFunction } from 'express';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { User } from '../models/User.js';
import { logActivity } from '../services/activity/activityLogger.js';
import { ApiError } from '../utils/ApiError.js';

// GET /members
export async function listMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const members = await WorkspaceMember.find({ workspaceId: req.user!.workspaceId })
      .populate('userId', 'name email')
      .lean();
    res.json({ data: members });
  } catch (err) { next(err); }
}

// POST /members/invite
export async function inviteMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, role } = req.body;
    if (!email || !role) throw ApiError.badRequest('email and role required');

    const existingUser = await User.findOne({ email: email.toLowerCase() }).lean();
    const member = await WorkspaceMember.create({
      workspaceId:  req.user!.workspaceId,
      userId:       existingUser?._id,
      role,
      invitedBy:    req.user!._id,
      inviteEmail:  email.toLowerCase(),
      isPending:    !existingUser,
      joinedAt:     existingUser ? new Date() : undefined,
    });

    logActivity(req.user!.workspaceId, req.user!._id, 'member_invited', {
      summary: `Invited ${email} as ${role}`,
    });

    res.status(201).json({ data: member });
  } catch (err) { next(err); }
}

// PATCH /members/:id/role
export async function updateRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { role } = req.body;
    const member = await WorkspaceMember.findOneAndUpdate(
      { _id: req.params.id, workspaceId: req.user!.workspaceId },
      { $set: { role } },
      { new: true },
    );
    if (!member) throw ApiError.notFound('Member not found');

    logActivity(req.user!.workspaceId, req.user!._id, 'member_role_changed', {
      summary: `Role changed to ${role}`,
      targetId: member.userId,
    });

    res.json({ data: member });
  } catch (err) { next(err); }
}

// DELETE /members/:id
export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const member = await WorkspaceMember.findOne({ _id: req.params.id, workspaceId: req.user!.workspaceId });
    if (!member) throw ApiError.notFound('Member not found');

    // Cannot remove the owner
    if (member.role === 'owner') throw ApiError.badRequest('Cannot remove workspace owner');
    await member.deleteOne();
    res.status(204).end();
  } catch (err) { next(err); }
}
```

---

## Activity Controller

```typescript
// backend/src/controllers/activity.controller.ts
import { Request, Response, NextFunction } from 'express';
import { ActivityEvent } from '../models/ActivityEvent.js';

// GET /activity?before=<timestamp>&limit=25
export async function getActivityFeed(req: Request, res: Response, next: NextFunction) {
  try {
    const limit  = Math.min(parseInt((req.query.limit as string) ?? '25', 10), 100);
    const before = req.query.before ? new Date(req.query.before as string) : new Date();

    const events = await ActivityEvent.find({
      workspaceId: req.user!.workspaceId,
      createdAt: { $lt: before },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actorId', 'name email')
      .lean();

    const nextCursor = events.length === limit
      ? events[events.length - 1]?.createdAt?.toISOString()
      : null;

    res.json({ data: events, nextCursor });
  } catch (err) { next(err); }
}
```

---

## Routes

```typescript
// backend/src/routes/review.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { getQueue, listReviews, createReview, approveReview, rejectReview } from '../controllers/review.controller.js';

const router = Router();
router.use(authenticate);

router.get('/queue',       getQueue);
router.get('/',            listReviews);
router.post('/',           createReview);
router.post('/:id/approve',approveReview);
router.post('/:id/reject', rejectReview);

export default router;
```

```typescript
// backend/src/routes/comments.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { listComments, addComment, editComment, deleteComment } from '../controllers/comments.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',      listComments);
router.post('/',     addComment);
router.patch('/:id', editComment);
router.delete('/:id',deleteComment);

export default router;
```

```typescript
// backend/src/routes/members.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { listMembers, inviteMember, updateRole, removeMember } from '../controllers/members.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',           listMembers);
router.post('/invite',    requireRole('admin'), inviteMember);
router.patch('/:id/role', requireRole('admin'), updateRole);
router.delete('/:id',     requireRole('admin'), removeMember);

export default router;
```

```typescript
// backend/src/routes/activity.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { getActivityFeed } from '../controllers/activity.controller.js';

const router = Router();
router.use(authenticate);
router.get('/', getActivityFeed);

export default router;
```

---

## Frontend: Review Queue

```tsx
// frontend/src/app/(dashboard)/dashboard/reviews/page.tsx
'use client';
import { useReviews } from '@/hooks/useReviews';
import ReviewRequestCard from '@/components/review/ReviewRequestCard';

export default function ReviewsPage() {
  const { queue, isLoading, approve, reject } = useReviews();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Review Queue</h1>
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-28 border rounded-lg animate-pulse bg-muted" />)}
        </div>
      ) : queue.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>No pending reviews. You're all caught up.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {queue.map(rr => (
            <ReviewRequestCard
              key={rr._id}
              reviewRequest={rr}
              onApprove={(note) => approve(rr._id, note)}
              onReject={(note) => reject(rr._id, note)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

```tsx
// frontend/src/components/review/ReviewRequestCard.tsx
'use client';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, XCircle } from 'lucide-react';

interface ReviewRequest {
  _id: string;
  targetType: string;
  targetId: string;
  dueAt?: string;
  createdAt: string;
  requestedBy?: { name: string; email: string };
}

interface Props {
  reviewRequest: ReviewRequest;
  onApprove: (note: string) => void;
  onReject: (note: string) => void;
}

export default function ReviewRequestCard({ reviewRequest: rr, onApprove, onReject }: Props) {
  const [note, setNote] = useState('');

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {rr.targetType}
          </span>
          <p className="text-sm text-muted-foreground mt-1">
            Requested by {rr.requestedBy?.name ?? 'Unknown'} · {formatDistanceToNow(new Date(rr.createdAt))} ago
            {rr.dueAt && <> · Due {formatDistanceToNow(new Date(rr.dueAt))}</>}
          </p>
        </div>
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Optional review note…"
        className="w-full border rounded p-2 text-sm resize-none h-16"
      />
      <div className="flex gap-2">
        <button
          onClick={() => onApprove(note)}
          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
        >
          <CheckCircle2 className="h-4 w-4" /> Approve
        </button>
        <button
          onClick={() => onReject(note)}
          className="flex items-center gap-1 px-3 py-1.5 border border-red-300 text-red-600 text-sm rounded hover:bg-red-50"
        >
          <XCircle className="h-4 w-4" /> Reject
        </button>
      </div>
    </div>
  );
}
```

---

## Comment Thread Component

```tsx
// frontend/src/components/comments/CommentThread.tsx
'use client';
import { useComments } from '@/hooks/useComments';
import CommentInput from './CommentInput';
import { formatDistanceToNow } from 'date-fns';

interface Props { targetType: string; targetId: string; }

export default function CommentThread({ targetType, targetId }: Props) {
  const { comments, addComment, isLoading } = useComments(targetType, targetId);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Comments</h3>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {comments.map(c => (
            <li key={c._id} className="flex gap-3">
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                {(c.authorId?.name ?? 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{c.authorId?.name ?? 'Unknown'}</span>
                  <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(c.createdAt))} ago</span>
                  {c.isEdited && <span className="text-xs text-muted-foreground">(edited)</span>}
                </div>
                <p className="text-sm mt-0.5 whitespace-pre-wrap">{c.body}</p>
              </div>
            </li>
          ))}
          {comments.length === 0 && (
            <li className="text-sm text-muted-foreground">No comments yet.</li>
          )}
        </ul>
      )}
      <CommentInput onSubmit={(body) => addComment(body)} />
    </div>
  );
}
```

```tsx
// frontend/src/components/comments/CommentInput.tsx
'use client';
import { useState } from 'react';

interface Props { onSubmit: (body: string) => void; }

export default function CommentInput({ onSubmit }: Props) {
  const [body, setBody] = useState('');
  return (
    <div className="flex gap-2">
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Add a comment…"
        className="flex-1 border rounded p-2 text-sm resize-none h-16"
      />
      <button
        onClick={() => { if (body.trim()) { onSubmit(body.trim()); setBody(''); } }}
        disabled={!body.trim()}
        className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 self-end"
      >
        Post
      </button>
    </div>
  );
}
```

---

## TanStack Query Hooks

```typescript
// frontend/src/hooks/useReviews.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useReviews() {
  const qc = useQueryClient();

  const queueQ = useQuery({
    queryKey: ['reviews', 'queue'],
    queryFn:  () => api.get('/reviews/queue').then(r => r.data.data),
    staleTime: 30_000,
  });

  const approveMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => api.post(`/reviews/${id}/approve`, { note }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['reviews'] }),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => api.post(`/reviews/${id}/reject`, { note }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['reviews'] }),
  });

  return {
    queue:     queueQ.data ?? [],
    isLoading: queueQ.isLoading,
    approve:   (id: string, note: string) => approveMut.mutate({ id, note }),
    reject:    (id: string, note: string) => rejectMut.mutate({ id, note }),
  };
}
```

```typescript
// frontend/src/hooks/useComments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useComments(targetType: string, targetId: string) {
  const qc = useQueryClient();
  const key = ['comments', targetType, targetId];

  const commentsQ = useQuery({
    queryKey: key,
    queryFn:  () => api.get(`/comments?targetType=${targetType}&targetId=${targetId}`).then(r => r.data.data),
    enabled:  !!targetId,
    staleTime: 15_000,
  });

  const addMut = useMutation({
    mutationFn: (body: string) => api.post('/comments', { targetType, targetId, body }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    comments:   commentsQ.data ?? [],
    isLoading:  commentsQ.isLoading,
    addComment: (body: string) => addMut.mutate(body),
  };
}
```

```typescript
// frontend/src/hooks/useMembers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useMembers() {
  const qc = useQueryClient();

  const membersQ = useQuery({
    queryKey: ['members'],
    queryFn:  () => api.get('/members').then(r => r.data.data),
    staleTime: 60_000,
  });

  const inviteMut = useMutation({
    mutationFn: (data: { email: string; role: string }) => api.post('/members/invite', data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['members'] }),
  });

  const updateRoleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => api.patch(`/members/${id}/role`, { role }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['members'] }),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => api.delete(`/members/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['members'] }),
  });

  return {
    members:    membersQ.data ?? [],
    isLoading:  membersQ.isLoading,
    invite:     (data: { email: string; role: string }) => inviteMut.mutate(data),
    updateRole: (id: string, role: string) => updateRoleMut.mutate({ id, role }),
    remove:     (id: string) => removeMut.mutate(id),
  };
}
```

---

## Implementation Sequence

### Step 1 — WorkspaceMember model + role guard

- [ ] Create `backend/src/models/WorkspaceMember.ts`
- [ ] Create `backend/src/middleware/requireRole.ts`
- [ ] Test: requireRole('admin') allows admin, blocks viewer with 403
- [ ] `git commit -m "feat(backend): WorkspaceMember model + role guard middleware"`

### Step 2 — ReviewRequest + Comment + ActivityEvent models

- [ ] Create `backend/src/models/ReviewRequest.ts`
- [ ] Create `backend/src/models/Comment.ts`
- [ ] Create `backend/src/models/ActivityEvent.ts` (capped collection — verify `capped` option on model)
- [ ] Test: create each, assert indexes
- [ ] `git commit -m "feat(backend): ReviewRequest + Comment + ActivityEvent models"`

### Step 3 — Activity logger + review service

- [ ] Create `backend/src/services/activity/activityLogger.ts`
- [ ] Create `backend/src/services/review/reviewService.ts` (createReviewRequest, resolveReview, getReviewQueue)
- [ ] Test: createReviewRequest is idempotent (second call with same targetId returns existing); resolveReview sets status and resolvedAt
- [ ] `git commit -m "feat(backend): activity logger + review service"`

### Step 4 — Controllers + routes

- [ ] Create `backend/src/controllers/review.controller.ts` (5 handlers)
- [ ] Create `backend/src/controllers/comments.controller.ts` (4 handlers)
- [ ] Create `backend/src/controllers/members.controller.ts` (4 handlers)
- [ ] Create `backend/src/controllers/activity.controller.ts` (1 handler)
- [ ] Create all 4 route files
- [ ] Mount all in `backend/src/app.ts`
- [ ] `git commit -m "feat(backend): review + comments + members + activity routes"`

### Step 5 — Lead + Draft assignment fields

- [ ] Modify `backend/src/models/Lead.ts`: add `assignedToId`, `assignedAt`, `reviewStatus`
- [ ] Modify `backend/src/models/OutreachDraft.ts`: add `assignedToId`, `requiresApproval`
- [ ] Modify `backend/src/models/Workspace.ts`: add `settings.requireApprovalBeforeSend`, `settings.defaultAssignee`
- [ ] `git commit -m "feat(backend): lead + draft assignment + approval settings"`

### Step 6 — Frontend review queue + members page

- [ ] Create `frontend/src/hooks/useReviews.ts`
- [ ] Create `frontend/src/hooks/useMembers.ts`
- [ ] Create `frontend/src/components/review/ReviewRequestCard.tsx`
- [ ] Create `frontend/src/app/(dashboard)/dashboard/reviews/page.tsx`
- [ ] Create `frontend/src/app/(dashboard)/dashboard/settings/members/page.tsx`
- [ ] Add Reviews + Members links to Sidebar/Settings
- [ ] `git commit -m "feat(frontend): review queue + team members page"`

### Step 7 — Comment thread + activity feed

- [ ] Create `frontend/src/hooks/useComments.ts`
- [ ] Create `frontend/src/components/comments/CommentInput.tsx`
- [ ] Create `frontend/src/components/comments/CommentThread.tsx`
- [ ] Add CommentThread to lead detail drawer and outreach draft editor
- [ ] Create `frontend/src/app/(dashboard)/dashboard/activity/page.tsx` (cursor-paginated activity feed)
- [ ] Create `frontend/src/components/activity/ActivityFeed.tsx`
- [ ] `git commit -m "feat(frontend): comments + activity feed"`

---

## API Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /reviews/queue | JWT | Reviews assigned to current user |
| GET | /reviews | JWT | All reviews (admin) |
| POST | /reviews | JWT | Create review request |
| POST | /reviews/:id/approve | JWT | Approve review |
| POST | /reviews/:id/reject | JWT | Reject review |
| GET | /comments | JWT | Comments for target |
| POST | /comments | JWT | Add comment |
| PATCH | /comments/:id | JWT | Edit own comment |
| DELETE | /comments/:id | JWT | Delete own comment |
| GET | /members | JWT | List workspace members |
| POST | /members/invite | JWT admin | Invite member |
| PATCH | /members/:id/role | JWT admin | Update member role |
| DELETE | /members/:id | JWT admin | Remove member |
| GET | /activity | JWT | Workspace activity feed |

---

## Verification Criteria

- requireRole('admin') blocks viewer-role request with 403
- createReviewRequest called twice with same targetId returns existing request (idempotent)
- resolveReview sets status + resolvedAt; calling again returns 'Review already resolved' error
- logActivity is fire-and-forget — does not throw on failure
- ActivityEvent capped collection does not grow unbounded (verify capped option applied)
- Removing workspace owner returns 400
- Comment edit only allowed by comment's own author (403 otherwise)
- Review queue only shows reviews where assignedReviewerId matches current user
- Frontend review queue shows approve/reject with note textarea
- Activity feed paginates with cursor (nextCursor returned when page full, null when at end)
- CommentThread renders comments in chronological order with author name
