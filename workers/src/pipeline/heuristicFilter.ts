import type { SerpResult } from './serpScraper.js';
import type { ParsedIntent } from '@leadreai/shared';

// Domains that are aggregators/directories, never direct company pages
const SKIP_DOMAIN_FRAGMENTS = [
  'wikipedia.org', 'linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com',
  'youtube.com', 'yelp.com', 'yellowpages', 'tripadvisor', 'glassdoor', 'indeed.com',
  'crunchbase.com', 'bloomberg.com', 'reuters.com', 'forbes.com', 'statista.com',
  'quora.com', 'reddit.com', 'trustpilot', 'clutch.co', 'g2.com', 'capterra.com',
];

// Title/snippet patterns that indicate aggregator pages rather than company homepages
const SKIP_TITLE_PATTERNS = [
  /\btop \d+\b/i,
  /\bbest \d+\b/i,
  /\blist of\b/i,
  /\bdirectory\b/i,
  /\bassociation\b/i,
  /\bwikipedia\b/i,
  /\breviews?\b/i,
];

function getDomain(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); }
  catch { return url.toLowerCase(); }
}

/**
 * Returns true if the SerpResult is worth scraping given the parsed intent.
 * This is a fast, zero-cost pre-filter — not a quality gate.
 */
export function passesHeuristicFilter(
  result: SerpResult,
  intent: ParsedIntent,
): boolean {
  const domain = getDomain(result.url);
  const text = `${result.title} ${result.snippet}`.toLowerCase();

  // Reject known aggregator domains
  if (SKIP_DOMAIN_FRAGMENTS.some(frag => domain.includes(frag))) return false;

  // Reject aggregator-style titles (unless this is an entity dork where the URL IS the entity)
  if (intent.queryType !== 'named_entity_list') {
    if (SKIP_TITLE_PATTERNS.some(pat => pat.test(result.title))) return false;
  }

  // For named_entity_list: require at least one entity name to appear in the text OR the domain
  if (
    intent.queryType === 'named_entity_list' &&
    intent.namedEntities &&
    intent.namedEntities.length > 0
  ) {
    const cleanedDomain = domain.replace(/[^a-z0-9]/g, '');
    const entityMatch = intent.namedEntities.some(name => {
      const nameLower = name.toLowerCase();
      return text.includes(nameLower) || cleanedDomain.includes(nameLower.replace(/[^a-z0-9]/g, ''));
    });
    if (!entityMatch) return false;
  }

  // For all query types: skip if neither industry keyword nor geographic hint appears in text
  const industryWords = intent.industry.toLowerCase().split(/\s+/);
  const geo = [intent.geography.country, intent.geography.city, intent.geography.state]
    .filter(Boolean)
    .map(s => s!.toLowerCase());

  const industryHit = industryWords.some(w => w.length > 3 && text.includes(w));
  const geoHit = geo.some(g => text.includes(g));

  // Require EITHER industry OR geo keyword in the snippet/title
  if (!industryHit && !geoHit) return false;

  return true;
}
