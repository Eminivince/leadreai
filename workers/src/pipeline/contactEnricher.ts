import type { Job } from 'bullmq';
import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { logger } from '../utils/logger.js';
import { extractContacts } from '../services/contactExtractor.js';
import { mapSeniority } from '../services/seniorityMapper.js';

// Inline Contact model (strict:false — workers never import from backend)
const contactSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Contact: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['Contact'] as mongoose.Model<any> | undefined) ??
  mongoose.model('Contact', contactSchema, 'contacts');

const leadSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Lead: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['Lead'] as mongoose.Model<any> | undefined) ??
  mongoose.model('Lead', leadSchema, 'leads');

export interface ContactEnrichmentPayload {
  workspaceId: string;
  leadId: string;
  companyDomain: string;
  companyName: string;
  websiteUrl?: string;
  existingEmails: string[];
}

export async function enrichContacts(job: Job<ContactEnrichmentPayload>): Promise<void> {
  const { workspaceId, leadId, companyDomain, companyName } = job.data;
  logger.info('contactEnricher: starting', { leadId, companyDomain });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  try {
    const extracted = await extractContacts(page, companyDomain);
    if (extracted.length === 0) {
      logger.info('contactEnricher: no contacts found', { leadId, companyDomain });
      return;
    }

    // Upsert contacts — key: (workspaceId, leadId, normalised fullName)
    const ops = extracted.map(c => {
      const seniorityResult = c.title ? mapSeniority(c.title) : { seniority: 'unknown', department: 'other' };
      return {
        updateOne: {
          filter: {
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            leadId: new mongoose.Types.ObjectId(leadId),
            fullName: { $regex: new RegExp(`^${c.fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          },
          update: {
            $setOnInsert: {
              workspaceId: new mongoose.Types.ObjectId(workspaceId),
              leadId: new mongoose.Types.ObjectId(leadId),
              fullName: c.fullName,
              firstName: c.firstName,
              lastName: c.lastName,
              title: c.title,
              seniority: seniorityResult.seniority,
              department: seniorityResult.department,
              emails: c.emails,
              phones: [],
              sources: c.sources,
              confidenceScore: 60,
              freshnessScore: 100,
              isActive: true,
              tags: [],
              crmRefs: [],
            },
          },
          upsert: true,
        },
      };
    });

    // Tolerate E11000 duplicates: same email can legitimately appear on multiple
    // leads (e.g. founder at CoA is also advisor at CoB). With `ordered:false`
    // MongoDB continues the batch past a dupe, but the mongoose driver still
    // throws afterward — so we catch the error and extract the partial result
    // to keep the successful writes. Other error codes we re-throw.
    let upsertedCount = 0;
    let matchedCount = 0;
    try {
      const result = await Contact.bulkWrite(ops, { ordered: false });
      upsertedCount = result.upsertedCount;
      matchedCount = result.matchedCount;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      const writeErrors: Array<{ code?: number }> = e?.writeErrors ?? e?.result?.result?.writeErrors ?? [];
      const allDupes = writeErrors.length > 0 && writeErrors.every((w) => w.code === 11000);
      if (allDupes) {
        upsertedCount = e?.result?.result?.nUpserted ?? e?.insertedCount ?? 0;
        matchedCount = e?.result?.result?.nMatched ?? 0;
        logger.info('contactEnricher: tolerated duplicate key errors', {
          leadId, dupes: writeErrors.length, upsertedCount,
        });
      } else {
        throw err;
      }
    }
    logger.info('contactEnricher: contacts upserted', {
      leadId,
      upserted: upsertedCount,
      matched: matchedCount,
    });

    // Update lead contactSummary
    const totalContacts = await Contact.countDocuments({
      leadId: new mongoose.Types.ObjectId(leadId),
      isActive: true,
    });

    const topContact = await Contact.findOne(
      { leadId: new mongoose.Types.ObjectId(leadId), isActive: true },
      { fullName: 1, title: 1, seniority: 1 }
    ).sort({ confidenceScore: -1 });

    await Lead.updateOne(
      { _id: new mongoose.Types.ObjectId(leadId) },
      {
        $set: {
          'contactSummary.totalContacts': totalContacts,
          'contactSummary.topContact': topContact
            ? { fullName: topContact.fullName, title: topContact.title ?? '', seniority: topContact.seniority ?? 'unknown' }
            : undefined,
        },
      }
    );
  } finally {
    await browser.close();
  }
}
