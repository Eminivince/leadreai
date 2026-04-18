import type { Request, Response, NextFunction } from 'express';
import User from '../models/User.js';
import type { IUser } from '../models/User.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { ApiError } from '../utils/ApiError.js';

// Extend Express Request to carry authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.access_token as string | undefined;

    let token: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (cookieToken) {
      token = cookieToken;
    }

    if (!token) {
      throw ApiError.unauthorized('No token provided');
    }

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);

    if (!user) {
      throw ApiError.unauthorized('User not found');
    }

    req.user = user;
    next();
  } catch (err) {
    if (err instanceof Error && (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')) {
      next(ApiError.unauthorized('Invalid or expired token'));
      return;
    }
    next(err);
  }
}
