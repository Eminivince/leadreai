import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { logger } from '../utils/logger.js';
import { fireWebhook } from '../services/webhook.js';
import { env } from '../config/env.js';
import type { LeadRecord } from './deduplicator.js';

// ---------------------------------------------------------------------------
// Lazy contact-enrichment queue
// ---------------------------------------------------------------------------
let _contactQueue: Queue | null = null;
function getContactQueue(): Queue {
  if (!_contactQueue) {
    _contactQueue = new Queue('contact-enrichment', {
      connection: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
      prefix: '{leadreai}',
    });
  }
  return _contactQueue;
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

    // Dispatch contact-enrichment jobs for written leads that have a companyDomain
    const domainsToEnrich = nonDupes.filter(l => l.companyDomain).map(l => l.companyDomain);
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
        await queue.addBulk(
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
        logger.info('leadWriter: enqueued contact enrichment jobs', { count: writtenLeads.length });
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
