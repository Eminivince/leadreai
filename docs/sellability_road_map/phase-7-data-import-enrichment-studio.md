# Phase 7 — Data Import, Cleanup & Enrichment Studio

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users bring their own data — upload CSV or connect a CRM — then clean, deduplicate, enrich, and re-score it through LeadreAI's existing pipeline.

**Architecture:** File uploads are handled via multipart form-data (multer) and parsed in a BullMQ worker. Each row maps to a Lead document using a user-defined field mapping (stored in `ImportJob`). A separate deduplication pass uses MongoDB aggregation to find duplicate domains within the workspace and merges them. Re-enrichment runs existing pipeline stages against stale leads on demand.

**Tech Stack:** Backend: Express, multer, csv-parse, xlsx, BullMQ, Mongoose. Frontend: Next.js 14, shadcn/ui, react-dropzone, TanStack Query.

---

## Roadmap Modules Covered

- Module 18 — Data Import, Cleanup and Enrichment Studio (CSV import, field mapping, dedupe, re-enrichment, stale refresh, gap filling)
- Module 2 partial — CRM import (import from HubSpot contact list as a one-time pull)

---

## File Map

### New Backend Files

| File | Responsibility |
|---|---|
| `backend/src/models/ImportJob.ts` | Import job: file ref, field mapping, status, row counts, error log |
| `backend/src/services/import/csvParser.ts` | Parse CSV/XLSX file, return array of raw rows |
| `backend/src/services/import/fieldMapper.ts` | Apply user-defined mapping to raw rows, produce Lead-shaped objects |
| `backend/src/services/import/importWorker.ts` | BullMQ worker: parse file → map fields → upsert leads → dedupe |
| `backend/src/services/import/deduplicator.ts` | Find duplicate domain records within workspace, merge fields |
| `backend/src/services/import/staleRefresher.ts` | Find leads not enriched in N days, queue re-enrichment |
| `backend/src/controllers/import.controller.ts` | Upload, status, field mapping, trigger dedupe/stale-refresh |
| `backend/src/routes/import.routes.ts` | Mount under `/import` |
| `backend/src/middleware/upload.ts` | multer config: 10MB max, CSV/XLSX only, temp storage |

### Modified Backend Files

| File | Changes |
|---|---|
| `backend/src/models/Lead.ts` | Add `importJobId?`, `importedAt?`, `lastEnrichedAt?`, `enrichmentGapFields: string[]` |
| `workers/src/enrichment.worker.ts` | Accept `isReEnrichment` flag; write `lastEnrichedAt` on completion |
| `backend/src/app.ts` | Mount import router |

### New Frontend Files

| File | Responsibility |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/import/page.tsx` | Import hub: upload zone, recent imports, dedupe button |
| `frontend/src/app/(dashboard)/dashboard/import/[jobId]/page.tsx` | Import job detail: field mapping step, progress, error log |
| `frontend/src/components/import/FileDropzone.tsx` | react-dropzone area for CSV/XLSX upload |
| `frontend/src/components/import/FieldMappingTable.tsx` | Table: file column ↔ LeadreAI field dropdown |
| `frontend/src/components/import/ImportProgressBar.tsx` | Progress bar with row counts |
| `frontend/src/components/import/DedupePanel.tsx` | Shows duplicate count, merge preview, run button |
| `frontend/src/components/import/StaleRefreshPanel.tsx` | Shows stale lead count, last enrichment date dist, run button |
| `frontend/src/hooks/useImport.ts` | TanStack Query hooks |

---

## Data Models

### ImportJob

```typescript
// backend/src/models/ImportJob.ts
import { Schema, model, Document, Types } from 'mongoose';

export type ImportStatus = 'pending' | 'mapping' | 'processing' | 'completed' | 'failed';

export interface IFieldMapping {
  sourceColumn: string;   // column name from uploaded file
  targetField:  string;   // Lead model field name, e.g. 'company', 'domain', 'email'
}

