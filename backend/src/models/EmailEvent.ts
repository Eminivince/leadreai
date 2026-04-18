import mongoose, { Schema } from 'mongoose';
import { EMAIL_EVENT_TYPES, EMAIL_PROVIDERS, type EmailEventType, type EmailProvider } from '@leadreai/shared';

export interface IEmailEventDoc extends mongoose.Document {
  workspaceId: mongoose.Types.ObjectId;
  enrollmentId?: mongoose.Types.ObjectId;
  messageId: string;
  event: EmailEventType;
  provider: EmailProvider;
  bounceType?: 'hard' | 'soft';
  raw: Record<string, unknown>;
  occurredAt: Date;
  processedAt: Date;
}

const emailEventSchema = new Schema<IEmailEventDoc>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'SequenceEnrollment' },
    messageId: { type: String, required: true },
    event: { type: String, enum: EMAIL_EVENT_TYPES, required: true },
    provider: { type: String, enum: EMAIL_PROVIDERS, required: true },
    bounceType: { type: String, enum: ['hard', 'soft'] },
    raw: { type: Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

emailEventSchema.index({ messageId: 1 });
emailEventSchema.index({ enrollmentId: 1 });
emailEventSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

export default mongoose.model<IEmailEventDoc>('EmailEvent', emailEventSchema);
