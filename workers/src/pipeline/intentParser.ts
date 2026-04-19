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
import { resolveNamedEntities } from './entityResolver.js';
import { findEntityWebsites } from './entityWebsiteFinder.js';
import { buildRound2Dorks } from './queryBuilder.js';
import { passesHeuristicFilter } from './heuristicFilter.js';
import { SerpCache } from '../utils/serpCache.js';
import { env } from '../config/env.js';

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
  publisher: Redis,
): Promise<void> {
  logger.info('[Pipeline] Starting job', { jobId, workspaceId });

  // ── Stage 0: Mark parsing started ───────────────────────────────────
  await ProspectingJob.findByIdAndUpdate(jobId, {
    status: 'parsing',
    startedAt: new Date(),
    'progress.percentage': 3,
    'progress.currentStage': 'parsing',
  });
  await publisher.publish(
    `job:progress:${jobId}`,
    JSON.stringify({ type: 'status', status: 'parsing', percentage: 3, stage: 'parsing' })
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobDoc = await ProspectingJob.findById(jobId).lean() as any;
  if (!jobDoc) throw new Error(`Job ${jobId} not found`);
  let parsedIntent = jobDoc.parsedIntent as ParsedIntent;
  if (!parsedIntent) throw new Error(`Job ${jobId} has no parsedIntent`);

  logger.info('[Pipeline] parsedIntent loaded', {
    jobId, queryType: parsedIntent.queryType,
    industry: parsedIntent.industry, targetCount: parsedIntent.targetCount,
  });

  // ── Stage 1: Entity resolution (named_entity_list only) ─────────────
  if (parsedIntent.queryType === 'named_entity_list' && !parsedIntent.namedEntities?.length) {
    await progress(jobId, publisher, 'parsing', 7, 'parsing');
    logger.info('[Pipeline] [1] Resolving named entities', { jobId });
    const resolvedEntities = await resolveNamedEntities(parsedIntent).catch((err) => {
      logger.warn('[Pipeline] Entity resolution failed — continuing without entities', { jobId, err });
      return [] as string[];
    });
    if (resolvedEntities.length > 0) {
      parsedIntent = { ...parsedIntent, namedEntities: resolvedEntities } as ParsedIntent;
      await ProspectingJob.findByIdAndUpdate(jobId, {
        'parsedIntent.namedEntities': resolvedEntities,
      });
    }
    logger.info('[Pipeline] [1] Entity resolution done', { jobId, count: parsedIntent.namedEntities?.length ?? 0 });
  }

  // ── Stage 2: Build initial dork queries ─────────────────────────────
  await progress(jobId, publisher, 'collecting', 10, 'queryBuilder');
  let t = timer();
  const round1Queries = buildDorkQueries(parsedIntent);
  logger.info('[Pipeline] [2] queryBuilder done', { jobId, ms: t(), count: round1Queries.length });

  // ── Stage 3: SERP initial round → populate cache ─────────────────────
  await progress(jobId, publisher, 'collecting', 18, 'serpSearch');
  t = timer();

  const cacheRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const serpCache = new SerpCache(cacheRedis);

  try {
  // For entity queries: find each firm's official website FIRST and inject into cache
  // so they're processed before generic dork results (highest signal, lowest noise)
  const isEntityQuery = (parsedIntent.queryType === 'named_entity_list' || parsedIntent.queryType === 'contact_lookup')
    && (parsedIntent.namedEntities?.length ?? 0) > 0;

  if (isEntityQuery) {
    await progress(jobId, publisher, 'collecting', 12, 'queryBuilder');
    logger.info('[Pipeline] [2b] Entity website discovery starting', { jobId });
    const entityUrls = await findEntityWebsites(parsedIntent.namedEntities!, parsedIntent).catch((err) => {
      logger.warn('[Pipeline] Entity website finder failed — continuing', { jobId, err });
      return [];
    });
    if (entityUrls.length > 0) {
      await serpCache.addLinks(jobId, entityUrls);
      logger.info('[Pipeline] [2b] Entity websites injected into cache', { jobId, count: entityUrls.length });
    }
  }

  const serpResults = await runSerpSearch(round1Queries);
  await serpCache.addLinks(jobId, serpResults);
  logger.info('[Pipeline] [3] SERP round 1 done → cached', {
    jobId, ms: t(), fetched: serpResults.length, cached: await serpCache.size(jobId),
  });

  // ── Stage 4–7: Iterative batch loop ─────────────────────────────────
  const BATCH_SIZE = 8;
  const MAX_SERP_ROUNDS = 3;
  const STOP_THRESHOLD = Math.max(1, parsedIntent.targetCount);
  const countryHint = countryNameToCode(parsedIntent.geography?.country);

  const accumulatedLeads: LeadRecord[] = [];
  const processedDomains = new Set<string>();
  let serpRound = 1;
  let shouldStop = false;
  let leadsWithContact = 0;

  const enrichPct = (done: number) =>
    Math.round(20 + Math.min(done / Math.max(1, STOP_THRESHOLD * 3), 1) * 60);

  await progress(jobId, publisher, 'enriching', 22, 'osintEnrichment');

  while (!shouldStop) {
    const batch = await serpCache.getNextBatch(jobId, BATCH_SIZE);

    if (batch.length === 0) {
      if (serpRound >= MAX_SERP_ROUNDS) {
        logger.info('[Pipeline] Max SERP rounds reached — stopping', { jobId, serpRound });
        break;
      }
      serpRound++;
      logger.info('[Pipeline] Cache empty — running SERP round', { jobId, serpRound });

      await progress(jobId, publisher, 'collecting', 18, 'serpSearch');
      const round2Queries = buildRound2Dorks(parsedIntent);
      const newResults = await runSerpSearch(round2Queries);
      if (newResults.length === 0) {
        logger.info('[Pipeline] SERP round returned nothing — stopping', { jobId, serpRound });
        break;
      }
      await serpCache.addLinks(jobId, newResults);
      logger.info('[Pipeline] SERP replenished cache', { jobId, serpRound, added: newResults.length });
      await progress(jobId, publisher, 'enriching', 22, 'osintEnrichment');
      continue;
    }

    const filtered = batch.filter(r => passesHeuristicFilter(r, parsedIntent));
    logger.info('[Pipeline] Batch heuristic filter', {
      jobId, before: batch.length, after: filtered.length,
    });

    if (filtered.length === 0) continue;

    let pageData: Awaited<ReturnType<typeof runPageScraper>> = [];
    try {
      pageData = await runPageScraper(filtered, publisher, jobId);
    } catch (err) {
      logger.warn('[Pipeline] pageScraper failed for batch', {
        jobId, err: err instanceof Error ? err.message : String(err),
      });
    }

    const fileUrls = pageData.flatMap(p => p.fileUrls);
    let fileData: Awaited<ReturnType<typeof runFileExtractor>> = [];
    if (fileUrls.length > 0) {
      try {
        fileData = await runFileExtractor(fileUrls);
      } catch (err) {
        logger.warn('[Pipeline] fileExtractor failed for batch', {
          jobId, err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const batchDomainMap = new Map<string, {
      emails: string[]; phones: string[]; pageUrls: string[];
      linkedinUrl?: string; companyName?: string;
    }>();

    for (const page of pageData) {
      if (page.url === 'collected-files') continue;
      const domain = getDomain(page.url);
      if (processedDomains.has(domain)) continue;
      const existing = batchDomainMap.get(domain) ?? { emails: [], phones: [], pageUrls: [] };
      existing.emails.push(...page.emails);
      existing.phones.push(...page.phones);
      existing.pageUrls.push(page.url);
      if (page.linkedinUrl && !existing.linkedinUrl) existing.linkedinUrl = page.linkedinUrl;
      if (page.companyName && !existing.companyName) existing.companyName = page.companyName;
      batchDomainMap.set(domain, existing);
    }
    for (const file of fileData) {
      const domain = getDomain(file.url);
      if (processedDomains.has(domain)) continue;
      const existing = batchDomainMap.get(domain) ?? { emails: [], phones: [], pageUrls: [] };
      existing.emails.push(...file.emails);
      existing.phones.push(...file.phones);
      batchDomainMap.set(domain, existing);
    }

    for (const [domain, data] of batchDomainMap.entries()) {
      processedDomains.add(domain);

      const osint = await enrichDomain(domain).catch(() => ({}));
      const detectedEmails = await detectEmails(
        domain, data.emails, (osint as { hasMx?: boolean }).hasMx ?? false
      ).catch(() => []);
      const normalizedPhones = normalizePhones([...new Set(data.phones)], countryHint);

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
        emails: detectedEmails.map(e => ({
          address: e.address, type: e.type, confidence: e.confidence, source: e.source,
        })),
        phones: normalizedPhones.filter(p => p.isValid).map(p => ({
          raw: p.raw, normalized: p.normalized, type: p.type,
          countryCode: p.countryCode, source: 'scraped',
        })),
        socialProfiles: data.linkedinUrl ? { linkedinUrl: data.linkedinUrl } : undefined,
        osint: osint as Record<string, unknown>,
        sources: data.pageUrls.map(url => ({
          url, type: 'scraped_page' as const, scrapedAt: new Date(), confidence: 0.7,
        })),
        rawSnippets: [],
        rankScore: 0,
        completenessScore: 0,
        isDuplicate: false,
        tags: [],
      };

      accumulatedLeads.push(lead);
      if (lead.emails.length > 0 || lead.phones.length > 0) leadsWithContact++;

      if (leadsWithContact >= STOP_THRESHOLD) {
        logger.info('[Pipeline] Target count reached — stopping loop', {
          jobId, leadsWithContact, STOP_THRESHOLD,
        });
        shouldStop = true;
        break;
      }
    }

    // Publish progress once per batch (not per domain)
    await ProspectingJob.findByIdAndUpdate(jobId, {
      'progress.leadsFoundSoFar': accumulatedLeads.length,
    });
    await publisher.publish(
      `job:progress:${jobId}`,
      JSON.stringify({ type: 'progress', leadsFoundSoFar: accumulatedLeads.length })
    );
    await publisher.publish(
      `job:progress:${jobId}`,
      JSON.stringify({
        type: 'status', status: 'enriching',
        percentage: enrichPct(processedDomains.size), stage: 'osintEnrichment',
      })
    );
  }

  // ── Stage 8: Deduplication ───────────────────────────────────────────
  logger.info('[Pipeline] Deduplication starting', { jobId, total: accumulatedLeads.length });
  await progress(jobId, publisher, 'deduplicating', 85, 'deduplication');
  const deduped = deduplicateLeads(accumulatedLeads);

  // ── Stage 9: Ranking ─────────────────────────────────────────────────
  await progress(jobId, publisher, 'deduplicating', 92, 'ranking');
  const ranked = rankLeads(deduped, parsedIntent.desiredFields);

  // ── Stage 10: Write to DB ────────────────────────────────────────────
  await progress(jobId, publisher, 'deduplicating', 97, 'leadWrite');
  await writeLeads(ranked, jobId, workspaceId, publisher);

  // ── Stage 11: AI Qualification ───────────────────────────────────────
  await progress(jobId, publisher, 'complete', 99, 'qualification');
  await runLeadQualifier(jobId, workspaceId, publisher);

  logger.info('[Pipeline] Job complete', { jobId, totalLeads: ranked.length });
  } finally {
    await serpCache.clear(jobId).catch(() => {});
    cacheRedis.quit().catch(() => {});
  }
}