export interface IImportJob extends Document {
  workspaceId:    Types.ObjectId;
  fileName:       string;
  filePath:       string;       // temp file path on server
  fileSize:       number;
  mimeType:       string;
  status:         ImportStatus;
  fieldMapping:   IFieldMapping[];
  totalRows:      number;
  processedRows:  number;
  importedRows:   number;       // successfully upserted
  skippedRows:    number;       // rows with missing required fields
  errorRows:      number;
  errorLog:       Array<{ row: number; error: string }>;
  dedupeRun:      boolean;
  dedupeRemoved:  number;
  createdAt:      Date;
  updatedAt:      Date;
}

const ImportJobSchema = new Schema<IImportJob>({
  workspaceId:    { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  fileName:       { type: String, required: true },
  filePath:       { type: String, required: true },
  fileSize:       { type: Number },
  mimeType:       { type: String },
  status:         { type: String, enum: ['pending','mapping','processing','completed','failed'], default: 'pending' },
  fieldMapping:   [{ sourceColumn: String, targetField: String }],
  totalRows:      { type: Number, default: 0 },
  processedRows:  { type: Number, default: 0 },
  importedRows:   { type: Number, default: 0 },
  skippedRows:    { type: Number, default: 0 },
  errorRows:      { type: Number, default: 0 },
  errorLog:       [{ row: Number, error: String }],
  dedupeRun:      { type: Boolean, default: false },
  dedupeRemoved:  { type: Number, default: 0 },
}, { timestamps: true });

export const ImportJob = model<IImportJob>('ImportJob', ImportJobSchema);
```

### Lead — Import Fields

```typescript
// Add to backend/src/models/Lead.ts:
importJobId:         Types.ObjectId;  // which import created/updated this lead
importedAt:          Date;
lastEnrichedAt:      Date;
enrichmentGapFields: string[];        // fields that are null/empty after enrichment

// Add to LeadSchema:
importJobId:         { type: Schema.Types.ObjectId, ref: 'ImportJob' },
importedAt:          { type: Date },
lastEnrichedAt:      { type: Date },
enrichmentGapFields: { type: [String], default: [] },
```

---

## CSV/XLSX Parser

```typescript
// backend/src/services/import/csvParser.ts
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import fs from 'fs';

export interface ParsedRow { [column: string]: string; }

export function parseFile(filePath: string, mimeType: string): { headers: string[]; rows: ParsedRow[] } {
  if (mimeType === 'text/csv' || filePath.endsWith('.csv')) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    return { headers, rows: records as ParsedRow[] };
  }

  // XLSX / XLS
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: '' });
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
  return { headers, rows };
}
```

---

## Field Mapper

```typescript
// backend/src/services/import/fieldMapper.ts
import type { IFieldMapping, ParsedRow } from './types.js';

export const LEAD_FIELDS = [
  'company', 'domain', 'email', 'phone', 'address', 'city', 'country',
  'industry', 'employeeCount', 'revenue', 'description', 'linkedinUrl',
  'contactName', 'contactTitle', 'contactEmail', 'contactLinkedin',
] as const;

export type LeadField = typeof LEAD_FIELDS[number];

export interface MappedLead {
  [key: string]: string | undefined;
}

export function applyMapping(row: ParsedRow, mapping: IFieldMapping[]): MappedLead {
  const result: MappedLead = {};
  for (const m of mapping) {
    if (m.targetField && row[m.sourceColumn] !== undefined) {
      result[m.targetField] = String(row[m.sourceColumn]).trim();
    }
  }
  return result;
}

export function detectGapFields(lead: MappedLead): string[] {
  return LEAD_FIELDS.filter(f => !lead[f] || lead[f] === '');
}
```

---

## Import BullMQ Worker

```typescript
// backend/src/services/import/importWorker.ts
import { Worker } from 'bullmq';
import { getRedis } from '../../config/redis.js';
import { ImportJob } from '../../models/ImportJob.js';
import { Lead } from '../../models/Lead.js';
import { parseFile } from './csvParser.js';
import { applyMapping, detectGapFields } from './fieldMapper.js';
import logger from '../../config/logger.js';

