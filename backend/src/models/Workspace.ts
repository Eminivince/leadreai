import mongoose, { Schema } from 'mongoose';
import { WORKSPACE_ROLES, KNOWLEDGE_BASE_ENTRY_TYPES, KnowledgeBaseEntryType } from '@leadreai/shared';

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
    cheapMode: boolean;
    webhookUrl?: string;
  };
  knowledgeBase: Array<{
    _id: mongoose.Types.ObjectId;
    title: string;
    content: string;
    type: KnowledgeBaseEntryType;
    createdAt: Date;
    updatedAt: Date;
  }>;
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
      cheapMode: { type: Boolean, default: false },
      webhookUrl: { type: String },
    },
    knowledgeBase: [
      {
        title: { type: String, required: true, trim: true, maxlength: 200 },
        content: { type: String, required: true, maxlength: 2000 },
        type: {
          type: String,
          enum: KNOWLEDGE_BASE_ENTRY_TYPES,
          default: 'other',
        },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
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
