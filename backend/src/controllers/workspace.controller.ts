import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Workspace from '../models/Workspace.js';
import { ApiError } from '../utils/ApiError.js';
import { KNOWLEDGE_BASE_ENTRY_TYPES, type KnowledgeBaseEntryType } from '@leadreai/shared';

export async function listWorkspaces(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const workspaces = await Workspace.find({
    $or: [
      { ownerId: req.user._id },
      { 'members.userId': req.user._id },
    ],
  }).select('-settings.webhookUrl');
  res.json({ success: true, data: workspaces });
}

export async function getWorkspace(req: Request, res: Response): Promise<void> {
  const workspace = await Workspace.findById(req.params['workspaceId'])
    .select('-settings.webhookUrl -usageStats');
  if (!workspace) throw ApiError.notFound('Workspace not found');
  res.json({ success: true, data: workspace });
}

export async function createWorkspace(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { name } = req.body as { name: string };
  if (!name?.trim()) throw ApiError.badRequest('name is required');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + randomBytes(4).toString('hex');
  try {
    const workspace = await Workspace.create({
      name: name.trim(),
      slug,
      ownerId: req.user._id,
      members: [{ userId: req.user._id, role: 'owner', joinedAt: new Date() }],
    });
    res.status(201).json({ success: true, data: workspace });
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: number }).code === 11000) {
      throw ApiError.conflict('Workspace name already in use');
    }
    throw err;
  }
}

export async function updateWorkspace(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const body = req.body as {
    name?: string;
    description?: string;
    settings?: {
      cheapMode?: boolean;
      defaultExportFormat?: 'csv' | 'xlsx';
      notifyOnJobComplete?: boolean;
    };
  };

  const setFields: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw ApiError.badRequest('name must be a non-empty string');
    }
    setFields['name'] = body.name.trim();
  }

  if (body.description !== undefined) {
    setFields['description'] = body.description;
  }

  if (body.settings !== undefined) {
    const { cheapMode, defaultExportFormat, notifyOnJobComplete } = body.settings;

    if (cheapMode !== undefined) {
      if (typeof cheapMode !== 'boolean') {
        throw ApiError.badRequest('settings.cheapMode must be a boolean');
      }
      setFields['settings.cheapMode'] = cheapMode;
    }

    if (defaultExportFormat !== undefined) {
      if (!['csv', 'xlsx'].includes(defaultExportFormat)) {
        throw ApiError.badRequest('settings.defaultExportFormat must be "csv" or "xlsx"');
      }
      setFields['settings.defaultExportFormat'] = defaultExportFormat;
    }

    if (notifyOnJobComplete !== undefined) {
      if (typeof notifyOnJobComplete !== 'boolean') {
        throw ApiError.badRequest('settings.notifyOnJobComplete must be a boolean');
      }
      setFields['settings.notifyOnJobComplete'] = notifyOnJobComplete;
    }
  }

  if (Object.keys(setFields).length === 0) {
    throw ApiError.badRequest('No valid fields to update');
  }

  const workspace = await Workspace.findByIdAndUpdate(
    workspaceId,
    { $set: setFields },
    { new: true, runValidators: true }
  ).select('-settings.webhookUrl -usageStats');

  if (!workspace) throw ApiError.notFound('Workspace not found');

  res.json({ success: true, data: workspace });
}

export async function deleteWorkspace(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented' } });
}

export async function listKnowledgeBase(req: Request, res: Response): Promise<void> {
  const workspace = await Workspace.findById(req.params['workspaceId'])
    .select('knowledgeBase');
  if (!workspace) throw ApiError.notFound('Workspace not found');

  const entries = [...workspace.knowledgeBase].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  res.json({ success: true, data: entries });
}

