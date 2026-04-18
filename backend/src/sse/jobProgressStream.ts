import type { Request, Response } from 'express';
import { Redis } from 'ioredis';
import ProspectingJob from '../models/ProspectingJob.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function jobProgressStream(req: Request, res: Response): Promise<void> {
  const { workspaceId, jobId } = req.params;

  // 1. Validate job belongs to workspace
  const job = await ProspectingJob.findOne({ _id: jobId, workspaceId });
  if (!job) throw ApiError.notFound('Job not found');

  // 2. Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders(); // flush immediately so client gets 200 before any events

  // Helper to write SSE events
  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // 3. Send initial "connected" event
  send({ type: 'connected', jobId });

  // 4. Create a DEDICATED Redis connection for pub/sub
  // IMPORTANT: pub/sub requires a dedicated connection — do NOT reuse getRedis() singleton
  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  subscriber.on('error', (err) => logger.error('SSE subscriber error', { err }));

  // 5. Subscribe to pub/sub channel
  const channel = `job:progress:${jobId}`;
  await subscriber.subscribe(channel);
  subscriber.on('message', (_chan: string, message: string) => {
    res.write(`data: ${message}\n\n`);
  });

  // 6. Heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    send({ type: 'heartbeat' });
  }, 30_000);

  // 7. Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    subscriber.unsubscribe(channel).catch(() => {});
    subscriber.quit().catch(() => {});
  });
}
