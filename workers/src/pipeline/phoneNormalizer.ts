import { parsePhoneNumberFromString, type PhoneNumber } from 'libphonenumber-js';
import { logger } from '../utils/logger.js';

export interface NormalizedPhone {
  raw: string;
  normalized?: string;   // E.164 format: +2348012345678
  national?: string;     // national format: 0801 234 5678
  type?: 'office' | 'mobile' | 'fax';
  countryCode?: string;
  isValid: boolean;
}

export function normalizePhones(rawPhones: string[], countryHint?: string): NormalizedPhone[] {
  const results: NormalizedPhone[] = [];
  const seen = new Set<string>();

  for (const raw of rawPhones) {
    const cleaned = raw.trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);

    try {
      const parsed: PhoneNumber | undefined = parsePhoneNumberFromString(
        cleaned,
        countryHint as Parameters<typeof parsePhoneNumberFromString>[1],
      );

      if (parsed?.isValid()) {
        const phoneType = parsed.getType();
        results.push({
          raw: cleaned,
          normalized: parsed.format('E.164'),
          national: parsed.formatNational(),
          type: phoneType === 'FIXED_LINE' ? 'office'
            : phoneType === 'MOBILE' ? 'mobile'
            : phoneType === 'FIXED_LINE_OR_MOBILE' ? 'office'
            : undefined,
          countryCode: parsed.country,
          isValid: true,
        });
      } else {
        results.push({ raw: cleaned, isValid: false });
      }
    } catch {
      results.push({ raw: cleaned, isValid: false });
    }
  }

  logger.info('phoneNormalizer: normalization complete', { total: rawPhones.length, valid: results.filter(r => r.isValid).length });
  return results;
}

// Convert ISO country name to 2-letter code (best-effort)
export function countryNameToCode(name?: string | null): string | undefined {
  if (!name) return undefined;
  const MAP: Record<string, string> = {
    'nigeria': 'NG', 'kenya': 'KE', 'ghana': 'GH', 'south africa': 'ZA',
    'united states': 'US', 'usa': 'US', 'united kingdom': 'GB', 'uk': 'GB',
    'canada': 'CA', 'australia': 'AU', 'india': 'IN', 'germany': 'DE',
    'france': 'FR', 'brazil': 'BR', 'egypt': 'EG', 'ethiopia': 'ET',
    'tanzania': 'TZ', 'uganda': 'UG', 'rwanda': 'RW', 'senegal': 'SN',
  };
  return MAP[name.toLowerCase()];
}