const QUEUE_NAME = 'data-import';

export function startImportWorker() {
  const worker = new Worker(QUEUE_NAME, async (job) => {
    const { importJobId } = job.data as { importJobId: string };
    const importJob = await ImportJob.findById(importJobId);
    if (!importJob) return;

    importJob.status = 'processing';
    await importJob.save();

    let processedRows = 0;
    let importedRows  = 0;
    let skippedRows   = 0;
    let errorRows     = 0;
    const errorLog: Array<{ row: number; error: string }> = [];

    try {
      const { rows } = parseFile(importJob.filePath, importJob.mimeType);
      importJob.totalRows = rows.length;
      await importJob.save();

      for (let i = 0; i < rows.length; i++) {
        processedRows++;
        try {
          const mapped = applyMapping(rows[i]!, importJob.fieldMapping);
          if (!mapped.company && !mapped.domain) {
            skippedRows++;
            continue;
          }

          const gapFields = detectGapFields(mapped);
          await Lead.findOneAndUpdate(
            {
              workspaceId: importJob.workspaceId,
              $or: [
                ...(mapped.domain ? [{ domain: mapped.domain }] : []),
                { company: mapped.company },
              ],
            },
            {
              $setOnInsert: { createdAt: new Date(), importedAt: new Date() },
              $set: {
                workspaceId: importJob.workspaceId,
                importJobId: importJob._id,
                enrichmentGapFields: gapFields,
                ...mapped,
              },
            },
            { upsert: true, new: true },
          );
          importedRows++;
        } catch (rowErr: any) {
          errorRows++;
          errorLog.push({ row: i + 2, error: rowErr.message ?? 'Unknown error' }); // +2 = 1-indexed + header
        }

        // Save progress every 100 rows
        if (processedRows % 100 === 0) {
          await ImportJob.findByIdAndUpdate(importJobId, { $set: { processedRows, importedRows, skippedRows, errorRows } });
        }
      }

      await ImportJob.findByIdAndUpdate(importJobId, {
        $set: {
          status: 'completed',
          processedRows, importedRows, skippedRows, errorRows,
          errorLog: errorLog.slice(0, 100), // cap error log at 100 entries
        },
      });

      logger.info(`[importWorker] Import ${importJobId} completed: ${importedRows} imported, ${skippedRows} skipped, ${errorRows} errors`);
    } catch (err) {
      await ImportJob.findByIdAndUpdate(importJobId, { $set: { status: 'failed' } });
      logger.error('[importWorker] Import failed', err);
      throw err;
    }
  }, { connection: getRedis(), concurrency: 2 });

  worker.on('failed', (job, err) => logger.error('[importWorker] Job failed', err));
  return worker;
}
```

---

## Deduplicator Service

```typescript
// backend/src/services/import/deduplicator.ts
import { Lead } from '../../models/Lead.js';
import type { Types } from 'mongoose';

export interface DedupeResult {
  duplicateGroupsFound: number;
  leadsRemoved: number;
}

