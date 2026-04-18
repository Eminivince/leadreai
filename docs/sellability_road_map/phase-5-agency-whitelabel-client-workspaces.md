# Phase 5 — Agency Mode, White-Label & Client Workspaces

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let agencies run LeadreAI on behalf of multiple clients with isolated workspaces, branded exports, per-client billing, and a client-facing approval portal.

**Architecture:** A new `AgencyProfile` document hangs off a workspace and marks it as an agency hub. Client workspaces are child workspaces with `parentAgencyWorkspaceId` set. Access control is enforced at the middleware level: agency members can impersonate any child workspace. White-label configuration (logo, brand color, domain) is stored per agency and injected into PDF/CSV exports via a report renderer service.

**Tech Stack:** Backend: Express, Mongoose, BullMQ, pdf-lib (PDF generation), json2csv. Frontend: Next.js 14, shadcn/ui, TanStack Query, Zustand. White-label exports: pdf-lib (Node), branded CSV headers.

---

## Roadmap Modules Covered

- Module 23 — Agency and White-Label Mode (client workspaces, white-label portal, branded exports, client approval flows, per-client billing)
- Module 19 partial — Collaborative Review and Approval Flows (client sign-off before send)
- Platform — Per-client billing and usage metering

---

## File Map

### New Backend Files

| File | Responsibility |
|---|---|
| `backend/src/models/AgencyProfile.ts` | Agency branding config: logo, primary color, domain, tagline, plan limits |
| `backend/src/models/ClientWorkspace.ts` | Thin join model: agencyWorkspaceId ↔ clientWorkspaceId + client contact info |
| `backend/src/services/agency/agencyAccess.ts` | isAgencyHub(), canImpersonate(), listClientWorkspaces() |
| `backend/src/services/reports/pdfReportBuilder.ts` | Build branded PDF using pdf-lib: logo, colors, lead table, campaign summary |
| `backend/src/services/reports/csvExportBuilder.ts` | Branded CSV: custom column headers per agency template |
| `backend/src/controllers/agency.controller.ts` | CRUD for agency profile, client workspaces, impersonation token, usage summary |
| `backend/src/controllers/clientApproval.controller.ts` | Client-facing: view drafts awaiting approval, approve/reject with token |
| `backend/src/routes/agency.routes.ts` | Mount agency routes under `/agency` |
| `backend/src/routes/clientApproval.routes.ts` | Mount client approval routes (public with signed token) |
| `backend/src/middleware/agencyImpersonate.ts` | Reads X-Impersonate-Workspace header, validates agency membership, sets req.workspaceId |

### Modified Backend Files

| File | Changes |
|---|---|
| `backend/src/models/Workspace.ts` | Add `parentAgencyWorkspaceId?`, `isClientWorkspace`, `clientLabel`, `agencyProfileId?` |
| `backend/src/models/OutreachDraft.ts` | Add `clientApprovalStatus: 'pending' \| 'approved' \| 'rejected'`, `clientApprovalToken`, `clientApprovedAt`, `clientNote` |
| `backend/src/controllers/exports.controller.ts` | Detect agency context, inject white-label config into PDF/CSV |
| `backend/src/middleware/authenticate.ts` | After auth, call agencyImpersonate middleware if header present |

### New Frontend Files

