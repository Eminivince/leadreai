import type { ParsedIntent } from '@leadreai/shared';

/** Build dorks targeting specific named entities (for named_entity_list queries). */
function buildEntityDorks(entityNames: string[], geography: ParsedIntent['geography'], desiredFields: string[]): string[] {
  const country = geography.country ?? '';
  const city = geography.city ?? geography.state ?? '';
  const queries: string[] = [];

  for (const name of entityNames.slice(0, 10)) {
    // Direct company website contact page
    queries.push(`"${name}" contact email`);
    if (country) queries.push(`"${name}" "${country}" contact`);
    // Try to find their domain
    queries.push(`"${name}" official website ${city || country}`);
    if (desiredFields.includes('officePhone') || desiredFields.includes('mobilePhone')) {
      queries.push(`"${name}" phone number ${country}`);
    }
  }

  // Drop any query that contains "" (empty quoted string from a missing country/city)
  return [...new Set(queries.filter(q => !q.includes('""')))].slice(0, 20);
}

/** Round 1 dorks — contact pages, directories, files. */
function buildRound1Dorks(intent: ParsedIntent): string[] {
  const { industry, geography, keywords, desiredFields } = intent;
  const country = (geography.country ?? '').trim();
  const city = ((geography.city ?? geography.state) ?? '').trim();
  const loc = city || country;
  const queries: string[] = [];

  queries.push(`"${industry}" "${country}" "contact us" email`);
  if (city) queries.push(`"${industry}" "${city}" contact email`);
  queries.push(`"${industry}" "${country}" "contact" "@"`);
  queries.push(`"${industry}" directory "${country}" members`);
  queries.push(`"${industry}" association members "${country}"`);
  queries.push(`inurl:directory "${industry}" "${country}"`);
  queries.push(`inurl:staff "${industry}" "${country}"`);
  queries.push(`inurl:team "${industry}" "${loc || country}"`);
  queries.push(`"${industry}" "${country}" "our team" email`);

  if (desiredFields.includes('businessEmail') || desiredFields.includes('officePhone')) {
    queries.push(`"${industry}" "${country}" contact email filetype:pdf`);
    queries.push(`"${industry}" directory "${country}" filetype:xls`);
    queries.push(`"${industry}" "${country}" filetype:xlsx`);
  }

  queries.push(`site:linkedin.com/company "${industry}" "${country}"`);

  for (const kw of keywords.slice(0, 2)) {
    queries.push(`"${kw}" "${country}" contact email`);
  }

  if (desiredFields.includes('officePhone') || desiredFields.includes('mobilePhone')) {
    queries.push(`"${industry}" "${country}" "phone" "address" -site:linkedin.com`);
  }

  return [...new Set(queries.filter(q => !q.includes('""')))].slice(0, 15);
}

/** Round 2 dorks — different angles: news, press releases, regulatory filings. */
export function buildRound2Dorks(intent: ParsedIntent): string[] {
  const { industry, geography, keywords } = intent;
  const country = (geography.country ?? '').trim();
  const city = ((geography.city ?? geography.state) ?? '').trim();
  const queries: string[] = [];

  // News/press release sources often list company contact details
  queries.push(`"${industry}" "${country}" "press release" email`);
  queries.push(`"${industry}" "${country}" news contact`);
  queries.push(`site:prnewswire.com "${industry}" "${country}"`);
  queries.push(`site:businesswire.com "${industry}" "${country}"`);

  // Government / regulatory filings with contact data
  queries.push(`"${industry}" "${country}" "registered" contact filetype:pdf`);
  queries.push(`"${industry}" regulation "${country}" members list`);

  // Event / conference attendee lists
  queries.push(`"${industry}" conference "${country}" attendees speakers`);
  queries.push(`"${industry}" summit "${country}" participants contact`);

  // Trade publications
  queries.push(`"${industry}" magazine "${country}" companies`);
  queries.push(`"${industry}" "${country}" annual report contacts`);

  if (city) {
    queries.push(`"${industry}" "${city}" business directory`);
    queries.push(`"${industry}" "${city}" companies list`);
  }

  for (const kw of keywords.slice(0, 3)) {
    queries.push(`"${kw}" "${country}" company email contact`);
  }

  return [...new Set(queries.filter(q => !q.includes('""')))].slice(0, 12);
}

/**
 * Main entry point. Builds the first-round dork queries.
 * For named_entity_list with resolved entities, uses entity-targeted dorks.
 * For demographic queries, uses the keyword/geography dork approach.
 */
export function buildDorkQueries(intent: ParsedIntent): string[] {
  if (
    (intent.queryType === 'named_entity_list' || intent.queryType === 'contact_lookup') &&
    intent.namedEntities && intent.namedEntities.length > 0
  ) {
    return buildEntityDorks(intent.namedEntities, intent.geography, intent.desiredFields);
  }
  return buildRound1Dorks(intent);
}
