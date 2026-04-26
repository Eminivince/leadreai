import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import DataTable from '../models/DataTable.js';
import DataTableRow from '../models/DataTableRow.js';
import {
  CreateDataTableSchema,
  UpdateDataTableSchema,
  AddColumnInputSchema,
  AddRowInputSchema,
  AddRowsBulkInputSchema,
  UpdateRowInputSchema,
  ColumnDefSchema,
} from '@leadreai/shared';
import {
  assertCellKeysKnown,
  assertColumnKeyAvailable,
  bulkAddRows,
  defaultColumnsFor,
  seedTableFromJob,
  wrapCells,
} from '../services/data-tables/service.js';
import {
  estimateEnrichment,
  dispatchEnrichment,
  enrichOne,
} from '../services/data-tables/enrichment.js';
import {
  listActionsForWorkspace,
  runAction,
  type RunActionInput,
} from '../services/data-tables/actions.js';
import { ApiError } from '../utils/ApiError.js';
import { logAudit } from '../services/audit.js';

// ── Tables ─────────────────────────────────────────────────────────

export async function listTables(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10) || 20));
  const includeArchived = req.query['includeArchived'] === 'true';

  const filter: Record<string, unknown> = { workspaceId: new mongoose.Types.ObjectId(workspaceId!) };
  if (!includeArchived) filter['archivedAt'] = { $exists: false };

  const [tables, total] = await Promise.all([
    DataTable.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    DataTable.countDocuments(filter),
  ]);
  res.json({ success: true, data: { data: tables, total, page, limit } });
}

export async function createTable(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { workspaceId } = req.params;

  const parsed = CreateDataTableSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid payload');
  }

  const { name, description, rowType, tags } = parsed.data;
  // If caller didn't send columns, seed with sensible defaults for rowType.
  const columns = parsed.data.columns.length > 0
    ? parsed.data.columns
    : defaultColumnsFor(rowType);

  // Column-key uniqueness — prevent duplicate keys within the same table.
  const keys = new Set<string>();
  for (const c of columns) {
    if (keys.has(c.key)) throw ApiError.badRequest(`Duplicate column key: ${c.key}`);
    keys.add(c.key);
  }

  const table = await DataTable.create({
    workspaceId: workspaceId!,
    createdBy: req.user._id,
    name,
    description,
    rowType,
    columns,
    tags: tags ?? [],
  });

  logAudit({
    req,
    workspaceId: workspaceId!,
    action: 'data_table.create',
    resourceType: 'campaign',
    resourceId: table._id,
    metadata: { name: table.name, rowType: table.rowType, columnCount: columns.length },
  });

  res.status(201).json({ success: true, data: table });
}

export async function getTable(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');
  const table = await DataTable.findOne({ _id: tableId, workspaceId });
  if (!table) throw ApiError.notFound('Table not found');
  res.json({ success: true, data: table });
}

export async function updateTable(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const parsed = UpdateDataTableSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid payload');

  const setFields: Record<string, unknown> = {};
  const unsetFields: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) setFields['name'] = parsed.data.name;
  if (parsed.data.description !== undefined) setFields['description'] = parsed.data.description;
  if (parsed.data.tags !== undefined) setFields['tags'] = parsed.data.tags;
  if (parsed.data.archived === true) setFields['archivedAt'] = new Date();
  if (parsed.data.archived === false) unsetFields['archivedAt'] = '';

  const update: Record<string, unknown> = {};
  if (Object.keys(setFields).length > 0) update['$set'] = setFields;
  if (Object.keys(unsetFields).length > 0) update['$unset'] = unsetFields;

  if (Object.keys(update).length === 0) throw ApiError.badRequest('No fields to update');

  const table = await DataTable.findOneAndUpdate({ _id: tableId, workspaceId }, update, { new: true });
  if (!table) throw ApiError.notFound('Table not found');

  res.json({ success: true, data: table });
}

