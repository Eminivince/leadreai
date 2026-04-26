import { Router, type Router as RouterType } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { RegisterSchema, LoginSchema } from '@leadreai/shared';
import * as authController from '../controllers/auth.controller.js';
import * as oauthController from '../controllers/oauth.controller.js';
import * as magicLinkController from '../controllers/magicLink.controller.js';

const router: RouterType = Router();

router.post('/register', authRateLimiter, validate(RegisterSchema), asyncHandler(authController.register));
router.post('/login', authRateLimiter, validate(LoginSchema), asyncHandler(authController.login));
router.post('/logout', authenticate, asyncHandler(authController.logout));
router.post('/refresh', asyncHandler(authController.refresh));
router.get('/me', authenticate, asyncHandler(authController.me));
router.get('/me/credits', authenticate, asyncHandler(authController.getCredits));
router.patch('/me', authenticate, asyncHandler(authController.updateMe));

// Social — Google
router.get('/google', asyncHandler(oauthController.startGoogleAuth));
router.get('/google/callback', asyncHandler(oauthController.googleCallback));

// Passwordless — magic link
router.post('/magic-link/request', authRateLimiter, asyncHandler(magicLinkController.requestLink));
router.post('/magic-link/verify', authRateLimiter, asyncHandler(magicLinkController.verifyLink));

export default router;
