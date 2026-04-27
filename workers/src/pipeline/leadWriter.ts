import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { Queue, QueueEvents } from 'bullmq';
import { logger } from '../utils/logger.js';
import { fireWebhook } from '../services/webhook.js';
import { env } from '../config/env.js';
import type { LeadRecord } from './deduplicator.js';
import { autoCreateFileFromJob } from './fileAutoCreator.js';
import { emitNotification } from '../services/notificationEmitter.js';
import { isSocialPlatformHost } from './tools/writeLead.js';

// ---------------------------------------------------------------------------
// Lazy contact-enrichment queue + queue events (for waitUntilFinished)
// ---------------------------------------------------------------------------
const PREFIX = `{bull}:leadreai:${env.NODE_ENV}`;

let _contactQueue: Queue | null = null;
function getContactQueue(): Queue {
  if (!_contactQueue) {
    _contactQueue = new Queue('contact-enrichment', {
      connection: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
      prefix: PREFIX,
    });
  }
  return _contactQueue;
}

let _contactQueueEvents: QueueEvents | null = null;
function getContactQueueEvents(): QueueEvents {
  if (!_contactQueueEvents) {
    _contactQueueEvents = new QueueEvents('contact-enrichment', {
      connection: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
      prefix: PREFIX,
    });
  }
  return _contactQueueEvents;
}

// Inline Lead model (strict: false — picks up all fields without re-specifying)
const leadSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
leadSchema.index({ workspaceId: 1, companyDomain: 1 }, { unique: true, sparse: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Lead: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['Lead'] as mongoose.Model<any> | undefined) ??
  mongoose.model('Lead', leadSchema, 'leads'); // explicit collection name

// Inline ProspectingJob model (same pattern)
const jobSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ProspectingJob: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['ProspectingJob'] as mongoose.Model<any> | undefined) ??
  mongoose.model('ProspectingJob', jobSchema);