export async function deduplicateWorkspaceLeads(workspaceId: Types.ObjectId): Promise<DedupeResult> {
  // Find all domains that appear more than once in this workspace
  const duplicateGroups = await Lead.aggregate([
    { $match: { workspaceId, domain: { $exists: true, $ne: '' } } },
    { $group: { _id: '$domain', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  let leadsRemoved = 0;

  for (const group of duplicateGroups) {
    // Keep highest-scored lead; delete the rest
    const leads = await Lead.find({ _id: { $in: group.ids } }).sort({ score: -1 }).lean();
    const [keep, ...duplicates] = leads;
    if (!keep || duplicates.length === 0) continue;

    // Merge: fill any null fields on 'keep' from duplicates
    const mergedFields: Record<string, any> = {};
    for (const dup of duplicates) {
      for (const [k, v] of Object.entries(dup)) {
        if (v && !(keep as any)[k]) mergedFields[k] = v;
      }
    }
    if (Object.keys(mergedFields).length > 0) {
      await Lead.findByIdAndUpdate(keep._id, { $set: mergedFields });
    }

    const dupIds = duplicates.map(d => d._id);
    await Lead.deleteMany({ _id: { $in: dupIds } });
    leadsRemoved += dupIds.length;
  }

  return { duplicateGroupsFound: duplicateGroups.length, leadsRemoved };
}

export async function getDedupePreview(workspaceId: Types.ObjectId): Promise<{ duplicateGroups: number; estimatedRemoval: number }> {
  const duplicateGroups = await Lead.aggregate([
    { $match: { workspaceId, domain: { $exists: true, $ne: '' } } },
    { $group: { _id: '$domain', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $group: { _id: null, groups: { $sum: 1 }, total: { $sum: '$count' } } },
  ]);
  const result = duplicateGroups[0];
  return {
    duplicateGroups:  result?.groups ?? 0,
    estimatedRemoval: result ? result.total - result.groups : 0, // one per group kept
  };
}
```

---

## Stale Refresh Service

```typescript
// backend/src/services/import/staleRefresher.ts
import { Lead } from '../../models/Lead.js';
import { getEnrichmentQueue } from '../../queues/index.js';
import type { Types } from 'mongoose';

export interface StaleRefreshResult {
  queued: number;
}

export async function queueStaleLeadsForReEnrichment(
  workspaceId: Types.ObjectId,
  staleAfterDays = 30,
): Promise<StaleRefreshResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleAfterDays);

  const staleLeads = await Lead.find({
    workspaceId,
    $or: [
      { lastEnrichedAt: { $lt: cutoff } },
      { lastEnrichedAt: { $exists: false } },
    ],
  }).select('_id').limit(200).lean();

  const queue = getEnrichmentQueue();
  for (const lead of staleLeads) {
    await queue.add('re-enrich', { leadId: lead._id.toString(), isReEnrichment: true });
  }

  return { queued: staleLeads.length };
}

export async function getStaleLeadCount(
  workspaceId: Types.ObjectId,
  staleAfterDays = 30,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleAfterDays);
  return Lead.countDocuments({
    workspaceId,
    $or: [
      { lastEnrichedAt: { $lt: cutoff } },
      { lastEnrichedAt: { $exists: false } },
    ],
  });
}
```

---

## Multer Upload Middleware

```typescript
// backend/src/middleware/upload.ts
import multer from 'multer';
import path from 'path';
import os from 'os';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const uploadSingle = multer({
  dest: path.join(os.tmpdir(), 'leadreai-imports'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new (ApiError as any).badRequest('Only CSV and XLSX files are allowed') as any);
    }
  },
}).single('file');
```

---

## Import Controller

```typescript
// backend/src/controllers/import.controller.ts
import { Request, Response, NextFunction } from 'express';
import { ImportJob } from '../models/ImportJob.js';
import { parseFile } from '../services/import/csvParser.js';
import { deduplicateWorkspaceLeads, getDedupePreview } from '../services/import/deduplicator.js';
import { queueStaleLeadsForReEnrichment, getStaleLeadCount } from '../services/import/staleRefresher.js';
import { getImportQueue } from '../queues/index.js';
import { ApiError } from '../utils/ApiError.js';

// POST /import/upload
export async function uploadFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw ApiError.badRequest('No file uploaded');
    const { headers } = parseFile(req.file.path, req.file.mimetype);

    const importJob = await ImportJob.create({
      workspaceId: req.user!.workspaceId,
      fileName:    req.file.originalname,
      filePath:    req.file.path,
      fileSize:    req.file.size,
      mimeType:    req.file.mimetype,
      status:      'mapping',
    });

    res.status(201).json({ data: { importJobId: importJob._id, headers } });
  } catch (err) { next(err); }
}

