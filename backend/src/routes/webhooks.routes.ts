import { Router, type Router as RouterType } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { webhookHmac } from '../middleware/webhookHmac.js';
import * as webhooksController from '../controllers/webhooks.controller.js';

const router: RouterType = Router();

// Webhook routes: public (HMAC-verified) — no authenticate middleware
router.post('/resend', webhookHmac('resend'), asyncHandler(webhooksController.handleResendWebhook));
router.post('/sendgrid', webhookHmac('sendgrid'), asyncHandler(webhooksController.handleSendGridWebhook));

// Inbound email routing — no HMAC (Resend inbound uses a different auth model).
// Restrict to known ESP IPs at the load-balancer/reverse-proxy level in production.
router.post('/inbound/resend', asyncHandler(webhooksController.handleResendInbound));
router.post('/inbound/sendgrid', asyncHandler(webhooksController.handleSendGridInbound));

export default router;