export async function deleteTable(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const table = await DataTable.findOneAndDelete({ _id: tableId, workspaceId });
  if (!table) throw ApiError.notFound('Table not found');

  // Clean up rows. Done after table delete so a failed row delete doesn't
  // leave a zombie table; worst case is orphaned rows (safe — they filter
  // by tableId which no longer exists).
  await DataTableRow.deleteMany({ tableId: table._id });

  logAudit({
    req,
    workspaceId: workspaceId!,
    action: 'data_table.delete',
    resourceType: 'campaign',
    resourceId: table._id,
    metadata: { name: table.name },
  });

  res.json({ success: true });
}

// ── Columns ────────────────────────────────────────────────────────

export async function addColumn(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const parsed = AddColumnInputSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid payload');

  const table = await DataTable.findOne({ _id: tableId, workspaceId });
  if (!table) throw ApiError.notFound('Table not found');

  assertColumnKeyAvailable(table, parsed.data.key);
  table.columns.push(parsed.data);
  await table.save();

  res.status(201).json({ success: true, data: table });
}

export async function updateColumn(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId, columnKey } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  // Accept a partial column def; the key itself is fixed (path param).
  const partial = ColumnDefSchema.partial().safeParse(req.body);
  if (!partial.success) throw ApiError.badRequest(partial.error.issues[0]?.message ?? 'Invalid payload');

  const table = await DataTable.findOne({ _id: tableId, workspaceId });
  if (!table) throw ApiError.notFound('Table not found');

  const idx = table.columns.findIndex((c) => c.key === columnKey);
  if (idx === -1) throw ApiError.notFound(`Column "${columnKey}" not found`);

  const current = table.columns[idx]!;
  table.columns[idx] = {
    ...current,
    ...partial.data,
    key: current.key, // never mutate key via update — that would require row migration
  };
  await table.save();

  res.json({ success: true, data: table });
}

export async function deleteColumn(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId, columnKey } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const table = await DataTable.findOne({ _id: tableId, workspaceId });
  if (!table) throw ApiError.notFound('Table not found');

  const before = table.columns.length;
  table.columns = table.columns.filter((c) => c.key !== columnKey);
  if (table.columns.length === before) throw ApiError.notFound(`Column "${columnKey}" not found`);
  await table.save();

  // Purge the column's cells from every row. $unset on a Map field takes
  // dotted-path — we scope by tableId so other tables' rows aren't touched.
  await DataTableRow.updateMany(
    { tableId: table._id },
    { $unset: { [`cells.${columnKey}`]: '' } },
  );

  res.json({ success: true, data: table });
}

// ── Rows ────────────────────────────────────────────────────────────

export async function listRows(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query['limit'] ?? '50'), 10) || 50));
  const includeHidden = req.query['includeHidden'] === 'true';

  // Verify table exists + scope.
  const exists = await DataTable.exists({ _id: tableId, workspaceId });
  if (!exists) throw ApiError.notFound('Table not found');

  // Default query excludes hidden rows. `hidden: {$ne: true}` correctly
  // includes rows with no `hidden` field at all (pre-existing data).
  const filter: Record<string, unknown> = { tableId: new mongoose.Types.ObjectId(tableId!) };
  if (!includeHidden) filter['hidden'] = { $ne: true };

  // hiddenCount is surfaced in the response so the "Show hidden" toggle
  // can show a count badge without a second request.
  const hiddenFilter = { tableId: new mongoose.Types.ObjectId(tableId!), hidden: true };

  const [rows, total, hiddenCount] = await Promise.all([
    DataTableRow.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    DataTableRow.countDocuments(filter),
    includeHidden ? Promise.resolve(0) : DataTableRow.countDocuments(hiddenFilter),
  ]);
  res.json({ success: true, data: { data: rows, total, page, limit, hiddenCount } });
}

export async function addRow(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const parsed = AddRowInputSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid payload');

  const table = await DataTable.findOne({ _id: tableId, workspaceId });
  if (!table) throw ApiError.notFound('Table not found');

  const result = await bulkAddRows({
    table,
    workspaceId: workspaceId!,
    rows: [parsed.data],
    filledBy: 'manual',
  });

  if (result.inserted === 0 && result.duplicates > 0) {
    throw ApiError.conflict(`Row with primaryKey "${parsed.data.primaryKey}" already exists`);
  }

  const row = await DataTableRow.findOne({
    tableId: table._id,
    primaryKey: parsed.data.primaryKey,
  });
  res.status(201).json({ success: true, data: row });
}