// POST /import/:jobId/mapping  — save mapping + start import
export async function setFieldMapping(req: Request, res: Response, next: NextFunction) {
  try {
    const importJob = await ImportJob.findOne({ _id: req.params.jobId, workspaceId: req.user!.workspaceId });
    if (!importJob) throw ApiError.notFound('Import job not found');

    const { fieldMapping } = req.body as { fieldMapping: Array<{ sourceColumn: string; targetField: string }> };
    if (!Array.isArray(fieldMapping) || fieldMapping.length === 0) {
      throw ApiError.badRequest('fieldMapping array required');
    }

    importJob.fieldMapping = fieldMapping;
    importJob.status       = 'processing';
    await importJob.save();

    await getImportQueue().add('process', { importJobId: importJob._id.toString() });

    res.json({ data: { message: 'Import started', importJobId: importJob._id } });
  } catch (err) { next(err); }
}

// GET /import/:jobId  — status
export async function getImportJob(req: Request, res: Response, next: NextFunction) {
  try {
    const importJob = await ImportJob.findOne({ _id: req.params.jobId, workspaceId: req.user!.workspaceId }).lean();
    if (!importJob) throw ApiError.notFound('Import job not found');
    res.json({ data: importJob });
  } catch (err) { next(err); }
}

// GET /import  — list recent imports
export async function listImportJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const jobs = await ImportJob.find({ workspaceId: req.user!.workspaceId })
      .sort({ createdAt: -1 }).limit(20).select('-fieldMapping -errorLog -filePath').lean();
    res.json({ data: jobs });
  } catch (err) { next(err); }
}

// GET /import/dedupe/preview
export async function getDedupePreviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const preview = await getDedupePreview(req.user!.workspaceId);
    res.json({ data: preview });
  } catch (err) { next(err); }
}

// POST /import/dedupe/run
export async function runDedupe(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await deduplicateWorkspaceLeads(req.user!.workspaceId);
    res.json({ data: result });
  } catch (err) { next(err); }
}

// GET /import/stale/preview
export async function getStalePreviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const staleAfterDays = parseInt((req.query.staleAfterDays as string) ?? '30', 10);
    const count = await getStaleLeadCount(req.user!.workspaceId, staleAfterDays);
    res.json({ data: { staleLeads: count, staleAfterDays } });
  } catch (err) { next(err); }
}

// POST /import/stale/refresh
export async function runStaleRefresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { staleAfterDays = 30 } = req.body;
    const result = await queueStaleLeadsForReEnrichment(req.user!.workspaceId, staleAfterDays);
    res.json({ data: result });
  } catch (err) { next(err); }
}
```

---

## Import Routes

```typescript
// backend/src/routes/import.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { uploadSingle } from '../middleware/upload.js';
import {
  uploadFile, setFieldMapping, getImportJob, listImportJobs,
  getDedupePreviewHandler, runDedupe, getStalePreviewHandler, runStaleRefresh,
} from '../controllers/import.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',                    listImportJobs);
router.post('/upload',             uploadSingle, uploadFile);
router.get('/dedupe/preview',      getDedupePreviewHandler);
router.post('/dedupe/run',         runDedupe);
router.get('/stale/preview',       getStalePreviewHandler);
router.post('/stale/refresh',      runStaleRefresh);
router.get('/:jobId',              getImportJob);
router.post('/:jobId/mapping',     setFieldMapping);

export default router;
```

---

## Frontend: Import Hub

```tsx
// frontend/src/app/(dashboard)/dashboard/import/page.tsx
'use client';
import { useImport } from '@/hooks/useImport';
import FileDropzone from '@/components/import/FileDropzone';
import DedupePanel from '@/components/import/DedupePanel';
import StaleRefreshPanel from '@/components/import/StaleRefreshPanel';
import ImportProgressBar from '@/components/import/ImportProgressBar';
import Link from 'next/link';

