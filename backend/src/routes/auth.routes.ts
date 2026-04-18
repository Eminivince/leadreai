import { Router, type Router as RouterType } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { RegisterSchema, LoginSchema } from '@leadreai/shared';
import * as authController from '../controllers/auth.controller.js';

const router: RouterType = Router();

router.post('/register', validate(RegisterSchema), asyncHandler(authController.register));
router.post('/login', validate(LoginSchema), asyncHandler(authController.login));
router.post('/logout', asyncHandler(authController.logout));
router.post('/refresh', asyncHandler(authController.refresh));
router.get('/me', authenticate, asyncHandler(authController.me));
router.patch('/me', authenticate, asyncHandler(authController.updateMe));

export default router;
