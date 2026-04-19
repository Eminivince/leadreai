import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface SerpResult {
  url: string;
  title: string;
  snippet: string;
  isFilePath: boolean;
  engine?: 'google' | 'bing' | 'duckduckgo';
}

export type SerpEngine = 'google' | 'bing' | 'duckduckgo';

const FILE_EXTENSIONS = /\.(pdf|docx?|xlsx?)(\?.*)?$/i;
const SERPAPI_BASE = 'https://serpapi.com/search.json';
const QUERY_TIMEOUT_MS = 15_000;
const INTER_QUERY_DELAY_MS = 500;

interface SerpApiOrganic {
  link?: string;
  title?: string;
  snippet?: string;
}

async function callSerpApi(query: string, engine: SerpEngine): Promise<SerpApiOrganic[]> {
  const params = new URLSearchParams({
    engine,
    q: query,
    api_key: env.SERPAPI_KEY!,
  });
  if (engine === 'google') { params.set('num', '10'); params.set('hl', 'en'); }
  else if (engine === 'bing') { params.set('count', '10'); }
  else if (engine === 'duckduckgo') { params.set('kl', 'us-en'); }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
  try {
    const res = await fetch(`${SERPAPI_BASE}?${params.toString()}`, { signal: controller.signal });
    if (!res.ok) {
      logger.warn('[serpScraper] non-200', { engine, status: res.status });
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    return (data?.organic_results as SerpApiOrganic[] | undefined) ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function runSerpSearch(queries: string[], engine: SerpEngine = 'google'): Promise<SerpResult[]> {
  if (!env.SERPAPI_KEY) {
    logger.warn('SERPAPI_KEY not set — skipping SerpAPI search');
    return [];
  }

  const seen = new Set<string>();
  const results: SerpResult[] = [];

  for (const query of queries) {
    try {
      const organic = await callSerpApi(query, engine);
      for (const r of organic) {
        const url = r.link;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        results.push({
          url,
          title: r.title ?? '',
          snippet: r.snippet ?? '',
          isFilePath: FILE_EXTENSIONS.test(url),
          engine,
        });
      }
      await new Promise(resolve => setTimeout(resolve, INTER_QUERY_DELAY_MS));
    } catch (err) {
      logger.warn('SerpAPI query failed', { query, engine, err: err instanceof Error ? err.message : String(err) });
    }
  }

  logger.info('SerpAPI search complete', { queries: queries.length, results: results.length, engine });
  return results;
}

/**
 * Run the same queries across multiple engines, merging + deduping results.
 * Useful when Google returns few results (blocked, niche query, non-English market).
 * Engines are tried in order; if earlier engines exceed `sufficientCount`, later ones are skipped.
 */
export async function runMultiEngineSearch(
  queries: string[],
  opts: { engines?: SerpEngine[]; sufficientCount?: number } = {},
): Promise<SerpResult[]> {
  const engines = opts.engines ?? ['google', 'bing', 'duckduckgo'];
  const sufficient = opts.sufficientCount ?? 15;

  const merged = new Map<string, SerpResult>();
  const enginesUsed: SerpEngine[] = [];
  for (const engine of engines) {
    enginesUsed.push(engine);
    const batch = await runSerpSearch(queries, engine);
    for (const r of batch) {
      if (!merged.has(r.url)) merged.set(r.url, r);
    }
    if (merged.size >= sufficient) {
      logger.info('[serpScraper] multi-engine: sufficient results, skipping remaining engines', {
        stoppedAfter: engine, have: merged.size,
      });
      break;
    }
  }

  const results = [...merged.values()];
  logger.info('[serpScraper] multi-engine complete', {
    enginesUsed: enginesUsed.length,
    totalResults: results.length,
  });
  return results;
}
