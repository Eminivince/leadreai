import type { Request, Response, NextFunction } from 'express';
import Workspace from '../models/Workspace.js';
import { ApiError } from '../utils/ApiError.js';

type WorkspaceRole = 'owner' | 'admin' | 'member';

export function authorize(requiredRoles: WorkspaceRole[] = ['owner', 'admin', 'member']) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { workspaceId } = req.params;
      if (!workspaceId) {
        throw ApiError.badRequest('workspaceId param required');
      }
      if (!req.user) {
        throw ApiError.unauthorized();
      }

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        throw ApiError.notFound('Workspace not found');
      }

      const member = workspace.members.find(
        (m) => m.userId.toString() === req.user!._id.toString()
      );
      const isOwner = workspace.ownerId.toString() === req.user!._id.toString();

      const userRole: WorkspaceRole | undefined = isOwner
        ? 'owner'
        : (member?.role as WorkspaceRole | undefined);

      if (!userRole || !requiredRoles.includes(userRole)) {
        throw ApiError.forbidden('Insufficient workspace permissions');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
