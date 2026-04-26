import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Workflow from '../models/Workflow.js';
import {
  CreateWorkflowSchema,
  CreateWorkflowFromTableSchema,
  UpdateWorkflowSchema,
  RunWorkflowSchema,
} from '@leadreai/shared';
import { createWorkflowFromTable, runWorkflow } from '../services/workflows.js';
import { ApiError } from '../utils/ApiError.js';
import { logAudit } from '../services/audit.js';

/**
 * Workflow controller — Phase 11 M1.
 *
 * Endpoints mirror the spec in `docs/2026-04-22-phase-11-workflows-plan.md`.
 * Run semantics live in `services/workflows.ts::runWorkflow` so the
 * controller stays thin — the interesting logic (guardrail, credits,
 * rollback) is testable without HTTP.
 */

// ── List + get ──────────────────────────────────────────────────────

export async function listWorkflows(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '50'), 10) || 50));

  const filter = { workspaceId: new mongoose.Types.ObjectId(workspaceId!) };
  const [workflows, total] = await Promise.all([
    Workflow.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Workflow.countDocuments(filter),
  ]);
  res.json({ success: true, data: { data: workflows, total, page, limit } });
}

export async function getWorkflow(req: Request, res: Response): Promise<void> {
  const { workspaceId, workflowId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(workflowId!)) throw ApiError.badRequest('Invalid workflowId');
  const workflow = await Workflow.findOne({ _id: workflowId, workspaceId });
  if (!workflow) throw ApiError.notFound('Workflow not found');
  res.json({ success: true, data: workflow });
}

// ── Create ──────────────────────────────────────────────────────────

export async function createWorkflow(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { workspaceId } = req.params;

  const parsed = CreateWorkflowSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid payload');
  }

  // Column-key uniqueness mirrors DataTable.createTable's rule.
  const keys = new Set<string>();
  for (const c of parsed.data.tableTemplate.columns) {
    if (keys.has(c.key)) throw ApiError.badRequest(`Duplicate column key: ${c.key}`);
    keys.add(c.key);
  }

  const workflow = await Workflow.create({
    workspaceId: workspaceId!,
    createdBy: req.user._id,
    name: parsed.data.name,
    description: parsed.data.description,
    tags: parsed.data.tags ?? [],
    tableTemplate: parsed.data.tableTemplate,
    ...(parsed.data.seed ? { seed: parsed.data.seed } : {}),
    origin: 'local',
  });

  logAudit({
    req,
    workspaceId: workspaceId!,
    action: 'workflow.create',
    resourceType: 'campaign',
    resourceId: workflow._id,
    metadata: { name: workflow.name, columnCount: parsed.data.tableTemplate.columns.length },
  });

  res.status(201).json({ success: true, data: workflow });
}

export async function createFromTable(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { workspaceId, tableId } = req.params;

  const parsed = CreateWorkflowFromTableSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid payload');
  }

  const workflow = await createWorkflowFromTable({
    workspaceId: workspaceId!,
    userId: String(req.user._id),
    tableId: tableId!,
    name: parsed.data.name,
    description: parsed.data.description,
    tags: parsed.data.tags,
    includeSeed: parsed.data.includeSeed,
    defaultTableNameTemplate: parsed.data.defaultTableNameTemplate,
  });

  logAudit({
    req,
    workspaceId: workspaceId!,
    action: 'workflow.create_from_table',
    resourceType: 'campaign',
    resourceId: workflow._id,
    metadata: { tableId, hasSeed: Boolean(workflow.seed) },
  });

  res.status(201).json({ success: true, data: workflow });
}

// ── Update + delete ─────────────────────────────────────────────────

export async function updateWorkflow(req: Request, res: Response): Promise<void> {
  const { workspaceId, workflowId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(workflowId!)) throw ApiError.badRequest('Invalid workflowId');

  const parsed = UpdateWorkflowSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid payload');
  }

  const setOps: Record<string, unknown> = {};
  const unsetOps: Record<string, unknown> = {};

  if (parsed.data.name !== undefined) setOps['name'] = parsed.data.name;
  if (parsed.data.description !== undefined) setOps['description'] = parsed.data.description;
  if (parsed.data.tags !== undefined) setOps['tags'] = parsed.data.tags;
  if (parsed.data.tableTemplate !== undefined) setOps['tableTemplate'] = parsed.data.tableTemplate;
  // `seed: null` clears the seed entirely; `seed: {...}` replaces it.
  if (parsed.data.seed === null) unsetOps['seed'] = '';
  else if (parsed.data.seed !== undefined) setOps['seed'] = parsed.data.seed;

  const update: Record<string, unknown> = {};
  if (Object.keys(setOps).length > 0) update['$set'] = setOps;
  if (Object.keys(unsetOps).length > 0) update['$unset'] = unsetOps;

  if (Object.keys(update).length === 0) {
    throw ApiError.badRequest('No updatable fields provided');
  }

  const workflow = await Workflow.findOneAndUpdate(
    { _id: workflowId, workspaceId },
    update,
    { new: true },
  );
  if (!workflow) throw ApiError.notFound('Workflow not found');

  res.json({ success: true, data: workflow });
}

export async function deleteWorkflow(req: Request, res: Response): Promise<void> {
  const { workspaceId, workflowId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(workflowId!)) throw ApiError.badRequest('Invalid workflowId');

  const result = await Workflow.deleteOne({ _id: workflowId, workspaceId });
  if (result.deletedCount === 0) throw ApiError.notFound('Workflow not found');

  logAudit({
    req,
    workspaceId: workspaceId!,
    action: 'workflow.delete',
    resourceType: 'campaign',
    resourceId: workflowId!,
  });

  res.json({ success: true, data: { deleted: true } });
}

// ── Run ─────────────────────────────────────────────────────────────

export async function runWorkflowHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { workspaceId, workflowId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(workflowId!)) throw ApiError.badRequest('Invalid workflowId');

  const parsed = RunWorkflowSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid payload');
  }

  const workflow = await Workflow.findOne({ _id: workflowId, workspaceId });
  if (!workflow) throw ApiError.notFound('Workflow not found');

  const result = await runWorkflow({
    workflow,
    workspaceId: workspaceId!,
    userId: String(req.user._id),
    input: parsed.data,
    reqForAudit: req,
  });

  logAudit({
    req,
    workspaceId: workspaceId!,
    action: 'workflow.run',
    resourceType: 'campaign',
    resourceId: workflow._id,
    metadata: {
      workflowName: workflow.name,
      tableId: result.tableId,
      jobId: result.jobId ?? null,
      dispatchedSeedJob: Boolean(result.jobId),
    },
  });

  res.status(201).json({ success: true, data: result });
}
