import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import Workspace from '../models/Workspace.js';
import { ApiError } from '../utils/ApiError.js';

export async function listWorkspaces(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented' } });
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

export async function updateWorkspace(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented' } });
}

export async function deleteWorkspace(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented' } });
}