export async function writeLeads(
  leads: LeadRecord[],
  jobId: string,
  workspaceId: string,
  publisher: Redis
): Promise<void> {
  const channel = `job:progress:${jobId}`;
  const nonDupes = leads.filter(l => !l.isDuplicate);

  if (nonDupes.length === 0) {
    logger.warn('No leads to write', { jobId });
  } else {
    // Bulk upsert — match on (workspaceId, companyDomain) or insert new
    const ops = nonDupes.map(lead => ({
      updateOne: {
        filter: lead.companyDomain
          ? { workspaceId: new mongoose.Types.ObjectId(workspaceId), companyDomain: lead.companyDomain }
          : { workspaceId: new mongoose.Types.ObjectId(workspaceId), companyName: lead.companyName },
        update: {
          $set: {
            ...lead,
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            jobId: new mongoose.Types.ObjectId(jobId),
          },
        },
        upsert: true,
      },
    }));

    const result = await Lead.bulkWrite(ops, { ordered: false });
    logger.info('Leads written', {
      jobId,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
    });

    // Dispatch contact-enrichment jobs and await their completion before
    // marking the parent job complete. Previously these jobs were fire-and-
    // forget, so the parent's `status=complete` would race ahead of the
    // enrichment that populates `contactSummary.topContact` — the harness
    // (and the UI on job-complete) would see leads with no named contacts
    // even when extraction would have found them. Awaiting costs 10-60s
    // extra per job but makes relevance scores honest.
    // Skip contact enrichment for social-platform leads (instagram.com/foo,
    // tiktok.com/bar, etc.) — there's no company site to scrape, and
    // pointing Playwright at a profile URL just burns time for no data.
    const domainsToEnrich = nonDupes
      .filter((l) => l.companyDomain)
      .map((l) => l.companyDomain!)
      .filter((d) => {
        const host = d.split('/')[0] ?? d;
        return !isSocialPlatformHost(host);
      });
    if (domainsToEnrich.length > 0) {
      const writtenLeads = await Lead.find(
        {
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          companyDomain: { $in: domainsToEnrich },
        },
        { _id: 1, companyDomain: 1, companyName: 1, website: 1, emails: 1 }
      ).lean();

      if (writtenLeads.length > 0) {
        const queue = getContactQueue();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dispatched = await queue.addBulk(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (writtenLeads as any[]).map((lead: any) => ({
            name: 'enrich',
            data: {
              workspaceId,
              leadId: lead._id.toString(),
              companyDomain: lead.companyDomain,
              companyName: lead.companyName,
              websiteUrl: lead.website,
              existingEmails: (lead.emails ?? []).map((e: any) => e.address),
            },
          }))
        );
        logger.info('leadWriter: enqueued contact enrichment jobs', { count: dispatched.length });

        // Wait for all enrichment jobs to finish — bounded so a stuck
        // enricher can't block the parent job indefinitely. Each enricher
        // already has its own Playwright timeout; this is a belt-and-
        // suspenders ceiling.
        const PER_LEAD_WAIT_MS = 30_000;
        const ceilingMs = Math.min(120_000, PER_LEAD_WAIT_MS * dispatched.length);
        try {
          const events = getContactQueueEvents();
          await Promise.allSettled(
            dispatched.map((j) => j.waitUntilFinished(events, ceilingMs)),
          );
          logger.info('leadWriter: contact enrichment complete', { count: dispatched.length });
        } catch (err) {
          logger.warn('leadWriter: enrichment wait hit timeout', {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  // Update job to complete
  const totalLeadsFound = leads.length;
  const totalAfterDedup = nonDupes.length;

  await ProspectingJob.findByIdAndUpdate(jobId, {
    status: 'complete',
    completedAt: new Date(),
    'progress.percentage': 100,
    'progress.currentStage': 'complete',
    'result.totalLeadsFound': totalLeadsFound,
    'result.totalAfterDedup': totalAfterDedup,
  });

  // Auto-curate a File from this dispatch so the user lands with their new
  // leads already grouped. Failures are logged and non-fatal.
  await autoCreateFileFromJob(jobId, workspaceId);

  // Announce the completion in the workspace's notification feed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobMeta = (await ProspectingJob.findById(jobId, { rawQuery: 1 }).lean()) as
    | { rawQuery?: string }
    | null;
  const rawQ = jobMeta?.rawQuery?.trim();
  const preview = rawQ && rawQ.length > 60 ? `${rawQ.slice(0, 57)}…` : rawQ;
  await emitNotification({
    workspaceId,
    type: 'job.complete',
    title:
      totalAfterDedup === 0
        ? 'Dispatch filed — no qualified leads.'
        : `Dispatch filed — ${totalAfterDedup} lead${totalAfterDedup === 1 ? '' : 's'}.`,
    message: preview,
    href: `/dashboard/leads?jobId=${jobId}`,
    metadata: { jobId, totalAfterDedup, totalLeadsFound },
  });

  // Publish completion event
  await publisher.publish(
    channel,
    JSON.stringify({ type: 'complete', totalLeadsFound, totalAfterDedup })
  );

  // Fire webhook to workspace
  const ws = await mongoose.model('Workspace').findById(workspaceId, { 'settings.webhookUrl': 1 }).lean() as { settings?: { webhookUrl?: string } } | null;
  if (ws?.settings?.webhookUrl) {
    fireWebhook(ws.settings.webhookUrl, { event: 'job:complete', jobId, workspaceId, status: 'complete', totalLeadsFound }, env.WEBHOOK_TIMEOUT_MS);
  }

  logger.info('Job complete', { jobId, totalLeadsFound });
}

/**
 * Subagent-only lead write: bulk-upserts leads to Mongo without triggering
 * job completion lifecycle (status update, notifications, webhook, contact
 * enrichment). Called by subagent workers in the fan-out architecture.
 * The parent job's writeLeads call handles the full completion lifecycle.
 */
export async function writeSubagentLeads(
  leads: LeadRecord[],
  jobId: string,
  workspaceId: string,
): Promise<void> {
  const nonDupes = leads.filter(l => !l.isDuplicate);
  if (nonDupes.length === 0) return;

  const ops = nonDupes.map(lead => ({
    updateOne: {
      filter: lead.companyDomain
        ? { workspaceId: new mongoose.Types.ObjectId(workspaceId), companyDomain: lead.companyDomain }
        : { workspaceId: new mongoose.Types.ObjectId(workspaceId), companyName: lead.companyName },
      update: {
        $set: {
          ...lead,
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          jobId: new mongoose.Types.ObjectId(jobId),
        },
      },
      upsert: true,
    },
  }));

  const result = await Lead.bulkWrite(ops, { ordered: false });
  logger.info('[subagent] leads upserted', {
    jobId,
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
  });
}