export default function ImportPage() {
  const { recentJobs, dedupePreview, stalePreview, upload, runDedupe, runStaleRefresh, isLoading } = useImport();

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Data Import & Enrichment Studio</h1>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="border rounded-lg p-5 space-y-3">
          <h2 className="text-base font-medium">Upload File</h2>
          <p className="text-sm text-muted-foreground">CSV or XLSX — up to 10 MB</p>
          <FileDropzone onUpload={upload} />
        </section>

        <div className="space-y-4">
          <DedupePanel preview={dedupePreview} onRun={runDedupe} />
          <StaleRefreshPanel preview={stalePreview} onRun={runStaleRefresh} />
        </div>
      </div>

      <section>
        <h2 className="text-base font-medium mb-3">Recent Imports</h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-16 border rounded animate-pulse bg-muted" />)}
          </div>
        ) : recentJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <div className="space-y-2">
            {recentJobs.map(job => (
              <Link
                key={job._id}
                href={`/dashboard/import/${job._id}`}
                className="block border rounded-lg p-3 hover:bg-muted transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{job.fileName}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    job.status === 'completed' ? 'bg-green-100 text-green-700' :
                    job.status === 'failed'    ? 'bg-red-100 text-red-600' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {job.status}
                  </span>
                </div>
                {job.status === 'processing' && (
                  <ImportProgressBar processed={job.processedRows} total={job.totalRows} />
                )}
                {job.status === 'completed' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {job.importedRows} imported · {job.skippedRows} skipped · {job.errorRows} errors
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

```tsx
// frontend/src/components/import/FileDropzone.tsx
'use client';
import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';

interface Props { onUpload: (file: File) => void; }

export default function FileDropzone({ onUpload }: Props) {
  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) onUpload(accepted[0]);
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
      }`}
    >
      <input {...getInputProps()} />
      <UploadCloud className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">
        {isDragActive ? 'Drop it here…' : 'Drag & drop CSV or XLSX, or click to browse'}
      </p>
    </div>
  );
}
```

```tsx
// frontend/src/components/import/FieldMappingTable.tsx
const LEAD_FIELDS = [
  '', 'company', 'domain', 'email', 'phone', 'address', 'city', 'country',
  'industry', 'employeeCount', 'revenue', 'description', 'linkedinUrl',
  'contactName', 'contactTitle', 'contactEmail',
];

interface Mapping { sourceColumn: string; targetField: string; }
interface Props {
  headers: string[];
  mapping: Mapping[];
  onChange: (mapping: Mapping[]) => void;
}

export default function FieldMappingTable({ headers, mapping, onChange }: Props) {
  function setTarget(sourceColumn: string, targetField: string) {
    const next = mapping.map(m => m.sourceColumn === sourceColumn ? { ...m, targetField } : m);
    onChange(next);
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="text-left px-4 py-2 font-medium">File Column</th>
            <th className="text-left px-4 py-2 font-medium">Maps To</th>
          </tr>
        </thead>
        <tbody>
          {headers.map(col => (
            <tr key={col} className="border-t">
              <td className="px-4 py-2 font-mono text-xs">{col}</td>
              <td className="px-4 py-2">
                <select
                  value={mapping.find(m => m.sourceColumn === col)?.targetField ?? ''}
                  onChange={e => setTarget(col, e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm"
                >
                  <option value="">-- skip --</option>
                  {LEAD_FIELDS.filter(Boolean).map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

```tsx
// frontend/src/components/import/DedupePanel.tsx
interface Preview { duplicateGroups: number; estimatedRemoval: number; }
interface Props { preview: Preview | null; onRun: () => void; }

export default function DedupePanel({ preview, onRun }: Props) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-medium">Deduplication</h3>
      {preview ? (
        <p className="text-sm text-muted-foreground">
          {preview.duplicateGroups} duplicate domain group{preview.duplicateGroups !== 1 ? 's' : ''} found
          — estimated {preview.estimatedRemoval} record{preview.estimatedRemoval !== 1 ? 's' : ''} to remove
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Loading preview…</p>
      )}
      <button
        onClick={onRun}
        disabled={!preview || preview.duplicateGroups === 0}
        className="px-4 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
      >
        Run Deduplication
      </button>
    </div>
  );
}
```

```tsx
// frontend/src/components/import/StaleRefreshPanel.tsx
interface Preview { staleLeads: number; staleAfterDays: number; }
interface Props { preview: Preview | null; onRun: () => void; }

export default function StaleRefreshPanel({ preview, onRun }: Props) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-medium">Stale Lead Refresh</h3>
      {preview ? (
        <p className="text-sm text-muted-foreground">
          {preview.staleLeads} lead{preview.staleLeads !== 1 ? 's' : ''} not enriched in {preview.staleAfterDays}+ days
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      <button
        onClick={onRun}
        disabled={!preview || preview.staleLeads === 0}
        className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
      >
        Queue Re-enrichment
      </button>
    </div>
  );
}
```

---

## TanStack Query Hooks

```typescript
// frontend/src/hooks/useImport.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

export function useImport() {
  const qc = useQueryClient();
  const router = useRouter();

  const jobsQ = useQuery({
    queryKey: ['import', 'jobs'],
    queryFn:  () => api.get('/import').then(r => r.data.data),
    staleTime: 15_000,
  });

  const dedupeQ = useQuery({
    queryKey: ['import', 'dedupe-preview'],
    queryFn:  () => api.get('/import/dedupe/preview').then(r => r.data.data),
    staleTime: 60_000,
  });

  const staleQ = useQuery({
    queryKey: ['import', 'stale-preview'],
    queryFn:  () => api.get('/import/stale/preview').then(r => r.data.data),
    staleTime: 60_000,
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/import/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then(r => r.data.data);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import', 'jobs'] });
      router.push(`/dashboard/import/${data.importJobId}`);
    },
  });

  const dedupeMut = useMutation({
    mutationFn: () => api.post('/import/dedupe/run').then(r => r.data.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['import', 'dedupe-preview'] }),
  });

  const staleMut = useMutation({
    mutationFn: () => api.post('/import/stale/refresh').then(r => r.data.data),
  });

  return {
    recentJobs:   jobsQ.data  ?? [],
    dedupePreview:dedupeQ.data ?? null,
    stalePreview: staleQ.data  ?? null,
    isLoading:    jobsQ.isLoading,
    upload:       (file: File) => uploadMut.mutate(file),
    runDedupe:    () => dedupeMut.mutate(),
    runStaleRefresh: () => staleMut.mutate(),
  };
}
```

---

## Implementation Sequence

### Step 1 — ImportJob model + Lead import fields

- [ ] Create `backend/src/models/ImportJob.ts`
- [ ] Modify `backend/src/models/Lead.ts`: add `importJobId`, `importedAt`, `lastEnrichedAt`, `enrichmentGapFields`
- [ ] Test: create ImportJob, assert indexes; Lead upsert with importJobId works
- [ ] `git commit -m "feat(backend): ImportJob model + Lead import fields"`

### Step 2 — CSV/XLSX parser + field mapper

- [ ] Install deps: `pnpm --filter backend add csv-parse xlsx multer`
- [ ] Create `backend/src/services/import/csvParser.ts`
- [ ] Create `backend/src/services/import/fieldMapper.ts`
- [ ] Test: parseFile('sample.csv', 'text/csv') returns correct headers and row count; applyMapping maps columns correctly; detectGapFields identifies missing fields
- [ ] `git commit -m "feat(backend): CSV/XLSX parser + field mapper"`

### Step 3 — Import BullMQ worker

- [ ] Create `backend/src/services/import/importWorker.ts`
- [ ] Register `data-import` queue in queues index
- [ ] Start import worker in `backend/src/server.ts`
- [ ] Test: feed 5-row CSV to worker, assert 5 ImportJob.importedRows, Lead documents created
- [ ] `git commit -m "feat(backend): import BullMQ worker"`

### Step 4 — Deduplicator + stale refresher

- [ ] Create `backend/src/services/import/deduplicator.ts`
- [ ] Create `backend/src/services/import/staleRefresher.ts`
- [ ] Test: seed 3 leads with same domain, run deduplicator, assert 2 removed and best record kept; staleRefresher queues correct count
- [ ] `git commit -m "feat(backend): deduplicator + stale refresher"`

### Step 5 — Upload middleware + import controller + routes

- [ ] Create `backend/src/middleware/upload.ts` (multer)
- [ ] Create `backend/src/controllers/import.controller.ts` (8 handlers)
- [ ] Create `backend/src/routes/import.routes.ts`
- [ ] Mount at `/import` in `backend/src/app.ts`
- [ ] Test: upload CSV returns headers; set mapping starts import; get status returns progress
- [ ] `git commit -m "feat(backend): import API endpoints"`

### Step 6 — Enrichment worker re-enrichment support

- [ ] Modify `workers/src/enrichment.worker.ts`: when `job.data.isReEnrichment = true`, update `lastEnrichedAt` and re-run enrichment stages
- [ ] Test: re-enrichment job updates `lastEnrichedAt` on the Lead
- [ ] `git commit -m "feat(workers): re-enrichment support in enrichment worker"`

### Step 7 — Frontend import hub

- [ ] Install: `pnpm --filter frontend add react-dropzone`
- [ ] Create `frontend/src/hooks/useImport.ts`
- [ ] Create `frontend/src/components/import/FileDropzone.tsx`
- [ ] Create `frontend/src/components/import/FieldMappingTable.tsx`
- [ ] Create `frontend/src/components/import/ImportProgressBar.tsx`
- [ ] Create `frontend/src/components/import/DedupePanel.tsx`
- [ ] Create `frontend/src/components/import/StaleRefreshPanel.tsx`
- [ ] Create `frontend/src/app/(dashboard)/dashboard/import/page.tsx`
- [ ] Create `frontend/src/app/(dashboard)/dashboard/import/[jobId]/page.tsx` (shows headers, mapping table, save button, then progress)
- [ ] Add Import link to Sidebar
- [ ] `git commit -m "feat(frontend): data import studio"`

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | /import | List recent import jobs |
| POST | /import/upload | Upload CSV/XLSX (multipart) |
| POST | /import/:jobId/mapping | Set field mapping + start import |
| GET | /import/:jobId | Get import job status |
| GET | /import/dedupe/preview | Preview duplicate count |
| POST | /import/dedupe/run | Run workspace deduplication |
| GET | /import/stale/preview | Preview stale lead count |
| POST | /import/stale/refresh | Queue stale leads for re-enrichment |

---

## Verification Criteria

- Upload CSV returns array of column headers from first row
- Setting field mapping starts the import worker and sets status to 'processing'
- Import worker upserts leads by domain (or company if no domain), not duplicates within same run
- Progress counter increments every 100 rows; final status is 'completed' or 'failed'
- deduplicateWorkspaceLeads keeps highest-scored lead, merges fields from duplicates, deletes the rest
- getDedupePreview returns correct group count and estimated removal without deleting anything
- queueStaleLeadsForReEnrichment queues leads where lastEnrichedAt is older than threshold
- Enrichment worker sets lastEnrichedAt after re-enrichment completes
- Frontend dropzone accepts CSV and XLSX, rejects other types with error state
- Field mapping table allows per-column selection of target LeadreAI field
- Dedupe panel and stale panel show counts and disable buttons when count is 0
