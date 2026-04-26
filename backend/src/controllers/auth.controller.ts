import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import User, { type IUser } from '../models/User.js';
import Workspace from '../models/Workspace.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import type { RegisterInput, LoginInput } from '@leadreai/shared';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  path: '/api/v1/auth/refresh',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  sameSite: 'strict' as const,
  secure: env.NODE_ENV === 'production',
};

function userPublicFields(user: IUser) {
  return {
    _id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    plan: user.plan,
    creditsBalance: user.creditsBalance,
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, firstName, lastName } = req.body as RegisterInput;

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  let user: IUser | null = null;
  try {
    user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      firstName,
      lastName,
      plan: 'free' as const,
      creditsBalance: 0,
      isEmailVerified: false,
    });
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: number }).code === 11000) {
      throw ApiError.conflict('Email already in use');
    }
    throw err;
  }

  try {
    const slug = `${firstName.toLowerCase()}-workspace-${randomBytes(4).toString('hex')}`;
    await Workspace.create({
      name: `${firstName}'s Workspace`,
      slug,
      ownerId: user._id,
      members: [{ userId: user._id, role: 'owner', joinedAt: new Date() }],
    });
  } catch (err) {
    // Workspace creation failed — remove the orphaned user to preserve atomicity
    await User.deleteOne({ _id: user._id });
    throw err;
  }

  const accessToken = signAccessToken({ sub: String(user._id), email: user.email });
  const refreshToken = signRefreshToken(String(user._id));

  res.cookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS);
  logger.info('User registered', { userId: String(user._id), email: user.email });
  res.status(201).json({ success: true, data: { accessToken, user: userPublicFields(user) } });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;

  // Select passwordHash explicitly since it has select:false
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

  // Use a consistent error to avoid distinguishing user-not-found vs wrong-password
  const invalidCreds = ApiError.unauthorized('Invalid email or password');

  if (!user || !user.passwordHash) {
    throw invalidCreds;
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    logger.warn('Failed login attempt', { email });
    throw invalidCreds;
  }

  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = signAccessToken({ sub: String(user._id), email: user.email });
  const refreshToken = signRefreshToken(String(user._id));

  res.cookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS);

  logger.info('User logged in', { userId: String(user._id), email: user.email });

  res.status(200).json({
    success: true,
    data: { accessToken, user: userPublicFields(user) },
  });
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
  res.status(200).json({ success: true, data: null });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.refresh_token as string | undefined;
  if (!token) {
    throw ApiError.unauthorized('No refresh token provided');
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw ApiError.unauthorized('User not found');
  }

  const accessToken = signAccessToken({ sub: String(user._id), email: user.email });

  res.status(200).json({ success: true, data: { accessToken } });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  res.status(200).json({ success: true, data: userPublicFields(req.user) });
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const { firstName, lastName, avatarUrl } = req.body as {
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };

  // Only allow updating these specific fields
  const updates: Record<string, string> = {};
  if (firstName !== undefined) updates['firstName'] = firstName;
  if (lastName !== undefined) updates['lastName'] = lastName;
  if (avatarUrl !== undefined) updates['avatarUrl'] = avatarUrl;

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!updatedUser) {
    throw ApiError.notFound('User not found');
  }

  res.status(200).json({ success: true, data: userPublicFields(updatedUser) });
}

export async function getCredits(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();

  // Lazy renewal: if the monthly bucket is due for a refill, bump it
  // before we return the balance so the user sees the true post-renewal
  // state rather than "last month's leftovers."
  const { renewSubscriptionIfDue } = await import('../services/credits.js');
  await renewSubscriptionIfDue(req.user._id).catch(() => {
    /* non-fatal — balance read below just sees pre-renewal state */
  });

  const user = await User.findById(req.user._id).select(
    'creditsBalance monthlyCreditsBalance subscriptionRenewsAt plan planExpiresAt',
  );
  if (!user) throw ApiError.notFound('User not found');

  res.json({
    success: true,
    data: {
      plan: user.plan,
      planExpiresAt: user.planExpiresAt,
      subscriptionRenewsAt: user.subscriptionRenewsAt,
      monthlyCreditsBalance: user.monthlyCreditsBalance,
      creditsBalance: user.creditsBalance,
      totalCreditsBalance: user.monthlyCreditsBalance + user.creditsBalance,
    },
  });
}
