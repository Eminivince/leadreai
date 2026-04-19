import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { runSerpSearch } from './serpScraper.js';
import type { ParsedIntent } from '@leadreai/shared';

const ENTITY_EXTRACT_PROMPT = `You are an expert at identifying company or organization names from web search results.

Given a search query and a list of result snippets, extract the specific company or organization names that directly answer the query.

Rules:
- Return ONLY a JSON array of strings: ["Company A", "Company B", ...]
- Include only actual company/organization names (not generic terms, adjectives, or descriptions)
- Prefer official/registered names over common abbreviations
- Include at most 20 names (the top ones by apparent prominence)
- If no specific companies can be identified, return []
- Output ONLY the JSON array, no markdown, no explanation`;

async function extractEntityNamesWithAI(
  searchQuery: string,
  snippets: string[],
  targetCount: number,
): Promise<string[]> {
  if (!env.OPENROUTER_API_KEY || snippets.length === 0) {
    logger.warn('[entityResolver] No API key or snippets — skipping AI extraction');
    return [];
  }

  const userMessage = `Search query: "${searchQuery}"\n\nSearch result snippets:\n${snippets.slice(0, 15).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nExtract the top ${targetCount * 2} company/organization names from these results.`;

  let res: Response;
  try {
    res = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://leadreai.app',
        'X-Title': 'LeadreAI',
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        max_tokens: 512,
        messages: [
          { role: 'system', content: ENTITY_EXTRACT_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }),
    });
  } catch (err) {
    logger.warn('[entityResolver] OpenRouter fetch failed', { err });
    return [];
  }

  if (!res.ok) {
    logger.warn('[entityResolver] OpenRouter non-OK response', { status: res.status });
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json().catch(() => null);
  const content: string = json?.choices?.[0]?.message?.content ?? '';

  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, targetCount * 2);
  } catch {
    return [];
  }
}

/**
 * For named_entity_list queries with namedEntities === null:
 * Run a SerpAPI search to discover the specific companies matching the query,
 * then use AI to extract their names from the snippets.
 *
 * Returns a list of resolved company names (may be empty if lookup fails — pipeline continues gracefully).
 */
export async function resolveNamedEntities(intent: ParsedIntent): Promise<string[]> {
  if (intent.queryType !== 'named_entity_list') return [];
  // If names were already specified in the query, use them directly
  if (intent.namedEntities && intent.namedEntities.length > 0) {
    logger.info('[entityResolver] Named entities already provided — skipping resolution', {
      count: intent.namedEntities.length,
    });
    return intent.namedEntities as string[];
  }

  const { industry, geography, targetCount } = intent;
  const location = [geography.city, geography.state, geography.country].filter(Boolean).join(', ');
  const searchQuery = `top ${targetCount} ${industry} in ${location}`;

  logger.info('[entityResolver] Resolving named entities via SerpAPI', { searchQuery });

  const results = await runSerpSearch([searchQuery]).catch((err) => {
    logger.warn('[entityResolver] SerpAPI failed during entity resolution', { err });
    return [];
  });

  if (results.length === 0) {
    logger.warn('[entityResolver] No SerpAPI results for entity resolution');
    return [];
  }

  const snippets = results.map(r => `${r.title}: ${r.snippet}`);
  const names = await extractEntityNamesWithAI(searchQuery, snippets, targetCount);

  logger.info('[entityResolver] Resolved entity names', { count: names.length, names });
  return names;
}
