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

export async function runIntentParser(
  jobId: string,
  workspaceId: string,
  publisher: Redis
): Promise<void> {
  // Stage 0: Mark parsing started
  await ProspectingJob.findByIdAndUpdate(jobId, {
    status: 'parsing',
    startedAt: new Date(),
    'progress.percentage': 5,
    'progress.currentStage': 'parsing',
  });
  await publisher.publish(
    `job:progress:${jobId}`,
    JSON.stringify({ type: 'status', status: 'parsing', percentage: 5 })
  );

  // Fetch parsedIntent from DB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobDoc = await ProspectingJob.findById(jobId).lean() as any;
  if (!jobDoc) throw new Error(`Job ${jobId} not found`);
  const parsedIntent = jobDoc.parsedIntent as ParsedIntent;
  if (!parsedIntent) throw new Error(`Job ${jobId} has no parsedIntent`);

  logger.info('Pipeline starting', { jobId, industry: parsedIntent.industry });

  // Stage 1: Build dork queries
  await progress(jobId, publisher, 'collecting', 10, 'queryBuilder');
  const queries = buildDorkQueries(parsedIntent);
  logger.info('Dork queries built', { jobId, count: queries.length });

  // Stage 2: SerpAPI search
  await progress(jobId, publisher, 'collecting', 20, 'serpSearch');
  const serpResults = await runSerpSearch(queries);
  logger.info('Serp search done', { jobId, results: serpResults.length });

  // Stage 3: Page scraping
  await progress(jobId, publisher, 'collecting', 35, 'pageScraping');
  const pageData = await runPageScraper(serpResults, publisher, jobId);
  logger.info('Page scraping done', { jobId, pages: pageData.length });

  // Stage 4: File extraction
  const allFileUrls = pageData.flatMap(p => p.fileUrls);
  await progress(jobId, publisher, 'collecting', 50, 'fileExtraction');
  const fileData = await runFileExtractor(allFileUrls);
  logger.info('File extraction done', { jobId, files: fileData.length });

  // Aggregate raw emails and phones per domain
  // Group all scraped data by domain
  const domainMap = new Map<string, {
    emails: string[]; phones: string[]; pageUrls: string[];
    linkedinUrl?: string; companyName?: string;
  }>();

  function getDomain(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
  }

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

  // Stage 5: OSINT enrichment per domain
  await progress(jobId, publisher, 'enriching', 60, 'osintEnrichment');
  const countryHint = countryNameToCode(parsedIntent.geography.country);

  const leads: LeadRecord[] = [];

  for (const [domain, data] of domainMap.entries()) {
    const osint = await enrichDomain(domain).catch(() => ({}));

    // Stage 6: Email detection
    const detectedEmails = await detectEmails(
      domain,
      data.emails,
      (osint as { hasMx?: boolean }).hasMx ?? false
    );

    // Stage 7: Phone normalization
    const normalizedPhones = normalizePhones([...new Set(data.phones)], countryHint);

    const lead: LeadRecord = {
      workspaceId,
      jobId,
      companyName: data.companyName ?? domain,
      companyDomain: domain,
      website: data.pageUrls[0],
      industry: parsedIntent.industry,
      address: {
        country: parsedIntent.geography.country ?? undefined,
        city: parsedIntent.geography.city ?? undefined,
        state: parsedIntent.geography.state ?? undefined,
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

    // Update live count
    await ProspectingJob.findByIdAndUpdate(jobId, {
      'progress.leadsFoundSoFar': leads.length,
    });
    await publisher.publish(
      `job:progress:${jobId}`,
      JSON.stringify({ type: 'progress', leadsFoundSoFar: leads.length })
    );
  }

  logger.info('Enrichment complete', { jobId, leads: leads.length });

  // Stage 8: Deduplication
  await progress(jobId, publisher, 'deduplicating', 85, 'deduplication');
  const deduped = deduplicateLeads(leads);

  // Stage 9: Ranking
  await progress(jobId, publisher, 'deduplicating', 92, 'ranking');
  const ranked = rankLeads(deduped, parsedIntent.desiredFields);

  // Stage 10: Write to DB + publish complete
  await progress(jobId, publisher, 'deduplicating', 97, 'leadWrite');
  await writeLeads(ranked, jobId, workspaceId, publisher);

  logger.info('Pipeline complete', { jobId, total: ranked.length });
}
