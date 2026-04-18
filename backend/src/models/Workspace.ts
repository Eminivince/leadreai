import mongoose, { Schema } from 'mongoose';
import { WORKSPACE_ROLES, KNOWLEDGE_BASE_ENTRY_TYPES, KnowledgeBaseEntryType } from '@leadreai/shared';

export type EmailProvider = 'smtp' | 'resend' | 'sendgrid';

export interface IEmailConfig {
  provider: EmailProvider;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  // API-key providers (resend, sendgrid) — stored encrypted
  apiKey?: string;
  // SMTP
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string; // stored encrypted
  verifiedAt?: Date;
}

export interface IWorkspace extends mongoose.Document {
  name: string;
  slug: string;
  ownerId: mongoose.Types.ObjectId;
  members: Array<{
    userId: mongoose.Types.ObjectId;
    role: (typeof WORKSPACE_ROLES)[number];
    joinedAt: Date;
  }>;
  emailConfig?: IEmailConfig;
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
  apiKeys: Array<{
    _id: mongoose.Types.ObjectId;
    name: string;
    keyHash: string;
    prefix: string;
    createdAt: Date;
    lastUsedAt?: Date;
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
    emailConfig: {
      provider: { type: String, enum: ['smtp', 'resend', 'sendgrid'] },
      fromEmail: { type: String },
      fromName: { type: String },
      replyTo: { type: String },
      apiKey: { type: String, select: false },      // encrypted
      smtpHost: { type: String },
      smtpPort: { type: Number },
      smtpSecure: { type: Boolean },
      smtpUser: { type: String },
      smtpPass: { type: String, select: false },    // encrypted
      verifiedAt: { type: Date },
    },
    settings: {
      defaultExportFormat: { type: String, enum: ['csv', 'xlsx'], default: 'csv' },
      notifyOnJobComplete: { type: Boolean, default: true },
      cheapMode: { type: Boolean, default: false },
      webhookUrl: { type: String },
    },
    knowledgeBase: {
      type: [
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
      default: [],
    },
    apiKeys: {
      type: [
        {
          name: { type: String, required: true, maxlength: 100 },
          keyHash: { type: String, required: true, select: false },
          prefix: { type: String, required: true },
          createdAt: { type: Date, default: Date.now },
          lastUsedAt: { type: Date },
        },
      ],
      default: [],
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