| File | Responsibility |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/agency/page.tsx` | Agency hub: client workspace list, usage bars, invite button |
| `frontend/src/app/(dashboard)/dashboard/agency/clients/[clientId]/page.tsx` | Per-client view: campaigns, leads, usage, open drafts |
| `frontend/src/app/(dashboard)/dashboard/agency/settings/page.tsx` | Branding: upload logo, set primary color, set domain |
| `frontend/src/app/client-approval/[token]/page.tsx` | Public page: client reviews and approves/rejects draft (no login required) |
| `frontend/src/components/agency/ClientWorkspaceCard.tsx` | Card: client name, usage bar, open draft count, impersonate button |
| `frontend/src/components/agency/BrandingForm.tsx` | Logo upload, color picker, domain field |
| `frontend/src/components/agency/UsageSummaryBar.tsx` | Stacked bar: credits used by client |
| `frontend/src/components/clientApproval/DraftReviewCard.tsx` | Shows email subject + body, approve/reject buttons, optional note |
| `frontend/src/hooks/useAgency.ts` | TanStack Query hooks for all agency endpoints |

### Modified Frontend Files

| File | Changes |
|---|---|
| `frontend/src/components/layout/Sidebar.tsx` | Show Agency nav section if workspace is agency hub |
| `frontend/src/components/layout/Topbar.tsx` | Show "Viewing: [ClientName]" banner when impersonating |

---

## Data Models

### AgencyProfile

```typescript
// backend/src/models/AgencyProfile.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IAgencyProfile extends Document {
  workspaceId:    Types.ObjectId;  // the agency's own workspace
  agencyName:     string;
  logoUrl?:       string;
  primaryColor:   string;          // hex, e.g. '#2563eb'
  accentColor:    string;
  brandDomain?:   string;          // custom domain for client portal
  tagline?:       string;
  footerText?:    string;
  supportEmail?:  string;
  planLimits: {
    maxClientWorkspaces: number;
    pooledCredits:       number;   // credits shared across all clients
    usedCredits:         number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AgencyProfileSchema = new Schema<IAgencyProfile>({
  workspaceId:  { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true, index: true },
  agencyName:   { type: String, required: true },
  logoUrl:      { type: String },
  primaryColor: { type: String, default: '#2563eb' },
  accentColor:  { type: String, default: '#1e40af' },
  brandDomain:  { type: String },
  tagline:      { type: String },
  footerText:   { type: String },
  supportEmail: { type: String },
  planLimits: {
    maxClientWorkspaces: { type: Number, default: 10 },
    pooledCredits:       { type: Number, default: 25000 },
    usedCredits:         { type: Number, default: 0 },
  },
}, { timestamps: true });

export const AgencyProfile = model<IAgencyProfile>('AgencyProfile', AgencyProfileSchema);
```

### ClientWorkspace

```typescript
// backend/src/models/ClientWorkspace.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IClientWorkspace extends Document {
  agencyWorkspaceId:   Types.ObjectId;
  clientWorkspaceId:   Types.ObjectId;
  clientLabel:         string;       // display name for this client
  clientContactName?:  string;
  clientContactEmail?: string;       // used for sending approval request emails
  creditsAllocated:    number;       // credits allocated to this client from pool
  creditsUsed:         number;
  isActive:            boolean;
  notes?:              string;
  createdAt:           Date;
  updatedAt:           Date;
}

