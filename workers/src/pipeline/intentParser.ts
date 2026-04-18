import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';
import { JOB_STATUSES } from '@leadreai/shared';
import type { ParsedIntent } from '@leadreai/shared';
import { buildDorkQueries } from './queryBuilder.js';
import { runSerpSearch } from './serpScraper.js';
import { runPageScraper } from './pageScraper.js';
import { runFileExtractor } from './fileExtractor.js';
import { enrichDomain } from './osintEnricher.js';
import { detectEmails } from './emailDetector.js';
import { normalizePhones, countryNameToCode } from './phoneNormalizer.js';
import { deduplicateLeads, type LeadRecord } from './deduplicator.js';
import { rankLeads } from './ranker.js';
import { writeLeads } from './leadWriter.js';
import { runLeadQualifier } from './leadQualifier.js';

const prospectingJobSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId },
    status: { type: String, enum: JOB_STATUSES },
    parsedIntent: { type: mongoose.Schema.Types.Mixed },
    progress: {
      percentage: { type: Number, default: 0 },
      currentStage: { type: String, default: '' },
      stagesComplete: [String],
      leadsFoundSoFar: { type: Number, default: 0 },
    },
    error: { message: String, stack: String, stage: String },
    startedAt: Date,
  },
  { timestamps: true, strict: false }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ProspectingJob: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['ProspectingJob'] as mongoose.Model<any> | undefined) ??
  mongoose.model('ProspectingJob', prospectingJobSchema);

// Helper: update DB status + publish SSE event
async function progress(
  jobId: string,
  publisher: Redis,
  status: string,
  percentage: number,
  stage: string
) {
  await ProspectingJob.findByIdAndUpdate(jobId, {
    status,
    'progress.percentage': percentage,
    'progress.currentStage': stage,
    $push: { 'progress.stagesComplete': stage },
  });
  await publisher.publish(
    `job:progress:${jobId}`,
    JSON.stringify({ type: 'status', status, percentage, stage })
  );
}

