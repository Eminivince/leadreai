import mongoose, { Schema } from 'mongoose';

export interface IAuditLog extends mongoose.Document {
  workspaceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  action: string;
  resourceType: 'job' | 'lead' | 'campaign' | 'outreach_draft';
  resourceId: mongoose.Types.ObjectId;
  metadata?: unknown;
  ipAddress?: string;
  userAgent?: string;
  durationMs?: number;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, index: true },
    resourceType: {
      type: String,
      enum: ['job', 'lead', 'campaign', 'outreach_draft'],
      required: true,
    },
    resourceId: { type: Schema.Types.ObjectId, required: true },
    metadata: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    durationMs: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export default mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
