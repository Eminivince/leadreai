import { OUTREACH_CHANNELS } from '../utils/constants.js';
import type { KnowledgeBaseEntryType } from '../utils/constants.js';

export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export interface KnowledgeBaseEntry {
  _id: string;
  title: string;
  content: string;
  type: KnowledgeBaseEntryType;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachDraft {
  _id: string;
  workspaceId: string;
  campaignId: string;
  leadId: string;
  createdBy: string;
  channel: OutreachChannel;
  deliveryMetadata?: { provider?: string; messageId?: string; threadId?: string; };
  firstLine?: string;
  subject?: string;
  body: string;
  tone: string;
  language: string;
  version: number;
  status: 'draft' | 'approved' | 'sent' | 'failed';
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachConfig {
  channel: OutreachChannel;
  tone: string;
  language: string;
  personalization: string[];
  systemPromptOverride?: string;
}

export interface CampaignStats {
  totalLeads: number;
  draftsCreated: number;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
}

export interface Campaign {
  _id: string;
  workspaceId: string;
  createdBy: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  leadIds: string[];
  outreachConfig: OutreachConfig;
  stats: CampaignStats;
  createdAt: string;
  updatedAt: string;
}
