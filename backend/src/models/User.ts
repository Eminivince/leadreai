import mongoose, { Schema } from 'mongoose';
import { PLAN_TIERS, WORKSPACE_ROLES } from '@leadreai/shared';

export interface IUser extends mongoose.Document {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  plan: (typeof PLAN_TIERS)[number];
  planExpiresAt?: Date;
  creditsBalance: number;
  workspaces: Array<{
    workspaceId: mongoose.Types.ObjectId;
    role: (typeof WORKSPACE_ROLES)[number];
  }>;
  isEmailVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
    avatarUrl: { type: String },
    plan: { type: String, enum: PLAN_TIERS, default: 'free' },
    planExpiresAt: { type: Date },
    creditsBalance: { type: Number, default: 0, min: 0 },
    workspaces: [
      {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace' },
        role: { type: String, enum: WORKSPACE_ROLES },
      },
    ],
    isEmailVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ 'workspaces.workspaceId': 1 });

export default mongoose.model<IUser>('User', userSchema);
