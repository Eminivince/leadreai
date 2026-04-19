/**
 * Given a company name (and optional country), produce a ranked list of plausible
 * domain candidates. Used as a last-resort step when we failed to find the company's
 * real website via SERP. The caller should MX-verify each candidate before treating
 * it as a live target.
 */

const COMPANY_SUFFIXES = /\b(ltd|limited|inc|incorporated|llc|corp|corporation|plc|co|group|holdings|enterprises|services|company|sa|gmbh|pty)\b/gi;

const COUNTRY_TO_TLDS: Record<string, string[]> = {
  nigeria: ['.com.ng', '.ng', '.africa'],
  'united kingdom': ['.co.uk', '.uk'],
  uk: ['.co.uk', '.uk'],
  britain: ['.co.uk', '.uk'],
  'united states': ['.com'],
  usa: ['.com'],
  us: ['.com'],
  canada: ['.ca'],
  australia: ['.com.au', '.au'],
  india: ['.in', '.co.in'],
  germany: ['.de'],
  france: ['.fr'],
  spain: ['.es'],
  italy: ['.it'],
  'south africa': ['.co.za', '.africa'],
  kenya: ['.co.ke', '.ke'],
  ghana: ['.com.gh', '.gh'],
  singapore: ['.com.sg', '.sg'],
  'hong kong': ['.com.hk', '.hk'],
};

function countryTlds(country?: string): string[] {
  if (!country) return [];
  return COUNTRY_TO_TLDS[country.toLowerCase().trim()] ?? [];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(COMPANY_SUFFIXES, ' ').trim().replace(/[^a-z0-9]/g, '');
}

export function guessCompanyDomains(entityName: string, country?: string): string[] {
  if (!entityName) return [];
  const fullSlug = slugify(entityName);
  if (fullSlug.length < 3) return [];

  // Also try a shortened slug from just the first significant word, e.g.,
  // "fur alle limited" → "fur" (will usually be too short, will be filtered)
  // "axion financial group" → "axion"
  const words = entityName.toLowerCase().replace(COMPANY_SUFFIXES, ' ').trim().split(/\s+/).filter(Boolean);
  const firstWordSlug = words[0] ? words[0].replace(/[^a-z0-9]/g, '') : '';
  // And a 2-word concatenation where applicable: "fur alle" → "furalle"
  const twoWordSlug = words.length >= 2 ? (words[0]! + words[1]!).replace(/[^a-z0-9]/g, '') : '';

  // Prefer country TLDs first (a Nigerian SME is more likely to use .com.ng than .com)
  const tlds = [...new Set([...countryTlds(country), '.com', '.co', '.net', '.org', '.biz'])];
  const slugs = [...new Set([fullSlug, twoWordSlug, firstWordSlug].filter(s => s.length >= 4))];

  const candidates: string[] = [];
  for (const slug of slugs) {
    for (const tld of tlds) {
      candidates.push(`${slug}${tld}`);
    }
    // Common suffix variants
    candidates.push(`${slug}ltd.com`);
    candidates.push(`${slug}-ltd.com`);
    candidates.push(`${slug}group.com`);
  }

  return [...new Set(candidates)].slice(0, 16);
}
