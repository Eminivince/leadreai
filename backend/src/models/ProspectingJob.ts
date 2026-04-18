import mongoose, { Schema } from 'mongoose';
import { JOB_STATUSES } from '@leadreai/shared';
import type { ParsedIntent } from '@leadreai/shared';

export interface IProspectingJob extends mongoose.Document {
  workspaceId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  rawQuery: string;
  parsedIntent?: ParsedIntent;
  status: (typeof JOB_STATUSES)[number];
  progress: {
    percentage: number;
    currentStage: string;
    stagesComplete: string[];
    leadsFoundSoFar: number;
  };
  result?: {
    totalLeadsFound: number;
    totalAfterDedup: number;
    dorkQueriesUsed: string[];
    sourcesScraped: string[];
    filesDownloaded: number;
    durationMs: number;
  };
  error?: {
    message: string;
    stack?: string;
    stage: string;
  };
  bullmqJobId?: string;
  creditsCharged: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const prospectingJobSchema = new Schema<IProspectingJob>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rawQuery: { type: String, required: true, maxlength: 500 },
    parsedIntent: { type: Schema.Types.Mixed },
    status: { type: String, enum: JOB_STATUSES, default: 'queued' },
    progress: {
      percentage: { type: Number, default: 0 },
      currentStage: { type: String, default: '' },
      stagesComplete: [{ type: String }],
      leadsFoundSoFar: { type: Number, default: 0 },
    },
    result: {
      totalLeadsFound: { type: Number },
      totalAfterDedup: { type: Number },
      dorkQueriesUsed: [{ type: String }],
      sourcesScraped: [{ type: String }],
      filesDownloaded: { type: Number },
      durationMs: { type: Number },
    },
    error: {
      message: { type: String },
      stack: { type: String },
      stage: { type: String },
    },
    bullmqJobId: { type: String },
    creditsCharged: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

prospectingJobSchema.index({ workspaceId: 1 });
prospectingJobSchema.index({ status: 1 });
prospectingJobSchema.index({ createdAt: -1 });
prospectingJobSchema.index({ workspaceId: 1, status: 1 });

export default mongoose.model<IProspectingJob>('ProspectingJob', prospectingJobSchema);