const ClientWorkspaceSchema = new Schema<IClientWorkspace>({
  agencyWorkspaceId:   { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  clientWorkspaceId:   { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
  clientLabel:         { type: String, required: true },
  clientContactName:   { type: String },
  clientContactEmail:  { type: String },
  creditsAllocated:    { type: Number, default: 0 },
  creditsUsed:         { type: Number, default: 0 },
  isActive:            { type: Boolean, default: true },
  notes:               { type: String },
}, { timestamps: true });

ClientWorkspaceSchema.index({ agencyWorkspaceId: 1, isActive: 1 });

export const ClientWorkspace = model<IClientWorkspace>('ClientWorkspace', ClientWorkspaceSchema);
```

### OutreachDraft — Client Approval Fields

```typescript
// Additions to the existing IOutreachDraft interface:
clientApprovalStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
clientApprovalToken:  string;   // signed JWT, 7-day expiry, select: false in schema
clientApprovalSentAt: Date;
clientApprovedAt:     Date;
clientNote:           string;   // client's rejection/approval note

// Add to OutreachDraftSchema:
clientApprovalStatus: { type: String, enum: ['not_required','pending','approved','rejected'], default: 'not_required' },
clientApprovalToken:  { type: String, select: false },
clientApprovalSentAt: { type: Date },
clientApprovedAt:     { type: Date },
clientNote:           { type: String },
```

---

## Agency Access Service

```typescript
// backend/src/services/agency/agencyAccess.ts
import { Workspace } from '../../models/Workspace.js';
import { ClientWorkspace } from '../../models/ClientWorkspace.js';
import type { Types } from 'mongoose';

export async function isAgencyHub(workspaceId: Types.ObjectId): Promise<boolean> {
  const ws = await Workspace.findById(workspaceId).select('agencyProfileId').lean();
  return !!(ws as any)?.agencyProfileId;
}

export async function canImpersonate(
  agencyWorkspaceId: Types.ObjectId,
  targetWorkspaceId: string,
): Promise<boolean> {
  const link = await ClientWorkspace.findOne({
    agencyWorkspaceId,
    clientWorkspaceId: targetWorkspaceId,
    isActive: true,
  }).lean();
  return !!link;
}

export async function listClientWorkspaces(agencyWorkspaceId: Types.ObjectId) {
  return ClientWorkspace.find({ agencyWorkspaceId, isActive: true })
    .populate('clientWorkspaceId', 'name')
    .lean();
}
```

---

## Impersonation Middleware

```typescript
// backend/src/middleware/agencyImpersonate.ts
import { Request, Response, NextFunction } from 'express';
import { canImpersonate } from '../services/agency/agencyAccess.js';

export async function agencyImpersonate(req: Request, _res: Response, next: NextFunction) {
  const targetId = req.headers['x-impersonate-workspace'] as string | undefined;
  if (!targetId || !req.user) return next();

  const allowed = await canImpersonate(req.user.workspaceId, targetId);
  if (!allowed) return next(); // silently ignore unauthorized impersonation attempts

  // Override workspaceId for this request only
  req.user = { ...req.user, workspaceId: targetId as any };
  (req as any).isImpersonating = true;
  next();
}
```

---

## PDF Report Builder

```typescript
// backend/src/services/reports/pdfReportBuilder.ts
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { IAgencyProfile } from '../../models/AgencyProfile.js';

function parseHexColor(hex: string): [number, number, number] {
  // Use string slicing to avoid any shell-adjacent patterns
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [0.145, 0.388, 0.922];
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export interface ReportLead {
  company: string;
  domain:  string;
  score:   number;
  status:  string;
}

export async function buildLeadReportPdf(
  agency: IAgencyProfile,
  clientLabel: string,
  campaignName: string,
  leads: ReportLead[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font     = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const [r, g, b] = parseHexColor(agency.primaryColor);
  const brandColor = rgb(r, g, b);
  const { width, height } = page.getSize();

  // Header bar
  page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: brandColor });
  page.drawText(agency.agencyName,           { x: 20, y: height - 38, size: 18, font: boldFont, color: rgb(1,1,1) });
  page.drawText(`Campaign: ${campaignName}`, { x: 20, y: height - 55, size: 9,  font,           color: rgb(0.9,0.9,0.9) });

  // Subheader
  page.drawText(`Client: ${clientLabel}`,                      { x: 20,           y: height - 80, size: 10, font, color: rgb(0.3,0.3,0.3) });
  page.drawText(`Generated: ${new Date().toLocaleDateString()}`, { x: width - 150, y: height - 80, size: 10, font, color: rgb(0.5,0.5,0.5) });
  page.drawLine({ start: { x: 20, y: height - 90 }, end: { x: width - 20, y: height - 90 }, thickness: 0.5, color: rgb(0.8,0.8,0.8) });

  // Table header row
  let y = height - 115;
  const colX = [20, 200, 350, 430];
  const headers = ['Company', 'Domain', 'Score', 'Status'];
  headers.forEach((h, i) => page.drawText(h, { x: colX[i]!, y, size: 9, font: boldFont, color: rgb(0.2,0.2,0.2) }));
  y -= 15;
  page.drawLine({ start: { x: 20, y }, end: { x: width - 20, y }, thickness: 0.5, color: rgb(0.85,0.85,0.85) });
  y -= 12;

  // Rows (max 40 per page)
  for (const lead of leads.slice(0, 40)) {
    if (y < 60) break;
    const row = [lead.company, lead.domain, String(lead.score), lead.status];
    row.forEach((val, i) => {
      const truncated = val.length > 28 ? val.slice(0, 25) + '…' : val;
      page.drawText(truncated, { x: colX[i]!, y, size: 8, font, color: rgb(0.15,0.15,0.15) });
    });
    y -= 14;
  }

  if (agency.footerText) {
    page.drawText(agency.footerText, { x: 20, y: 20, size: 7, font, color: rgb(0.6,0.6,0.6) });
  }

  return doc.save();
}
```

---

## Branded CSV Export

```typescript
// backend/src/services/reports/csvExportBuilder.ts
import { parse } from 'json2csv';
import type { IAgencyProfile } from '../../models/AgencyProfile.js';
import type { ReportLead } from './pdfReportBuilder.js';

export function buildBrandedCsv(
  agency: IAgencyProfile,
  clientLabel: string,
  campaignName: string,
  leads: ReportLead[],
): string {
  const header = `# ${agency.agencyName} — ${clientLabel} — ${campaignName}\n# Generated: ${new Date().toISOString()}\n`;
  const csv = parse(leads, {
    fields: [
      { label: 'Company', value: 'company' },
      { label: 'Domain',  value: 'domain' },
      { label: 'Score',   value: 'score' },
      { label: 'Status',  value: 'status' },
    ],
  });
  return header + csv;
}
```

---

## Client Approval Flow

```typescript
// backend/src/controllers/clientApproval.controller.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { OutreachDraft } from '../models/OutreachDraft.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

// POST /agency/drafts/:draftId/send-for-approval
export async function sendForClientApproval(req: Request, res: Response, next: NextFunction) {
  try {
    const draft = await OutreachDraft.findOne({ _id: req.params.draftId, workspaceId: req.user!.workspaceId });
    if (!draft) throw ApiError.notFound('Draft not found');

    const token = jwt.sign(
      { draftId: draft._id.toString(), purpose: 'client_approval' },
      env.JWT_SECRET,
      { expiresIn: '7d' },
    );

    draft.clientApprovalStatus = 'pending';
    draft.clientApprovalToken  = token;
    draft.clientApprovalSentAt = new Date();
    await draft.save();

    // In production: email clientContactEmail with link to /client-approval/{token}
    res.json({ data: { message: 'Approval request sent', token } });
  } catch (err) { next(err); }
}

// GET /client-approval/:token  (public)
export async function getApprovalDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = jwt.verify(req.params.token, env.JWT_SECRET) as any;
    if (payload.purpose !== 'client_approval') throw ApiError.unauthorized('Invalid token');
    const draft = await OutreachDraft.findById(payload.draftId)
      .select('subject body leadId workspaceId clientApprovalStatus clientNote')
      .lean();
    if (!draft) throw ApiError.notFound('Draft not found');
    res.json({ data: draft });
  } catch (err) { next(err); }
}

