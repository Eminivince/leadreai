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
import type { ContactCandidate } from './aiContactExtractor.js';
import { rankLeads } from './ranker.js';
import { writeLeads } from './leadWriter.js';
import { runLeadQualifier } from './leadQualifier.js';
import { resolveNamedEntities } from './entityResolver.js';
import { findEntityWebsites } from './entityWebsiteFinder.js';
import { buildRound2Dorks } from './queryBuilder.js';
import { passesHeuristicFilter } from './heuristicFilter.js';
import { SerpCache } from '../utils/serpCache.js';
import { scoreLeadRelevance } from './leadScorer.js';
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

const ACTIVITY_LOG_CAP = 250;

/** Persist + stream a human-readable pipeline step (for tuning / debugging). */
export async function jobActivity(
  jobId: string,
  publisher: Redis,
  step: string,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const at = new Date().toISOString();
  const doc: { at: string; step: string; message: string; meta?: Record<string, unknown> } = {
    at,
    step,
    message,
  };
  if (meta && Object.keys(meta).length > 0) doc.meta = meta;
  try {
    await ProspectingJob.findByIdAndUpdate(jobId, {
      $push: {
        activityLog: {
          $each: [doc],
          $slice: -ACTIVITY_LOG_CAP,
        },
      },
    });
    await publisher.publish(
      `job:progress:${jobId}`,
      JSON.stringify({ type: 'activity', ...doc }),
    );
  } catch (err) {
    logger.warn('[Pipeline] jobActivity failed', {
      jobId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
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

  await jobActivity(jobId, publisher, 'intent', 'Loaded parsed intent from job record.', {
    queryType: parsedIntent.queryType,
    industry: parsedIntent.industry,
    targetCount: parsedIntent.targetCount,
    desiredFields: parsedIntent.desiredFields,
    geography: parsedIntent.geography,
    namedEntityCount: parsedIntent.namedEntities?.length ?? 0,
    hasSerpApiKey: Boolean(env.SERPAPI_KEY),
  });

  // ── Stage 1: Entity resolution (named_entity_list + contact_lookup) ────
  if ((parsedIntent.queryType === 'named_entity_list' || parsedIntent.queryType === 'contact_lookup') && !parsedIntent.namedEntities?.length) {
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
    await jobActivity(jobId, publisher, 'entities', 'Resolved named entities for this query.', {
      count: parsedIntent.namedEntities?.length ?? 0,
      sample: (parsedIntent.namedEntities ?? []).slice(0, 8),
    });
  }

  // ── Stage 2: Build initial dork queries ─────────────────────────────
  await progress(jobId, publisher, 'collecting', 10, 'queryBuilder');
  let t = timer();
  const round1Queries = buildDorkQueries(parsedIntent);
  logger.info('[Pipeline] [2] queryBuilder done', { jobId, ms: t(), count: round1Queries.length });
  await jobActivity(jobId, publisher, 'dorks', `Built ${round1Queries.length} search queries (round 1).`, {
    queryCount: round1Queries.length,
    sampleQueries: round1Queries.slice(0, 6),
    ms: t(),
  });

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
      await jobActivity(jobId, publisher, 'entity_urls', `Injected ${entityUrls.length} high-priority entity URLs into crawl queue.`, {
        urls: entityUrls.slice(0, 12).map((r) => r.url),
      });
    }
  }

  const serpResults = await runSerpSearch(round1Queries);
  await serpCache.addLinks(jobId, serpResults);
  logger.info('[Pipeline] [3] SERP round 1 done → cached', {
    jobId, ms: t(), fetched: serpResults.length, cached: await serpCache.size(jobId),
  });
  await jobActivity(jobId, publisher, 'serp', `SERP round 1 returned ${serpResults.length} organic URLs (SerpAPI).`, {
    organicUrlCount: serpResults.length,
    cacheSizeAfter: await serpCache.size(jobId),
    ms: t(),
    sampleUrls: serpResults.slice(0, 8).map((r) => r.url),
  });

  // ── Stage 4–7: Iterative batch loop ─────────────────────────────────
  const BATCH_SIZE = 8;
  const MAX_SERP_ROUNDS = 3;
  const STOP_THRESHOLD = Math.max(1, parsedIntent.targetCount);
  const countryHint = countryNameToCode(parsedIntent.geography?.country);

  const allLeads: LeadRecord[] = [];
  const verifiedLeads: LeadRecord[] = [];
  const processedDomains = new Set<string>();
  let serpRound = 1;
  let shouldStop = false;
  let domainsScored = 0;
  let adaptiveDorkFired = false;

  const enrichPct = (done: number) =>
    Math.round(20 + Math.min(done / Math.max(1, STOP_THRESHOLD * 3), 1) * 60);

  await progress(jobId, publisher, 'enriching', 22, 'osintEnrichment');

  while (!shouldStop) {
    const batch = await serpCache.getNextBatch(jobId, BATCH_SIZE);

    if (batch.length === 0) {
      if (serpRound >= MAX_SERP_ROUNDS) {
        logger.info('[Pipeline] Max SERP rounds reached — stopping', { jobId, serpRound });
        await jobActivity(jobId, publisher, 'serp', 'Stopped: reached max SERP replenishment rounds.', {
          maxRounds: MAX_SERP_ROUNDS,
          serpRound,
        });
        break;
      }
      serpRound++;
      logger.info('[Pipeline] Cache empty — running SERP round', { jobId, serpRound });
      await jobActivity(jobId, publisher, 'serp', `URL queue empty — running SERP replenishment round ${serpRound}.`, {
        serpRound,
      });

      await progress(jobId, publisher, 'collecting', 18, 'serpSearch');
      const round2Queries = buildRound2Dorks(parsedIntent);
      const newResults = await runSerpSearch(round2Queries);
      if (newResults.length === 0) {
        logger.info('[Pipeline] SERP round returned nothing — stopping', { jobId, serpRound });
        await jobActivity(jobId, publisher, 'serp', 'SERP replenishment returned 0 URLs — stopping crawl loop.', {
          serpRound,
        });
        break;
      }
      await serpCache.addLinks(jobId, newResults);
      logger.info('[Pipeline] SERP replenished cache', { jobId, serpRound, added: newResults.length });
      await jobActivity(jobId, publisher, 'serp', `SERP round ${serpRound} added ${newResults.length} URLs to queue.`, {
        added: newResults.length,
        sampleUrls: newResults.slice(0, 6).map((r) => r.url),
      });
      await progress(jobId, publisher, 'enriching', 22, 'osintEnrichment');
      continue;
    }

    const filtered = batch.filter(r => passesHeuristicFilter(r, parsedIntent));
    logger.info('[Pipeline] Batch heuristic filter', {
      jobId, before: batch.length, after: filtered.length,
    });
    const keptUrls = new Set(filtered.map((r) => r.url));
    await jobActivity(jobId, publisher, 'filter', `Heuristic URL filter: ${batch.length} → ${filtered.length} URLs kept for this batch.`, {
      batchIn: batch.length,
      batchKept: filtered.length,
      sampleDropped: batch.filter((r) => !keptUrls.has(r.url)).slice(0, 4).map((r) => r.url),
    });

    if (filtered.length === 0) continue;

    let pageData: Awaited<ReturnType<typeof runPageScraper>> = [];
    try {
      pageData = await runPageScraper(filtered, publisher, jobId);
    } catch (err) {
      logger.warn('[Pipeline] pageScraper failed for batch', {
        jobId, err: err instanceof Error ? err.message : String(err),
      });
      await jobActivity(jobId, publisher, 'scrape', `Playwright page scrape failed for batch: ${err instanceof Error ? err.message : String(err)}`, {});
    }

    await jobActivity(jobId, publisher, 'scrape', `Playwright scraped ${pageData.length} page result(s); extracting emails/phones from HTML.`, {
      pages: pageData.filter((p) => p.url !== 'collected-files').length,
      fileLinksFound: pageData.reduce((n, p) => n + (p.fileUrls?.length ?? 0), 0),
    });

    const fileUrls = pageData.flatMap(p => p.fileUrls);
    let fileData: Awaited<ReturnType<typeof runFileExtractor>> = [];
    if (fileUrls.length > 0) {
      try {
        fileData = await runFileExtractor(fileUrls);
      } catch (err) {
        logger.warn('[Pipeline] fileExtractor failed for batch', {
          jobId, err: err instanceof Error ? err.message : String(err),
        });
        await jobActivity(jobId, publisher, 'files', `File extraction error: ${err instanceof Error ? err.message : String(err)}`, {
          fileUrlCount: fileUrls.length,
        });
      }
    }
    if (fileUrls.length > 0) {
      await jobActivity(jobId, publisher, 'files', `Processed ${fileUrls.length} file URL(s); ${fileData.length} yielded text/emails.`, {
        fileUrlsAttempted: fileUrls.length,
        filesExtracted: fileData.length,
      });
    }

    const batchDomainMap = new Map<string, {
      emails: string[]; phones: string[]; pageUrls: string[];
      linkedinUrl?: string; companyName?: string;
      contacts: ContactCandidate[];
    }>();

    for (const page of pageData) {
      if (page.url === 'collected-files') continue;
      const domain = getDomain(page.url);
      if (processedDomains.has(domain)) continue;
      const existing = batchDomainMap.get(domain) ?? { emails: [], phones: [], pageUrls: [], contacts: [] };
      existing.emails.push(...page.emails);
      existing.phones.push(...page.phones);
      existing.pageUrls.push(page.url);
      existing.contacts.push(...page.extractedContacts);
      if (page.linkedinUrl && !existing.linkedinUrl) existing.linkedinUrl = page.linkedinUrl;
      if (page.companyName && !existing.companyName) existing.companyName = page.companyName;
      batchDomainMap.set(domain, existing);
    }
    for (const file of fileData) {
      const domain = getDomain(file.url);
      if (processedDomains.has(domain)) continue;
      const existing = batchDomainMap.get(domain) ?? { emails: [], phones: [], pageUrls: [], contacts: [] };
      existing.emails.push(...file.emails);
      existing.phones.push(...file.phones);
      batchDomainMap.set(domain, existing);
    }

    if (batchDomainMap.size > 0) {
      await jobActivity(jobId, publisher, 'aggregate', `Aggregated scrape + file hits into ${batchDomainMap.size} unique domain(s) in this batch.`, {
        domains: [...batchDomainMap.keys()].slice(0, 15),
      });
    }

    let batchAiAccepted = 0;
    const batchRejectSamples: Array<{ domain: string; score: number; reason: string }> = [];

    for (const [domain, data] of batchDomainMap.entries()) {
      processedDomains.add(domain);

      const osint = await enrichDomain(domain).catch(() => ({}));
      const detectedEmails = await detectEmails(
        domain, data.emails, (osint as { hasMx?: boolean }).hasMx ?? false
      ).catch(() => []);
      const normalizedPhones = normalizePhones([...new Set(data.phones)], countryHint);

      // AI-extracted contacts are primary; regex hits fill gaps
      const aiEmails = data.contacts
        .filter(c => c.email && c.confidence >= 0.4)
        .map(c => ({
          address: c.email!.toLowerCase().trim(),
          type: (c.name ? 'business' : 'generic') as 'business' | 'generic',
          confidence: c.confidence,
          source: 'ai_extracted' as const,
          name: c.name,
          title: c.title,
          department: c.department,
        }));
      const aiEmailAddrs = new Set(aiEmails.map(e => e.address));
      const regexEmails = detectedEmails
        .filter(e => !aiEmailAddrs.has(e.address.toLowerCase()))
        .map(e => ({ address: e.address, type: e.type, confidence: e.confidence, source: e.source }));
      const mergedEmails = [...aiEmails, ...regexEmails];

      const aiPhones = data.contacts
        .filter(c => c.phone && c.confidence >= 0.4)
        .map(c => ({
          raw: c.phone!,
          normalized: undefined as string | undefined,
          type: undefined as string | undefined,
          countryCode: undefined as string | undefined,
          source: 'ai_extracted' as const,
        }));
      const aiPhoneDigits = new Set(aiPhones.map(p => p.raw.replace(/\D/g, '')));
      const regexPhones = normalizedPhones
        .filter(p => p.isValid && !aiPhoneDigits.has((p.normalized ?? p.raw).replace(/\D/g, '')))
        .map(p => ({
          raw: p.raw, normalized: p.normalized, type: p.type,
          countryCode: p.countryCode, source: 'scraped' as const,
        }));
      const mergedPhones = [...aiPhones, ...regexPhones];

      const namedContacts = data.contacts.filter(c => c.name && c.name.length > 1);
      const contactSummary = namedContacts.length > 0 ? {
        totalContacts: namedContacts.length,
        topContact: namedContacts[0] ? {
          fullName: namedContacts[0].name!,
          title: namedContacts[0].title ?? '',
          seniority: '',
        } : undefined,
      } : undefined;

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
        emails: mergedEmails,
        phones: mergedPhones,
        contactSummary,
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

      // Inline AI quality gate — only count leads the AI believes are good
      const aiScore = await scoreLeadRelevance(lead, parsedIntent);
      lead.rankScore = Math.round(aiScore.score * 100);
      allLeads.push(lead);
      domainsScored++;

      if (aiScore.isVerified) {
        verifiedLeads.push(lead);
        batchAiAccepted++;
        logger.info('[Pipeline] Lead verified by AI', {
          jobId, domain, score: aiScore.score, reason: aiScore.reason,
          verifiedCount: verifiedLeads.length, target: STOP_THRESHOLD,
        });
      } else {
        logger.debug('[Pipeline] Lead rejected by AI', {
          jobId, domain, score: aiScore.score, reason: aiScore.reason,
        });
        if (batchRejectSamples.length < 8) {
          batchRejectSamples.push({
            domain,
            score: aiScore.score,
            reason: aiScore.reason,
          });
        }
      }

      // Adaptive strategy: if pass rate < 25% after 5+ domains, fire round2 dorks immediately
      const passRate = domainsScored >= 5 ? verifiedLeads.length / domainsScored : 1;
      if (!adaptiveDorkFired && domainsScored >= 5 && passRate < 0.25) {
        adaptiveDorkFired = true;
        logger.info('[Pipeline] Low AI pass rate — firing adaptive round2 dorks', {
          jobId, passRate, domainsScored, verifiedLeads: verifiedLeads.length,
        });
        const adaptiveQueries = buildRound2Dorks(parsedIntent);
        const adaptiveResults = await runSerpSearch(adaptiveQueries).catch(() => []);
        if (adaptiveResults.length > 0) {
          await serpCache.addLinks(jobId, adaptiveResults);
        }
        await jobActivity(jobId, publisher, 'adaptive', 'Low AI pass rate — fired adaptive round-2 style dorks and merged new SERP URLs.', {
          passRate,
          domainsScored,
          adaptiveUrlsAdded: adaptiveResults.length,
        });
      }

      if (verifiedLeads.length >= STOP_THRESHOLD) {
        logger.info('[Pipeline] Quality target reached — stopping loop', {
          jobId, verifiedLeads: verifiedLeads.length, STOP_THRESHOLD,
        });
        await jobActivity(jobId, publisher, 'stop', `Quality target met: ${verifiedLeads.length} AI-verified lead(s) (target ${STOP_THRESHOLD}).`, {
          verifiedLeads: verifiedLeads.length,
          target: STOP_THRESHOLD,
        });
        shouldStop = true;
        break;
      }
    }

    if (batchDomainMap.size > 0) {
      const rejected = batchDomainMap.size - batchAiAccepted;
      await jobActivity(
        jobId,
        publisher,
        'ai_gate',
        `AI relevance gate (batch): ${batchAiAccepted} accepted, ${rejected} rejected.`,
        {
          accepted: batchAiAccepted,
          rejected,
          rejectSamples: batchRejectSamples,
          verifiedRunningTotal: verifiedLeads.length,
          target: STOP_THRESHOLD,
        },
      );
    }

    // Publish progress once per batch (not per domain)
    await ProspectingJob.findByIdAndUpdate(jobId, {
      'progress.leadsFoundSoFar': verifiedLeads.length,
    });
    await publisher.publish(
      `job:progress:${jobId}`,
      JSON.stringify({ type: 'progress', leadsFoundSoFar: verifiedLeads.length })
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
  // Use allLeads (not just verifiedLeads) so near-misses are still deduplicated and
  // written — they just rank lower since their rankScore was set by the AI scorer.
  logger.info('[Pipeline] Deduplication starting', {
    jobId, total: allLeads.length, verified: verifiedLeads.length,
  });
  await jobActivity(jobId, publisher, 'dedupe', `Starting deduplication: ${allLeads.length} raw lead(s), ${verifiedLeads.length} passed AI gate.`, {
    rawLeads: allLeads.length,
    aiVerified: verifiedLeads.length,
    uniqueDomainsProcessed: processedDomains.size,
  });
  await progress(jobId, publisher, 'deduplicating', 85, 'deduplication');
  const deduped = deduplicateLeads(allLeads);
  await jobActivity(jobId, publisher, 'dedupe', `Deduplication finished: ${deduped.length} lead record(s) (includes duplicates flagged).`, {
    afterDedupe: deduped.length,
  });

  // ── Stage 9: Ranking ─────────────────────────────────────────────────
  await progress(jobId, publisher, 'deduplicating', 92, 'ranking');
  const ranked = rankLeads(deduped, parsedIntent.desiredFields);
  await jobActivity(jobId, publisher, 'rank', `Ranked ${ranked.length} lead(s) against desired fields.`, {
    desiredFields: parsedIntent.desiredFields,
    count: ranked.length,
  });

  // ── Stage 10: Write to DB ────────────────────────────────────────────
  await progress(jobId, publisher, 'deduplicating', 97, 'leadWrite');
  await writeLeads(ranked, jobId, workspaceId, publisher);
  await jobActivity(jobId, publisher, 'persist', 'Upserted leads into workspace collection and updated job result.', {
    writtenApprox: ranked.filter((l) => !l.isDuplicate).length,
  });

  // ── Stage 11: AI Qualification ───────────────────────────────────────
  await progress(jobId, publisher, 'complete', 99, 'qualification');
  await jobActivity(jobId, publisher, 'qualify', 'Running batch AI qualification (qualified vs dust) on written leads…', {});
  await runLeadQualifier(jobId, workspaceId, publisher);
  await jobActivity(jobId, publisher, 'done', 'Pipeline finished (qualification pass scheduled / complete).', {
    totalRanked: ranked.length,
  });

  logger.info('[Pipeline] Job complete', { jobId, totalLeads: ranked.length });
  } finally {
    await serpCache.clear(jobId).catch(() => {});
    cacheRedis.quit().catch(() => {});
  }
}
