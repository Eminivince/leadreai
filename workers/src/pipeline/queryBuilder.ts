import type { ParsedIntent } from '@leadreai/shared';

export function buildDorkQueries(intent: ParsedIntent): string[] {
  // TODO(Task 5): Branch on intent.queryType — use buildEntityDorks() for named_entity_list and contact_lookup
  const { industry, geography, keywords, desiredFields } = intent;
  const country = geography.country ?? '';
  const city = geography.city ?? geography.state ?? '';
  const loc = city || country;

  const queries: string[] = [];

  // Core contact page dorks
  queries.push(`"${industry}" "${country}" "contact us" email`);
  if (city) queries.push(`"${industry}" "${city}" contact email`);
  queries.push(`"${industry}" "${country}" "contact" "@"`);

  // Directory / membership dorks
  queries.push(`"${industry}" directory "${country}" members`);
  queries.push(`"${industry}" association members "${country}"`);
  queries.push(`inurl:directory "${industry}" "${country}"`);

  // Staff / team pages
  queries.push(`inurl:staff "${industry}" "${country}"`);
  queries.push(`inurl:team "${industry}" "${loc || country}"`);
  queries.push(`"${industry}" "${country}" "our team" email`);

  // File-based dorks (only if email/phone desired)
  if (desiredFields.includes('businessEmail') || desiredFields.includes('officePhone')) {
    queries.push(`"${industry}" "${country}" contact email filetype:pdf`);
    queries.push(`"${industry}" directory "${country}" filetype:xls`);
    queries.push(`"${industry}" "${country}" filetype:xlsx`);
  }

  // LinkedIn company pages
  queries.push(`site:linkedin.com/company "${industry}" "${country}"`);

  // Keyword-enhanced dorks
  for (const kw of keywords.slice(0, 2)) {
    queries.push(`"${kw}" "${country}" contact email`);
  }

  // Phone-specific
  if (desiredFields.includes('officePhone') || desiredFields.includes('mobilePhone')) {
    queries.push(`"${industry}" "${country}" "phone" "address" -site:linkedin.com`);
  }

  // Deduplicate and cap at 15
  return [...new Set(queries)].slice(0, 15);
}
