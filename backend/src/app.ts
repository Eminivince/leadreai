import express, { type Express } from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { globalRateLimiter } from './middleware/rateLimiter.js';
import authRouter from './routes/auth.routes.js';
import workspaceRouter from './routes/workspace.routes.js';
import jobsRouter from './routes/jobs.routes.js';
import leadsRouter from './routes/leads.routes.js';
import exportRouter from './routes/export.routes.js';
import campaignsRouter from './routes/campaigns.routes.js';
import outreachRouter from './routes/outreach.routes.js';
import adminRouter from './routes/admin.routes.js';
import enrollmentsRouter from './routes/enrollments.routes.js';
import { contactsRouter, leadContactsRouter } from './routes/contacts.routes.js';
import crmRouter, { crmLeadsRouter } from './routes/crm.routes.js';
import { hubspotCallback } from './controllers/crm.controller.js';
import gmailRouter from './routes/gmail.routes.js';
import { gmailCallback } from './controllers/gmail.controller.js';
import suppressionRouter from './routes/suppression.routes.js';
import filesRouter from './routes/files.routes.js';
import notificationsRouter from './routes/notifications.routes.js';
import creditsRouter from './routes/credits.routes.js';
import searchRouter from './routes/search.routes.js';
import libraryRouter from './routes/library.routes.js';
import sequencesRouter from './routes/sequences.routes.js';
import webhooksRouter from './routes/webhooks.routes.js';
import dataSourcesRouter from './routes/dataSources.routes.js';
import invocationsRouter from './routes/invocations.routes.js';
import dataTablesRouter from './routes/dataTables.routes.js';
import workflowsRouter from './routes/workflows.routes.js';
import { costsJobRouter, costsUsageRouter } from './routes/costs.routes.js';
import chatRouter from './routes/chat.routes.js';
import { authenticate } from './middleware/authenticate.js';
import { asyncHandler } from './utils/asyncHandler.js';
import { handleUnsubscribe } from './controllers/webhooks.controller.js';
import { jobProgressStream } from './sse/jobProgressStream.js';
import { notificationStream } from './sse/notificationStream.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }));
  app.use(express.json({
    limit: '1mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.use(cookieParser());

  app.use(globalRateLimiter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // OAuth callbacks must be top-level (no auth middleware, fixed URL for provider registration)
  app.get('/api/v1/oauth/hubspot/callback', asyncHandler(hubspotCallback));
  app.get('/api/v1/oauth/gmail/callback', asyncHandler(gmailCallback));

  // Validate workspaceId param is a valid ObjectId before any workspace-scoped handler runs
  app.param('workspaceId', (_req, res, next, val) => {
    if (!mongoose.Types.ObjectId.isValid(val as string)) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid workspaceId' } });
      return;
    }
    next();
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/credits', creditsRouter);
  app.use('/api/v1/workspaces', workspaceRouter);
  app.use('/api/v1/workspaces/:workspaceId/jobs', jobsRouter);
  app.use('/api/v1/workspaces/:workspaceId/leads', leadsRouter);
  app.use('/api/v1/workspaces/:workspaceId/export', exportRouter);
  app.use('/api/v1/workspaces/:workspaceId/campaigns', campaignsRouter);
  app.use('/api/v1/workspaces/:workspaceId/data-sources', dataSourcesRouter);
  app.use('/api/v1/workspaces/:workspaceId/invocations', invocationsRouter);
  app.use('/api/v1/workspaces/:workspaceId/tables', dataTablesRouter);
  app.use('/api/v1/workspaces/:workspaceId/workflows', workflowsRouter);
  app.use('/api/v1/workspaces/:workspaceId/jobs', costsJobRouter);
  app.use('/api/v1/workspaces/:workspaceId/usage', costsUsageRouter);
  app.use('/api/v1/workspaces/:workspaceId', outreachRouter);
  app.get(
    '/api/v1/workspaces/:workspaceId/jobs/:jobId/stream',
    authenticate,
    asyncHandler(jobProgressStream)
  );

  app.use('/api/v1/workspaces/:workspaceId/contacts', contactsRouter);
  app.use('/api/v1/workspaces/:workspaceId/leads', leadContactsRouter);
  app.use('/api/v1/workspaces/:workspaceId/leads', crmLeadsRouter);
  app.use('/api/v1/workspaces/:workspaceId/crm', crmRouter);
  app.use('/api/v1/workspaces/:workspaceId/email-sender', gmailRouter);
  app.use('/api/v1/workspaces/:workspaceId/suppression', suppressionRouter);
  app.use('/api/v1/workspaces/:workspaceId/files', filesRouter);
  app.use('/api/v1/workspaces/:workspaceId/notifications', notificationsRouter);
  app.use('/api/v1/workspaces/:workspaceId/search', searchRouter);
  app.use('/api/v1/workspaces/:workspaceId/library', libraryRouter);
  app.get(
    '/api/v1/workspaces/:workspaceId/notifications/stream',
    authenticate,
    asyncHandler(notificationStream),
  );
  app.use('/api/v1/workspaces/:workspaceId/sequences', sequencesRouter);
  app.use('/api/v1/workspaces/:workspaceId/enrollments', enrollmentsRouter);
  app.use('/api/v1/workspaces/:workspaceId/chat', chatRouter);

  app.use('/admin/queues', adminRouter);

  app.use('/webhooks', webhooksRouter);
  app.get('/unsubscribe', asyncHandler(handleUnsubscribe));

  app.use(errorHandler);

  return app;
}