export async function addRowsBulk(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const parsed = AddRowsBulkInputSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid payload');

  const table = await DataTable.findOne({ _id: tableId, workspaceId });
  if (!table) throw ApiError.notFound('Table not found');

  const result = await bulkAddRows({
    table,
    workspaceId: workspaceId!,
    rows: parsed.data.rows,
    filledBy: 'manual',
  });

  res.status(201).json({ success: true, data: result });
}

export async function updateRow(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId, rowId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!) || !mongoose.Types.ObjectId.isValid(rowId!)) {
    throw ApiError.badRequest('Invalid id');
  }

  const parsed = UpdateRowInputSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid payload');

  const table = await DataTable.findOne({ _id: tableId, workspaceId });
  if (!table) throw ApiError.notFound('Table not found');

  const setOps: Record<string, unknown> = {};
  const unsetOps: Record<string, unknown> = {};

  if (parsed.data.cells) {
    assertCellKeysKnown(table, parsed.data.cells);
    const wrapped = wrapCells(parsed.data.cells, 'manual');
    for (const [key, cell] of Object.entries(wrapped)) {
      if (cell === null || (cell as { value?: unknown }).value === null) {
        unsetOps[`cells.${key}`] = '';
      } else {
        setOps[`cells.${key}`] = cell;
      }
    }
  }

  if (parsed.data.hidden !== undefined) {
    setOps['hidden'] = parsed.data.hidden;
  }

  const update: Record<string, unknown> = {};
  if (Object.keys(setOps).length > 0) update['$set'] = setOps;
  if (Object.keys(unsetOps).length > 0) update['$unset'] = unsetOps;

  const row = await DataTableRow.findOneAndUpdate(
    { _id: rowId, tableId: table._id },
    update,
    { new: true },
  );
  if (!row) throw ApiError.notFound('Row not found');

  res.json({ success: true, data: row });
}

/**
 * Bulk row action — hide / unhide / delete N rows. Used by the grid's
 * selection action bar. Atomic per-action (one updateMany / deleteMany
 * call), returns affected count.
 */
export async function bulkRowAction(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const body = req.body as { rowIds?: string[]; action?: string };
  if (!Array.isArray(body.rowIds) || body.rowIds.length === 0) {
    throw ApiError.badRequest('rowIds must be a non-empty array');
  }
  if (!body.action || !['hide', 'unhide', 'delete'].includes(body.action)) {
    throw ApiError.badRequest('action must be hide | unhide | delete');
  }

  const invalidIds = body.rowIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) throw ApiError.badRequest(`Invalid row ids: ${invalidIds.length}`);

  const table = await DataTable.findOne({ _id: tableId, workspaceId });
  if (!table) throw ApiError.notFound('Table not found');

  const rowObjectIds = body.rowIds.map((id) => new mongoose.Types.ObjectId(id));
  const scope = { tableId: table._id, _id: { $in: rowObjectIds } };

  if (body.action === 'delete') {
    const result = await DataTableRow.deleteMany(scope);
    // Keep rowCount accurate — subtract affected.
    if (result.deletedCount && result.deletedCount > 0) {
      await DataTable.updateOne(
        { _id: table._id, rowCount: { $gte: result.deletedCount } },
        { $inc: { rowCount: -result.deletedCount } },
      );
    }
    res.json({ success: true, data: { action: 'delete', affected: result.deletedCount ?? 0 } });
    return;
  }

  const result = await DataTableRow.updateMany(
    scope,
    { $set: { hidden: body.action === 'hide' } },
  );
  res.json({
    success: true,
    data: { action: body.action, affected: result.modifiedCount ?? 0 },
  });
}

