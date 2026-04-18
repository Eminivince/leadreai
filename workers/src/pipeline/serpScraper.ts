import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface SerpResult {
  url: string;
  title: string;
  snippet: string;
  isFilePath: boolean; // true if URL ends in .pdf/.doc/.docx/.xls/.xlsx
}

const FILE_EXTENSIONS = /\.(pdf|docx?|xlsx?)(\?.*)?$/i;

export async function runSerpSearch(queries: string[]): Promise<SerpResult[]> {
  if (!env.SERPAPI_KEY) {
    logger.warn('SERPAPI_KEY not set — skipping SerpAPI search');
    return [];
  }

  const { GoogleSearch } = await import('google-search-results-nodejs');
  const seen = new Set<string>();
  const results: SerpResult[] = [];

  for (const query of queries) {
    try {
      const search = new GoogleSearch(env.SERPAPI_KEY);
      const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
        search.json(
          { q: query, num: 10, hl: 'en' },
          (result: Record<string, unknown>) => resolve(result)
        );
        setTimeout(() => reject(new Error('SerpAPI timeout')), 15000);
      });

      const organicResults = (data['organic_results'] as Array<{
        link?: string; title?: string; snippet?: string;
      }> | undefined) ?? [];

      for (const r of organicResults) {
        const url = r.link;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        results.push({
          url,
          title: r.title ?? '',
          snippet: r.snippet ?? '',
          isFilePath: FILE_EXTENSIONS.test(url),
        });
      }

      // Small delay between queries to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      logger.warn('SerpAPI query failed', { query, err });
    }
  }

  logger.info('SerpAPI search complete', { queries: queries.length, results: results.length });
  return results;
}