// POST /client-approval/:token/approve
export async function approveByClient(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = jwt.verify(req.params.token, env.JWT_SECRET) as any;
    if (payload.purpose !== 'client_approval') throw ApiError.unauthorized('Invalid token');
    const draft = await OutreachDraft.findById(payload.draftId);
    if (!draft) throw ApiError.notFound('Draft not found');
    if (draft.clientApprovalStatus !== 'pending') throw ApiError.badRequest('Draft is no longer pending');

    draft.clientApprovalStatus = 'approved';
    draft.clientApprovedAt     = new Date();
    draft.clientNote           = req.body.note ?? '';
    await draft.save();

    res.json({ data: { message: 'Draft approved' } });
  } catch (err) { next(err); }
}

// POST /client-approval/:token/reject
export async function rejectByClient(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = jwt.verify(req.params.token, env.JWT_SECRET) as any;
    if (payload.purpose !== 'client_approval') throw ApiError.unauthorized('Invalid token');
    const draft = await OutreachDraft.findById(payload.draftId);
    if (!draft) throw ApiError.notFound('Draft not found');
    if (draft.clientApprovalStatus !== 'pending') throw ApiError.badRequest('Draft is no longer pending');

    draft.clientApprovalStatus = 'rejected';
    draft.clientNote           = req.body.note ?? '';
    await draft.save();

    res.json({ data: { message: 'Draft rejected' } });
  } catch (err) { next(err); }
}
```

---

## Agency Controller

```typescript
// backend/src/controllers/agency.controller.ts
import { Request, Response, NextFunction } from 'express';
import { AgencyProfile } from '../models/AgencyProfile.js';
import { ClientWorkspace } from '../models/ClientWorkspace.js';
import { Workspace } from '../models/Workspace.js';
import { ApiError } from '../utils/ApiError.js';