export async function deleteRow(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId, rowId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!) || !mongoose.Types.ObjectId.isValid(rowId!)) {
    throw ApiError.badRequest('Invalid id');
  }
  const table = await DataTable.findOne({ _id: tableId, workspaceId });
  if (!table) throw ApiError.notFound('Table not found');

  const row = await DataTableRow.findOneAndDelete({ _id: rowId, tableId: table._id });
  if (!row) throw ApiError.notFound('Row not found');

  await DataTable.updateOne({ _id: table._id, rowCount: { $gt: 0 } }, { $inc: { rowCount: -1 } });
  res.json({ success: true });
}

// ── Project table → File (audience source for campaigns) ──────────

/**
 * Create a campaign-ready `File` from a table's rows.
 *
 * Each row with a `leadId` becomes a member of the new file. Rows
 * without `leadId` (manually-entered rows that don't trace back to the
 * workspace's Leads collection) are skipped, since Campaigns dispatch
 * to Leads, not to raw cell values.
 *
 * This closes the Clay-parity loop — Tables become usable as campaign
 * audiences without copy-paste.
 */
export async function projectTableToFile(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { workspaceId, tableId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const body = req.body as { name?: unknown; description?: unknown };
  const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!rawName) throw ApiError.badRequest('name is required');
  if (rawName.length > 200) throw ApiError.badRequest('name must be 200 characters or fewer');
  const description = typeof body?.description === 'string' ? body.description.trim() : undefined;

  const table = await DataTable.findOne({ _id: tableId, workspaceId });
  if (!table) throw ApiError.notFound('Table not found');

  // Pull all non-hidden rows with a leadId. We don't paginate — a campaign
  // audience is a bounded set and 10k-ish rows from one table is the
  // upper bound for any realistic workflow. Project only the field we
  // need to keep this cheap.
  const rows = await DataTableRow.find(
    {
      tableId: table._id,
      hidden: { $ne: true },
      leadId: { $exists: true, $ne: null },
    },
    { leadId: 1 },
  ).lean();

  // Dedupe — same Lead might have been added twice manually.
  const leadIdSet = new Set<string>();
  for (const r of rows) {
    if (r.leadId) leadIdSet.add(String(r.leadId));
  }

  if (leadIdSet.size === 0) {
    throw ApiError.badRequest(
      'Table has no rows linked to leads. Seed the table from a dispatch first, or use the files page to curate a file manually.',
    );
  }

  // Dynamic import avoids a static ordering dependency (this controller
  // is pulled by several routers at module-load time).
  const { default: File } = await import('../models/File.js');
  const file = await File.create({
    workspaceId: workspaceId!,
    createdBy: req.user._id,
    name: rawName,
    ...(description ? { description } : {}),
    source: 'manual',
    leadIds: Array.from(leadIdSet).map((id) => new mongoose.Types.ObjectId(id)),
  });

  logAudit({
    req,
    workspaceId: workspaceId!,
    action: 'data_table.project_to_file',
    resourceType: 'campaign',
    resourceId: file._id,
    metadata: { tableId: String(table._id), leadCount: leadIdSet.size },
  });

  res.status(201).json({
    success: true,
    data: {
      fileId: String(file._id),
      name: file.name,
      leadCount: leadIdSet.size,
    },
  });
}

// ── Seed from job ──────────────────────────────────────────────────

export async function seedFromJob(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const body = req.body as { jobId?: string; limit?: number };
  if (!body?.jobId || !mongoose.Types.ObjectId.isValid(body.jobId)) {
    throw ApiError.badRequest('jobId required');
  }

  const table = await DataTable.findOne({ _id: tableId, workspaceId });
  if (!table) throw ApiError.notFound('Table not found');

  const result = await seedTableFromJob({
    table,
    workspaceId: workspaceId!,
    jobId: body.jobId,
    ...(typeof body.limit === 'number' ? { limit: body.limit } : {}),
  });

  logAudit({
    req,
    workspaceId: workspaceId!,
    action: 'data_table.seed_from_job',
    resourceType: 'campaign',
    resourceId: table._id,
    metadata: { jobId: body.jobId, ...result },
  });

  res.json({ success: true, data: result });
}

