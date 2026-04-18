import { OUTREACH_CHANNELS } from '../utils/constants.js';

export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

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
