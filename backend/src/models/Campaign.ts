import mongoose, { Schema } from 'mongoose';
import { OUTREACH_CHANNELS } from '@leadreai/shared';

export interface ICampaign extends mongoose.Document {
  workspaceId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  leadIds: mongoose.Types.ObjectId[];
  outreachConfig: {
    channel: (typeof OUTREACH_CHANNELS)[number];
    tone: string;
    language: string;
    personalization: string[];
    systemPromptOverride?: string;
  };
  stats: {
    totalLeads: number;
    draftsCreated: number;
    sent: number;
    opened: number;
    replied: number;
    bounced: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<ICampaign>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 1000 },
    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'completed', 'archived'],
      default: 'draft',
    },
    leadIds: [{ type: Schema.Types.ObjectId, ref: 'Lead', default: [] }],
    outreachConfig: {
      channel: { type: String, enum: OUTREACH_CHANNELS },
      tone: { type: String, required: true },
      language: { type: String, default: 'English' },
      personalization: { type: [String], default: [] },
      systemPromptOverride: { type: String },
    },
    stats: {
      totalLeads: { type: Number, default: 0 },
      draftsCreated: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      replied: { type: Number, default: 0 },
      bounced: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export default mongoose.model<ICampaign>('Campaign', campaignSchema);