// ── Column enrichment (Phase 15D) ──────────────────────────────────

/**
 * Dry-run — how many rows would get enriched? Returns counts + cost
 * estimate. Non-destructive; safe to call repeatedly to preview.
 */
export async function estimateEnrichColumn(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId, columnKey } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const body = req.body as { skipExisting?: boolean; rowIds?: string[] };
  const result = await estimateEnrichment({
    workspaceId: workspaceId!,
    tableId: tableId!,
    columnKey: columnKey!,
    skipExisting: body?.skipExisting ?? true,
    ...(Array.isArray(body?.rowIds) ? { rowIds: body.rowIds } : {}),
  });

  res.json({ success: true, data: result });
}

/**
 * Kick off enrichment — enqueues one BullMQ job per eligible row.
 * Responds immediately with the run id + counts; progress lives on
 * the invocation log.
 */
export async function runEnrichColumn(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { workspaceId, tableId, columnKey } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const body = req.body as { skipExisting?: boolean; rowIds?: string[] };
  const result = await dispatchEnrichment({
    workspaceId: workspaceId!,
    tableId: tableId!,
    columnKey: columnKey!,
    skipExisting: body?.skipExisting ?? true,
    ...(Array.isArray(body?.rowIds) ? { rowIds: body.rowIds } : {}),
  });

  logAudit({
    req,
    workspaceId: workspaceId!,
    action: 'data_table.column_enrich',
    resourceType: 'campaign',
    resourceId: new mongoose.Types.ObjectId(tableId!),
    metadata: { columnKey, ...result },
  });

  res.status(202).json({ success: true, data: result });
}

/**
 * Run enrichment on a single row synchronously. Used by UI "re-enrich
 * this one cell" action — gives immediate feedback without waiting on
 * the BullMQ roundtrip.
 */
export async function enrichSingleRow(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId, columnKey, rowId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!) || !mongoose.Types.ObjectId.isValid(rowId!)) {
    throw ApiError.badRequest('Invalid id');
  }

  const result = await enrichOne({
    workspaceId: workspaceId!,
    tableId: tableId!,
    rowId: rowId!,
    columnKey: columnKey!,
  });

  res.json({ success: true, data: result });
}

// ── Actions ──────────────────────────────────────────────────────

/**
 * List actions available for this workspace + table. Each entry is
 * annotated with availability (credential gating) so the UI can show
 * locked actions alongside unlocked ones.
 */
export async function listActions(req: Request, res: Response): Promise<void> {
  const { workspaceId, tableId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const table = await DataTable.findOne({ _id: tableId, workspaceId }).select('rowType').lean();
  if (!table) throw ApiError.notFound('Table not found');

  const entries = await listActionsForWorkspace({
    workspaceId: workspaceId!,
    rowType: table.rowType as Parameters<typeof listActionsForWorkspace>[0]['rowType'],
  });

  res.json({ success: true, data: entries });
}

/**
 * One-shot: create/update the output column + dispatch enrichment.
 * Body matches RunActionInput (see services/data-tables/actions.ts).
 */
export async function runActionHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { workspaceId, tableId, actionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId!)) throw ApiError.badRequest('Invalid tableId');

  const body = req.body as RunActionInput;
  if (!body?.outputColumn?.key || typeof body.outputColumn.key !== 'string') {
    throw ApiError.badRequest('outputColumn.key is required');
  }
  if (!body.inputMappings || typeof body.inputMappings !== 'object') {
    throw ApiError.badRequest('inputMappings is required');
  }

  const result = await runAction({
    workspaceId: workspaceId!,
    tableId: tableId!,
    actionId: actionId!,
    input: body,
  });

  logAudit({
    req,
    workspaceId: workspaceId!,
    action: 'data_table.run_action',
    resourceType: 'campaign',
    resourceId: new mongoose.Types.ObjectId(tableId!),
    metadata: {
      actionId,
      columnKey: result.columnKey,
      jobsEnqueued: result.jobsEnqueued,
      enrichmentRunId: result.enrichmentRunId,
    },
  });

  res.status(202).json({ success: true, data: result });
}
