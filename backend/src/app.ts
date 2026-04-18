import express, { type Express } from 'express';
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
import { authenticate } from './middleware/authenticate.js';
import { asyncHandler } from './utils/asyncHandler.js';
import { jobProgressStream } from './sse/jobProgressStream.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use(globalRateLimiter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/workspaces', workspaceRouter);
  app.use('/api/v1/workspaces/:workspaceId/jobs', jobsRouter);
  app.use('/api/v1/workspaces/:workspaceId/leads', leadsRouter);
  app.use('/api/v1/workspaces/:workspaceId/export', exportRouter);
  app.use('/api/v1/workspaces/:workspaceId/campaigns', campaignsRouter);
  app.use('/api/v1/workspaces/:workspaceId', outreachRouter);
  app.get(
    '/api/v1/workspaces/:workspaceId/jobs/:jobId/stream',
    authenticate,
    asyncHandler(jobProgressStream)
  );

  app.use(errorHandler);

  return app;
}
