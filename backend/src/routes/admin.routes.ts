import type { Router as ExpressRouter } from 'express';
import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import {
  getProspectingQueue,
  getEnrichmentQueue,
  getOutreachQueue,
  getExportQueue,
} from '../services/queue/queues.js';
import { adminAuth } from '../middleware/adminAuth.js';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(getProspectingQueue()),
    new BullMQAdapter(getEnrichmentQueue()),
    new BullMQAdapter(getOutreachQueue()),
    new BullMQAdapter(getExportQueue()),
  ],
  serverAdapter,
});

const router: ExpressRouter = Router();
router.use(adminAuth);
router.use('/', serverAdapter.getRouter());

export default router;