// GET /agency/profile
export async function getAgencyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await AgencyProfile.findOne({ workspaceId: req.user!.workspaceId }).lean();
    res.json({ data: profile });
  } catch (err) { next(err); }
}

// PUT /agency/profile
export async function upsertAgencyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const profile = await AgencyProfile.findOneAndUpdate(
      { workspaceId },
      { $set: req.body },
      { upsert: true, new: true },
    );
    await Workspace.findByIdAndUpdate(workspaceId, { $set: { agencyProfileId: profile._id } });
    res.json({ data: profile });
  } catch (err) { next(err); }
}

// GET /agency/clients
export async function listClients(req: Request, res: Response, next: NextFunction) {
  try {
    const clients = await ClientWorkspace.find({ agencyWorkspaceId: req.user!.workspaceId, isActive: true })
      .populate('clientWorkspaceId', 'name')
      .lean();
    res.json({ data: clients });
  } catch (err) { next(err); }
}

// POST /agency/clients  — creates a new child workspace
export async function createClientWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;
    const { clientLabel, clientContactName, clientContactEmail, creditsAllocated } = req.body;

    const profile = await AgencyProfile.findOne({ workspaceId });
    if (!profile) throw ApiError.badRequest('Agency profile not configured');

    const count = await ClientWorkspace.countDocuments({ agencyWorkspaceId: workspaceId, isActive: true });
    if (count >= profile.planLimits.maxClientWorkspaces) {
      throw ApiError.badRequest(`Client workspace limit (${profile.planLimits.maxClientWorkspaces}) reached`);
    }

    const clientWs = await Workspace.create({
      name: clientLabel,
      ownerId: req.user!._id,
      parentAgencyWorkspaceId: workspaceId,
      isClientWorkspace: true,
    });

    const link = await ClientWorkspace.create({
      agencyWorkspaceId: workspaceId,
      clientWorkspaceId: clientWs._id,
      clientLabel,
      clientContactName,
      clientContactEmail,
      creditsAllocated: creditsAllocated ?? 0,
    });

    res.status(201).json({ data: link });
  } catch (err) { next(err); }
}

// GET /agency/clients/:clientId/usage
export async function getClientUsage(req: Request, res: Response, next: NextFunction) {
  try {
    const link = await ClientWorkspace.findOne({
      agencyWorkspaceId: req.user!.workspaceId,
      clientWorkspaceId: req.params.clientId,
    }).lean();
    if (!link) throw ApiError.notFound('Client not found');
    res.json({ data: link });
  } catch (err) { next(err); }
}

// DELETE /agency/clients/:clientId
export async function deactivateClient(req: Request, res: Response, next: NextFunction) {
  try {
    await ClientWorkspace.findOneAndUpdate(
      { agencyWorkspaceId: req.user!.workspaceId, clientWorkspaceId: req.params.clientId },
      { $set: { isActive: false } },
    );
    res.status(204).end();
  } catch (err) { next(err); }
}
```

---

## Agency Routes

```typescript
// backend/src/routes/agency.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  getAgencyProfile, upsertAgencyProfile, listClients,
  createClientWorkspace, getClientUsage, deactivateClient,
} from '../controllers/agency.controller.js';
import { sendForClientApproval } from '../controllers/clientApproval.controller.js';

const router = Router();
router.use(authenticate);

router.get('/profile',                                 getAgencyProfile);
router.put('/profile',                                 upsertAgencyProfile);
router.get('/clients',                                 listClients);
router.post('/clients',                                createClientWorkspace);
router.get('/clients/:clientId/usage',                 getClientUsage);
router.delete('/clients/:clientId',                    deactivateClient);
router.post('/drafts/:draftId/send-for-approval',     sendForClientApproval);

