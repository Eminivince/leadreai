import { runSerpSearch } from '../serpScraper.js';
import { logger } from '../../utils/logger.js';

export interface WebResult {
  url: string;
  title: string;
  snippet: string;
}

export async function searchWeb(query: string, site?: string, limit = 5): Promise<WebResult[]> {
  const fullQuery = site ? `${query} site:${site}` : query;
  try {
    const results = await runSerpSearch([fullQuery]);
    return results.slice(0, limit).map(r => ({
      url: r.url,
      title: r.title,
      snippet: r.snippet,
    }));
  } catch (err) {
    logger.warn('[searchWeb] failed', { query: fullQuery, err: err instanceof Error ? err.message : String(err) });
    return [];
  }
}