export async function createKnowledgeBaseEntry(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const { title, content, type } = req.body as {
    title?: string;
    content?: string;
    type?: KnowledgeBaseEntryType;
  };

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw ApiError.badRequest('title is required');
  }
  if (title.trim().length > 200) {
    throw ApiError.badRequest('title must be 200 characters or fewer');
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    throw ApiError.badRequest('content is required');
  }
  if (content.length > 2000) {
    throw ApiError.badRequest('content must be 2000 characters or fewer');
  }
  if (!type || !(KNOWLEDGE_BASE_ENTRY_TYPES as readonly string[]).includes(type)) {
    throw ApiError.badRequest(
      `type must be one of: ${KNOWLEDGE_BASE_ENTRY_TYPES.join(', ')}`
    );
  }

  const now = new Date();
  const newEntry = {
    title: title.trim(),
    content,
    type,
    createdAt: now,
    updatedAt: now,
  };

  // Atomic: only push if < 20 entries, preventing races
  const updated = await Workspace.findOneAndUpdate(
    { _id: workspaceId, $expr: { $lt: [{ $size: '$knowledgeBase' }, 20] } },
    { $push: { knowledgeBase: { $each: [newEntry], $position: 0 } } },
    { new: true, runValidators: true }
  ).select('knowledgeBase');

  if (!updated) {
    const exists = await Workspace.exists({ _id: workspaceId });
    if (!exists) throw ApiError.notFound('Workspace not found');
    throw ApiError.conflict('Knowledge base limit of 20 entries reached');
  }

  const created = updated.knowledgeBase[0];
  res.status(201).json({ success: true, data: created });
}

export async function updateKnowledgeBaseEntry(req: Request, res: Response): Promise<void> {
  const { workspaceId, entryId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(entryId!)) throw ApiError.badRequest('Invalid entryId');
  const { title, content, type } = req.body as {
    title?: string;
    content?: string;
    type?: KnowledgeBaseEntryType;
  };

  const setFields: Record<string, unknown> = {};

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      throw ApiError.badRequest('title must be a non-empty string');
    }
    if (title.trim().length > 200) {
      throw ApiError.badRequest('title must be 200 characters or fewer');
    }
    setFields['knowledgeBase.$[elem].title'] = title.trim();
  }

  if (content !== undefined) {
    if (typeof content !== 'string' || !content.trim()) {
      throw ApiError.badRequest('content must be a non-empty string');
    }
    if (content.length > 2000) {
      throw ApiError.badRequest('content must be 2000 characters or fewer');
    }
    setFields['knowledgeBase.$[elem].content'] = content;
  }

  if (type !== undefined) {
    if (!(KNOWLEDGE_BASE_ENTRY_TYPES as readonly string[]).includes(type)) {
      throw ApiError.badRequest(
        `type must be one of: ${KNOWLEDGE_BASE_ENTRY_TYPES.join(', ')}`
      );
    }
    setFields['knowledgeBase.$[elem].type'] = type;
  }

  if (Object.keys(setFields).length === 0) {
    throw ApiError.badRequest('No valid fields to update');
  }

  setFields['knowledgeBase.$[elem].updatedAt'] = new Date();

  const updated = await Workspace.findByIdAndUpdate(
    workspaceId,
    { $set: setFields },
    {
      new: true,
      arrayFilters: [{ 'elem._id': new mongoose.Types.ObjectId(entryId) }],
      runValidators: true,
    }
  ).select('knowledgeBase');

  if (!updated) throw ApiError.notFound('Workspace not found');

  const updatedEntry = updated.knowledgeBase.find(
    (e) => e._id.toString() === entryId
  );
  if (!updatedEntry) throw ApiError.notFound('Knowledge base entry not found');

  res.json({ success: true, data: updatedEntry });
}

export async function deleteKnowledgeBaseEntry(req: Request, res: Response): Promise<void> {
  const { workspaceId, entryId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(entryId!)) throw ApiError.badRequest('Invalid entryId');

  const result = await Workspace.updateOne(
    { _id: workspaceId },
    { $pull: { knowledgeBase: { _id: new mongoose.Types.ObjectId(entryId) } } }
  );

  if (result.matchedCount === 0) throw ApiError.notFound('Workspace not found');
  if (result.modifiedCount === 0) throw ApiError.notFound('Knowledge base entry not found');

  res.json({ success: true });
}