// Timing helper
function timer() {
  const t = Date.now();
  return () => Date.now() - t;
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

export async function runIntentParser(
  jobId: string,
  workspaceId: string,
  publisher: Redis
): Promise<void> {
  logger.info('[Pipeline] Starting job', { jobId, workspaceId });

  // Stage 0: Mark parsing started
  await ProspectingJob.findByIdAndUpdate(jobId, {
    status: 'parsing',
    startedAt: new Date(),
    'progress.percentage': 5,
    'progress.currentStage': 'parsing',
  });
  await publisher.publish(
    `job:progress:${jobId}`,
    JSON.stringify({ type: 'status', status: 'parsing', percentage: 5, stage: 'parsing' })
  );
  logger.info('[Pipeline] [0/11] Status set to parsing', { jobId });

  // Fetch parsedIntent from DB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobDoc = await ProspectingJob.findById(jobId).lean() as any;
  if (!jobDoc) throw new Error(`Job ${jobId} not found`);
  const parsedIntent = jobDoc.parsedIntent as ParsedIntent;
  if (!parsedIntent) throw new Error(`Job ${jobId} has no parsedIntent`);

  logger.info('[Pipeline] parsedIntent loaded', {
    jobId,
    industry: parsedIntent.industry,
    geography: parsedIntent.geography,
    targetCount: parsedIntent.targetCount,
    desiredFields: parsedIntent.desiredFields,
  });

  // Stage 1: Build dork queries
  logger.info('[Pipeline] [1/11] queryBuilder starting', { jobId });
  let t = timer();
  await progress(jobId, publisher, 'collecting', 10, 'queryBuilder');
  const queries = buildDorkQueries(parsedIntent);
  logger.info('[Pipeline] [1/11] queryBuilder done', { jobId, ms: t(), count: queries.length, queries });

  // Stage 2: SerpAPI search
  logger.info('[Pipeline] [2/11] serpSearch starting', { jobId, queries: queries.length });
  t = timer();
  await progress(jobId, publisher, 'collecting', 20, 'serpSearch');
  const serpResults = await runSerpSearch(queries);
  logger.info('[Pipeline] [2/11] serpSearch done', { jobId, ms: t(), results: serpResults.length });

  // Stage 3: Page scraping (non-fatal — if Playwright isn't installed or fails, continue)
  logger.info('[Pipeline] [3/11] pageScraper starting', { jobId, urls: serpResults.length });
  t = timer();
  await progress(jobId, publisher, 'collecting', 35, 'pageScraping');
  let pageData: Awaited<ReturnType<typeof runPageScraper>> = [];
  try {
    pageData = await runPageScraper(serpResults, publisher, jobId);
    logger.info('[Pipeline] [3/11] pageScraper done', { jobId, ms: t(), pages: pageData.length });
  } catch (err) {
    logger.warn('[Pipeline] [3/11] pageScraper failed — continuing without page data', {
      jobId, ms: t(), err: err instanceof Error ? err.message : String(err),
    });
  }

  // Stage 4: File extraction (non-fatal)
  const allFileUrls = pageData.flatMap(p => p.fileUrls);
  logger.info('[Pipeline] [4/11] fileExtractor starting', { jobId, fileUrls: allFileUrls.length });
  t = timer();
  await progress(jobId, publisher, 'collecting', 50, 'fileExtraction');
  let fileData: Awaited<ReturnType<typeof runFileExtractor>> = [];
  try {
    fileData = await runFileExtractor(allFileUrls);
    logger.info('[Pipeline] [4/11] fileExtractor done', { jobId, ms: t(), files: fileData.length });
  } catch (err) {
    logger.warn('[Pipeline] [4/11] fileExtractor failed — continuing without file data', {
      jobId, ms: t(), err: err instanceof Error ? err.message : String(err),
    });
  }

  // Aggregate raw data per domain
  logger.info('[Pipeline] [5/11] aggregating by domain', { jobId });
  const domainMap = new Map<string, {
    emails: string[]; phones: string[]; pageUrls: string[];
    linkedinUrl?: string; companyName?: string;
  }>();

  for (const page of pageData) {
    if (page.url === 'collected-files') continue;
    const domain = getDomain(page.url);
    const existing = domainMap.get(domain) ?? { emails: [], phones: [], pageUrls: [] };
    existing.emails.push(...page.emails);
    existing.phones.push(...page.phones);
    existing.pageUrls.push(page.url);
    if (page.linkedinUrl && !existing.linkedinUrl) existing.linkedinUrl = page.linkedinUrl;
    if (page.companyName && !existing.companyName) existing.companyName = page.companyName;
    domainMap.set(domain, existing);
  }

  for (const file of fileData) {
    const domain = getDomain(file.url);
    const existing = domainMap.get(domain) ?? { emails: [], phones: [], pageUrls: [] };
    existing.emails.push(...file.emails);
    existing.phones.push(...file.phones);
    domainMap.set(domain, existing);
  }

  logger.info('[Pipeline] [5/11] domain aggregation done', { jobId, domains: domainMap.size });

  if (domainMap.size === 0) {
    logger.warn('[Pipeline] No domains found — writing empty result', { jobId });
    await writeLeads([], jobId, workspaceId, publisher);
    return;
  }

  // Stage 5–7: OSINT + email detection + phone normalization per domain
  logger.info('[Pipeline] [6/11] enrichment starting', { jobId, domains: domainMap.size });
  t = timer();
  await progress(jobId, publisher, 'enriching', 60, 'osintEnrichment');
  const countryHint = countryNameToCode(parsedIntent.geography?.country);
  const leads: LeadRecord[] = [];

  let domainIdx = 0;
  for (const [domain, data] of domainMap.entries()) {
    domainIdx++;
    logger.info(`[Pipeline] [6/11] enriching domain ${domainIdx}/${domainMap.size}`, { jobId, domain });

    const osint = await enrichDomain(domain).catch((err) => {
      logger.warn('[Pipeline] OSINT failed for domain', {
        jobId, domain, err: err instanceof Error ? err.message : String(err),
      });
      return {};
    });

    const detectedEmails = await detectEmails(
      domain,
      data.emails,
      (osint as { hasMx?: boolean }).hasMx ?? false
    ).catch((err) => {
      logger.warn('[Pipeline] emailDetector failed for domain', {
        jobId, domain, err: err instanceof Error ? err.message : String(err),
      });
      return [];
    });

    const normalizedPhones = normalizePhones([...new Set(data.phones)], countryHint);

    logger.info('[Pipeline] domain enriched', {
      jobId, domain,
      emails: detectedEmails.length,
      phones: normalizedPhones.filter(p => p.isValid).length,
    });

    const lead: LeadRecord = {
      workspaceId,
      jobId,
      companyName: data.companyName ?? domain,
      companyDomain: domain,
      website: data.pageUrls[0],
      industry: parsedIntent.industry,
      address: {
        country: parsedIntent.geography?.country ?? undefined,
        city: parsedIntent.geography?.city ?? undefined,
        state: parsedIntent.geography?.state ?? undefined,
      },
      emails: detectedEmails.map(e => ({ address: e.address, type: e.type, confidence: e.confidence, source: e.source })),
      phones: normalizedPhones.filter(p => p.isValid).map(p => ({
        raw: p.raw,
        normalized: p.normalized,
        type: p.type,
        countryCode: p.countryCode,
        source: 'scraped',
      })),
      socialProfiles: data.linkedinUrl ? { linkedinUrl: data.linkedinUrl } : undefined,
      osint: osint as Record<string, unknown>,
      sources: data.pageUrls.map(url => ({
        url,
        type: 'scraped_page' as const,
        scrapedAt: new Date(),
        confidence: 0.7,
      })),
      rawSnippets: [],
      rankScore: 0,
      completenessScore: 0,
      isDuplicate: false,
      tags: [],
    };

    leads.push(lead);

    await ProspectingJob.findByIdAndUpdate(jobId, {
      'progress.leadsFoundSoFar': leads.length,
    });
    await publisher.publish(
      `job:progress:${jobId}`,
      JSON.stringify({ type: 'progress', leadsFoundSoFar: leads.length })
    );
  }

  logger.info('[Pipeline] [6/11] enrichment complete', { jobId, ms: t(), leads: leads.length });

  // Stage 8: Deduplication
  logger.info('[Pipeline] [8/11] deduplication starting', { jobId, leads: leads.length });
  t = timer();
  await progress(jobId, publisher, 'deduplicating', 85, 'deduplication');
  const deduped = deduplicateLeads(leads);
  logger.info('[Pipeline] [8/11] deduplication done', {
    jobId, ms: t(), before: leads.length, after: deduped.filter(l => !l.isDuplicate).length,
  });

  // Stage 9: Ranking
  logger.info('[Pipeline] [9/11] ranking starting', { jobId });
  t = timer();
  await progress(jobId, publisher, 'deduplicating', 92, 'ranking');
  const ranked = rankLeads(deduped, parsedIntent.desiredFields);
  logger.info('[Pipeline] [9/11] ranking done', { jobId, ms: t(), ranked: ranked.length });

  // Stage 10: Write to DB
  logger.info('[Pipeline] [10/11] leadWriter starting', { jobId });
  t = timer();
  await progress(jobId, publisher, 'deduplicating', 97, 'leadWrite');
  await writeLeads(ranked, jobId, workspaceId, publisher);
  logger.info('[Pipeline] [10/11] leadWriter done', { jobId, ms: t() });

  // Stage 11: Lead qualification
  logger.info('[Pipeline] [11/11] leadQualifier starting', { jobId });
  t = timer();
  await progress(jobId, publisher, 'complete', 99, 'qualification');
  await runLeadQualifier(jobId, workspaceId, publisher);
  logger.info('[Pipeline] [11/11] leadQualifier done', { jobId, ms: t() });

  logger.info('[Pipeline] Job complete', { jobId, totalLeads: ranked.length });
}
