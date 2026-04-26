import { Router, type Router as RouterType } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import * as ctl from '../controllers/credits.controller.js';

/**
 * Credits ledger + top-up. Routes are per-user (the credit balance
 * lives on User today). Mounted under /api/v1/credits.
 */
const router: RouterType = Router();

router.use(authenticate);

router.get('/transactions', asyncHandler(ctl.listTransactions));
router.post('/test-topup', asyncHandler(ctl.testTopUp));
router.post('/test-subscribe', asyncHandler(ctl.testSubscribe));

export default router;
