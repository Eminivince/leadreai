import mongoose, { Schema } from 'mongoose';
import { WORKSPACE_ROLES } from '@leadreai/shared';

export interface IWorkspace extends mongoose.Document {
  name: string;
  slug: string;
  ownerId: mongoose.Types.ObjectId;
  members: Array<{
    userId: mongoose.Types.ObjectId;
    role: (typeof WORKSPACE_ROLES)[number];
    joinedAt: Date;
  }>;
  settings: {
    defaultExportFormat: 'csv' | 'xlsx';
    notifyOnJobComplete: boolean;
    webhookUrl?: string;
  };
  usageStats: {
    totalJobsRun: number;
    totalLeadsFound: number;
    totalExports: number;
    creditsUsed: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const workspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        role: { type: String, enum: WORKSPACE_ROLES },
        joinedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    settings: {
      defaultExportFormat: { type: String, enum: ['csv', 'xlsx'], default: 'csv' },
      notifyOnJobComplete: { type: Boolean, default: true },
      webhookUrl: { type: String },
    },
    usageStats: {
      totalJobsRun: { type: Number, default: 0 },
      totalLeadsFound: { type: Number, default: 0 },
      totalExports: { type: Number, default: 0 },
      creditsUsed: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

workspaceSchema.index({ ownerId: 1 });
workspaceSchema.index({ 'members.userId': 1 });

export default mongoose.model<IWorkspace>('Workspace', workspaceSchema);