export default router;
```

```typescript
// backend/src/routes/clientApproval.routes.ts
import { Router } from 'express';
import { getApprovalDraft, approveByClient, rejectByClient } from '../controllers/clientApproval.controller.js';

const router = Router();

router.get('/:token',          getApprovalDraft);
router.post('/:token/approve', approveByClient);
router.post('/:token/reject',  rejectByClient);

export default router;
```

---

## Frontend: Agency Hub

```tsx
// frontend/src/app/(dashboard)/dashboard/agency/page.tsx
'use client';
import { useAgency } from '@/hooks/useAgency';
import ClientWorkspaceCard from '@/components/agency/ClientWorkspaceCard';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function AgencyPage() {
  const { clients, profile, isLoading } = useAgency();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Agency Hub</h1>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Client</Button>
      </div>

      {profile && (
        <div className="border rounded-lg p-4 flex items-center gap-4">
          {profile.logoUrl && <img src={profile.logoUrl} alt="Logo" className="h-10 object-contain" />}
          <div>
            <p className="font-medium">{profile.agencyName}</p>
            <p className="text-sm text-muted-foreground">
              {clients.length} / {profile.planLimits.maxClientWorkspaces} client workspaces
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 border rounded-lg animate-pulse bg-muted" />
            ))
          : clients.map(client => <ClientWorkspaceCard key={client._id} client={client} />)
        }
      </div>
    </div>
  );
}
```

```tsx
// frontend/src/components/agency/ClientWorkspaceCard.tsx
'use client';
import { useRouter } from 'next/navigation';
import UsageSummaryBar from './UsageSummaryBar';

interface Client {
  _id: string;
  clientLabel: string;
  clientContactEmail?: string;
  creditsAllocated: number;
  creditsUsed: number;
  clientWorkspaceId: { _id: string; name: string };
}

export default function ClientWorkspaceCard({ client }: { client: Client }) {
  const router = useRouter();

  function openWorkspace() {
    sessionStorage.setItem('impersonateWorkspaceId', client.clientWorkspaceId._id);
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium">{client.clientLabel}</p>
          {client.clientContactEmail && (
            <p className="text-xs text-muted-foreground">{client.clientContactEmail}</p>
          )}
        </div>
      </div>
      <UsageSummaryBar used={client.creditsUsed} allocated={client.creditsAllocated} />
      <button
        onClick={openWorkspace}
        className="w-full text-sm text-center py-1.5 border rounded hover:bg-muted transition-colors"
      >
        Open workspace
      </button>
    </div>
  );
}
```

```tsx
// frontend/src/components/agency/UsageSummaryBar.tsx
interface Props { used: number; allocated: number; }

