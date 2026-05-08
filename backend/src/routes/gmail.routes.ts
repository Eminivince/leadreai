import { Router, type Router as ExpressRouter } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { gmailConnect, gmailStatus, gmailDisconnect } from '../controllers/gmail.controller.js';

const router: ExpressRouter = Router({ mergeParams: true });
router.use(authenticate);

router.get('/gmail/connect', asyncHandler(gmailConnect));
router.get('/gmail/status', asyncHandler(gmailStatus));
router.delete('/gmail/disconnect', asyncHandler(gmailDisconnect));

export default router;
