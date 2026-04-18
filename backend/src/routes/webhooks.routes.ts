import { Router, type Router as RouterType } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { webhookHmac } from '../middleware/webhookHmac.js';
import * as webhooksController from '../controllers/webhooks.controller.js';

const router: RouterType = Router();

// Webhook routes: public (HMAC-verified) — no authenticate middleware
router.post('/resend', webhookHmac('resend'), asyncHandler(webhooksController.handleResendWebhook));
router.post('/sendgrid', webhookHmac('sendgrid'), asyncHandler(webhooksController.handleSendGridWebhook));

export default router;