export default function UsageSummaryBar({ used, allocated }: Props) {
  const pct = allocated > 0 ? Math.min((used / allocated) * 100, 100) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-blue-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Credits</span>
        <span>{used.toLocaleString()} / {allocated.toLocaleString()}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

---

## Client Approval Public Page

```tsx
// frontend/src/app/client-approval/[token]/page.tsx
'use client';
import { use, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function ClientApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null);

  const draftQ = useQuery({
    queryKey: ['client-approval', token],
    queryFn: () => axios.get(`/api/client-approval/${token}`).then(r => r.data.data),
  });

  const approveMut = useMutation({
    mutationFn: () => axios.post(`/api/client-approval/${token}/approve`, { note }),
    onSuccess:  () => setDone('approved'),
  });

  const rejectMut = useMutation({
    mutationFn: () => axios.post(`/api/client-approval/${token}/reject`, { note }),
    onSuccess:  () => setDone('rejected'),
  });

  if (draftQ.isLoading) return (
    <div className="min-h-screen flex items-center justify-center">Loading…</div>
  );

  if (draftQ.isError) return (
    <div className="min-h-screen flex items-center justify-center text-red-500">
      Link expired or invalid.
    </div>
  );

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          {done === 'approved'
            ? <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            : <XCircle className="h-12 w-12 text-red-400 mx-auto" />
          }
          <p className="text-lg font-medium">Draft {done}.</p>
          <p className="text-sm text-muted-foreground">You can close this page.</p>
        </div>
      </div>
    );
  }

  const draft = draftQ.data;

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 space-y-6">
      <h1 className="text-2xl font-semibold">Review Email Draft</h1>
      <div className="border rounded-lg p-4 space-y-2">
        <p className="text-sm text-muted-foreground">Subject</p>
        <p className="font-medium">{draft.subject}</p>
        <hr />
        <p className="text-sm text-muted-foreground mt-2">Body</p>
        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">{draft.body}</div>
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Optional note to the agency…"
        className="w-full border rounded-lg p-3 text-sm resize-none h-20"
      />
      <div className="flex gap-3">
        <button
          onClick={() => approveMut.mutate()}
          disabled={approveMut.isPending}
          className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
        >
          Approve
        </button>
        <button
          onClick={() => rejectMut.mutate()}
          disabled={rejectMut.isPending}
          className="flex-1 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 font-medium"
        >
          Request Changes
        </button>
      </div>
    </div>
  );
}
```

---

## Impersonation in the API Client

```typescript
// frontend/src/lib/api.ts — add request interceptor
import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const impersonateId = sessionStorage.getItem('impersonateWorkspaceId');
  if (impersonateId) {
    config.headers['X-Impersonate-Workspace'] = impersonateId;
  }
  return config;
});
```

---

## TanStack Query Hooks

```typescript
// frontend/src/hooks/useAgency.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useAgency() {
  const profileQ = useQuery({
    queryKey: ['agency', 'profile'],
    queryFn:  () => api.get('/agency/profile').then(r => r.data.data),
    staleTime: 60_000,
  });

  const clientsQ = useQuery({
    queryKey: ['agency', 'clients'],
    queryFn:  () => api.get('/agency/clients').then(r => r.data.data),
    staleTime: 30_000,
  });

  return {
    profile:   profileQ.data ?? null,
    clients:   clientsQ.data ?? [],
    isLoading: profileQ.isLoading || clientsQ.isLoading,
  };
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) => api.post('/agency/clients', data).then(r => r.data.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['agency', 'clients'] }),
  });
}
```

---

## Implementation Sequence

### Step 1 — AgencyProfile + ClientWorkspace models

- [ ] Create `backend/src/models/AgencyProfile.ts`
- [ ] Create `backend/src/models/ClientWorkspace.ts`
- [ ] Test: create AgencyProfile, create ClientWorkspace linked to it, assert unique index on clientWorkspaceId
- [ ] `git commit -m "feat(backend): AgencyProfile + ClientWorkspace models"`

### Step 2 — Workspace model extensions

- [ ] Modify `backend/src/models/Workspace.ts`: add `parentAgencyWorkspaceId`, `isClientWorkspace`, `clientLabel`, `agencyProfileId`
- [ ] Existing workspace tests must still pass
- [ ] `git commit -m "feat(backend): Workspace agency extension fields"`

### Step 3 — OutreachDraft approval fields

- [ ] Modify `backend/src/models/OutreachDraft.ts`: add all client approval fields
- [ ] `git commit -m "feat(backend): OutreachDraft client approval fields"`

### Step 4 — Agency access service + impersonation middleware

- [ ] Create `backend/src/services/agency/agencyAccess.ts`
- [ ] Create `backend/src/middleware/agencyImpersonate.ts`
- [ ] Add middleware call inside `backend/src/middleware/authenticate.ts` after JWT validation
- [ ] Test: canImpersonate returns true when ClientWorkspace link exists, false otherwise
- [ ] `git commit -m "feat(backend): agency access + impersonation middleware"`

### Step 5 — Agency controller + routes

- [ ] Create `backend/src/controllers/agency.controller.ts` (6 handlers)
- [ ] Create `backend/src/routes/agency.routes.ts`
- [ ] Mount at `/agency` in `backend/src/app.ts`
- [ ] Test: createClientWorkspace when at plan limit returns 400
- [ ] `git commit -m "feat(backend): agency routes"`

### Step 6 — Client approval controller + routes

- [ ] Create `backend/src/controllers/clientApproval.controller.ts` (4 handlers)
- [ ] Create `backend/src/routes/clientApproval.routes.ts`
- [ ] Mount `/client-approval` as unauthenticated route in `backend/src/app.ts` — before `authenticate` middleware
- [ ] Test: sign → get draft → approve → assert status 'approved'; approve again → 400
- [ ] `git commit -m "feat(backend): client approval token flow"`

### Step 7 — PDF + CSV report builder

- [ ] Install pdf-lib: `pnpm --filter backend add pdf-lib`
- [ ] Create `backend/src/services/reports/pdfReportBuilder.ts`
- [ ] Create `backend/src/services/reports/csvExportBuilder.ts`
- [ ] Modify `backend/src/controllers/exports.controller.ts` to fetch agency profile and pass to builders
- [ ] Test: buildLeadReportPdf returns Uint8Array with length > 1000 for 5 sample leads
- [ ] `git commit -m "feat(backend): branded PDF + CSV export"`

### Step 8 — Frontend agency hub

- [ ] Create `frontend/src/hooks/useAgency.ts`
- [ ] Create `frontend/src/components/agency/UsageSummaryBar.tsx`
- [ ] Create `frontend/src/components/agency/ClientWorkspaceCard.tsx`
- [ ] Create `frontend/src/components/agency/BrandingForm.tsx` (logo URL, color picker, domain, save)
- [ ] Create `frontend/src/app/(dashboard)/dashboard/agency/page.tsx`
- [ ] Create `frontend/src/app/(dashboard)/dashboard/agency/settings/page.tsx`
- [ ] Add impersonation interceptor to `frontend/src/lib/api.ts`
- [ ] Add impersonation banner to Topbar
- [ ] Add conditional Agency nav link to Sidebar
- [ ] `git commit -m "feat(frontend): agency hub + client cards + impersonation"`

### Step 9 — Client approval public page

- [ ] Create `frontend/src/app/client-approval/[token]/page.tsx`
- [ ] Verify the route is not behind the dashboard auth layout
- [ ] Test: renders with draft content, approve/reject mutations show confirmation state
- [ ] `git commit -m "feat(frontend): client approval public page"`

---

## API Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /agency/profile | JWT | Get agency branding profile |
| PUT | /agency/profile | JWT | Create/update agency profile |
| GET | /agency/clients | JWT | List client workspaces |
| POST | /agency/clients | JWT | Create client workspace |
| GET | /agency/clients/:id/usage | JWT | Get client credit usage |
| DELETE | /agency/clients/:id | JWT | Deactivate client workspace |
| POST | /agency/drafts/:draftId/send-for-approval | JWT | Send draft for client approval |
| GET | /client-approval/:token | Public | Get draft by approval token |
| POST | /client-approval/:token/approve | Public | Approve draft |
| POST | /client-approval/:token/reject | Public | Reject draft with note |

---

## Verification Criteria

- Creating agency profile sets `agencyProfileId` on workspace
- Creating a client workspace when at limit returns 400 with limit message
- X-Impersonate-Workspace with valid linked clientId overrides req.user.workspaceId
- X-Impersonate-Workspace with an unlinked workspace ID does NOT override workspaceId
- sendForClientApproval creates JWT token, sets draft.clientApprovalStatus = 'pending'
- getApprovalDraft decodes JWT, returns draft without sensitive fields
- approveByClient sets clientApprovalStatus = 'approved', clientApprovedAt set to now
- rejectByClient sets clientApprovalStatus = 'rejected', clientNote set from body
- Calling approve on an already-approved draft returns 400
- buildLeadReportPdf returns non-empty Uint8Array with agency name embedded
- buildBrandedCsv includes agency name comment on first line
- Agency hub lists all active clients with usage bars
- Impersonation banner visible when impersonateWorkspaceId in sessionStorage
- "Exit" button clears sessionStorage and reloads to normal view
