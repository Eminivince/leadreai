import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AccessTokenPayload {
  sub: string;   // userId
  email: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;   // userId
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string {
  const options: SignOptions = { expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function signRefreshToken(userId: string): string {
  const options: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const raw = jwt.verify(token, env.JWT_SECRET);
  if (typeof raw !== 'object' || !raw || !('sub' in raw) || !('email' in raw)) {
    throw new Error('Malformed token payload');
  }
  return raw as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const raw = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (typeof raw !== 'object' || !raw || !('sub' in raw)) {
    throw new Error('Malformed token payload');
  }
  return raw as RefreshTokenPayload;
}
