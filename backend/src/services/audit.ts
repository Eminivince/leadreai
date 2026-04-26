import type { Request } from 'express';
import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

type ResourceType = 'job' | 'lead' | 'campaign' | 'outreach_draft' | 'contact' | 'workspace' | 'sequence';

interface AuditOptions {
  req: Request;
  workspaceId: string;
  action: string;
  resourceType: ResourceType;
  resourceId: string | mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

/**
 * Fire-and-forget audit log writer. Never throws — a write failure must not
 * break the surrounding request.
 */
export function logAudit(opts: AuditOptions): void {
  const userId = opts.req.user?._id;
  if (!userId) return; // unauthenticated path — skip

  AuditLog.create({
    workspaceId: new mongoose.Types.ObjectId(opts.workspaceId),
    userId,
    action: opts.action,
    resourceType: opts.resourceType,
    resourceId: new mongoose.Types.ObjectId(opts.resourceId.toString()),
    metadata: opts.metadata,
    ipAddress: opts.req.ip,
    userAgent: opts.req.headers['user-agent'],
    durationMs: opts.durationMs,
  }).catch((err: unknown) => {
    logger.warn('[audit] Failed to write audit log', {
      action: opts.action,
      err: err instanceof Error ? err.message : String(err),
    });
  });
}
