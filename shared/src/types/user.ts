import { PLAN_TIERS, WORKSPACE_ROLES } from '../utils/constants.js';

export type PlanTier = (typeof PLAN_TIERS)[number];
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export interface WorkspaceMember {
  workspaceId: string;
  role: WorkspaceRole;
}

export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  plan: PlanTier;
  planExpiresAt?: string;
  creditsBalance: number;
  workspaces: WorkspaceMember[];
  isEmailVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSettings {
  defaultExportFormat: 'csv' | 'xlsx';
  notifyOnJobComplete: boolean;
  webhookUrl?: string;
}

export interface WorkspaceUsageStats {
  totalJobsRun: number;
  totalLeadsFound: number;
  totalExports: number;
  creditsUsed: number;
}

export interface WorkspaceMemberDetail {
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
}

export interface Workspace {
  _id: string;
  name: string;
  slug: string;
  ownerId: string;
  members: WorkspaceMemberDetail[];
  settings: WorkspaceSettings;
  usageStats: WorkspaceUsageStats;
  createdAt: string;
  updatedAt: string;
}
