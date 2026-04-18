import mongoose, { Schema } from 'mongoose';
import {
  LEAD_EMAIL_TYPES,
  PHONE_TYPES,
  OUTREACH_STATUSES,
  SOURCE_TYPES,
} from '@leadreai/shared';

export interface ILead extends mongoose.Document {
  workspaceId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  companyName: string;
  companyDomain?: string;
  companyType?: string;
  industry?: string;
  subIndustry?: string;
  description?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    fullText?: string;
  };
  emails: Array<{
    address: string;
    type: (typeof LEAD_EMAIL_TYPES)[number];
    confidence: number;
    verified: boolean;
    verifiedAt?: Date;
    source: string;
  }>;
  phones: Array<{
    raw: string;
    normalized?: string;
    type?: (typeof PHONE_TYPES)[number];
    countryCode?: string;
    source: string;
  }>;
  socialProfiles?: {
    linkedinUrl?: string;
    twitterUrl?: string;
    facebookUrl?: string;
    instagramUrl?: string;
  };
  website?: string;
  osint?: Record<string, unknown>;
  sources: Array<{
    url: string;
    type: (typeof SOURCE_TYPES)[number];
    scrapedAt: Date;
    confidence: number;
  }>;
  rawSnippets: string[];
  rankScore: number;
  completenessScore: number;
  isVerified: boolean;
  isDuplicate: boolean;
  mergedIntoId?: mongoose.Types.ObjectId;
  outreachStatus: (typeof OUTREACH_STATUSES)[number];
  tags: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const leadSchema = new Schema<ILead>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'ProspectingJob', required: true },
    companyName: { type: String, required: true, trim: true },
    companyDomain: { type: String, lowercase: true, trim: true },
    companyType: { type: String },
    industry: { type: String },
    subIndustry: { type: String },
    description: { type: String },
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      country: { type: String },
      postcode: { type: String },
      fullText: { type: String },
    },
    emails: [
      {
        address: { type: String, required: true },
        type: { type: String, enum: LEAD_EMAIL_TYPES },
        confidence: { type: Number, min: 0, max: 1, default: 0.5 },
        verified: { type: Boolean, default: false },
        verifiedAt: { type: Date },
        source: { type: String, required: true },
      },
    ],
    phones: [
      {
        raw: { type: String, required: true },
        normalized: { type: String },
        type: { type: String, enum: PHONE_TYPES },
        countryCode: { type: String },
        source: { type: String, required: true },
      },
    ],
    socialProfiles: {
      linkedinUrl: { type: String },
      twitterUrl: { type: String },
      facebookUrl: { type: String },
      instagramUrl: { type: String },
    },
    website: { type: String },
    osint: { type: Schema.Types.Mixed },
    sources: [
      {
        url: { type: String, required: true },
        type: { type: String, enum: SOURCE_TYPES },
        scrapedAt: { type: Date, default: Date.now },
        confidence: { type: Number, min: 0, max: 1, default: 0.5 },
      },
    ],
    rawSnippets: { type: [String], default: [] },
    rankScore: { type: Number, default: 0, min: 0, max: 100 },
    completenessScore: { type: Number, default: 0, min: 0, max: 100 },
    isVerified: { type: Boolean, default: false },
    isDuplicate: { type: Boolean, default: false },
    mergedIntoId: { type: Schema.Types.ObjectId, ref: 'Lead' },
    outreachStatus: { type: String, enum: OUTREACH_STATUSES, default: 'not_contacted' },
    tags: { type: [String], default: [] },
    notes: { type: String, maxlength: 5000 },
  },
  { timestamps: true }
);

leadSchema.index({ workspaceId: 1 });
leadSchema.index({ jobId: 1 });
leadSchema.index({ companyDomain: 1 });
leadSchema.index({ rankScore: -1 });
leadSchema.index({ industry: 1 });
leadSchema.index({ 'address.country': 1 });
leadSchema.index({ companyName: 'text', description: 'text' });
leadSchema.index({ workspaceId: 1, companyDomain: 1 }, { unique: true, sparse: true });
leadSchema.index({ workspaceId: 1, isDuplicate: 1, rankScore: -1 });

export default mongoose.model<ILead>('Lead', leadSchema);
