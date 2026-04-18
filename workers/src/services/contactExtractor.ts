import type { Page } from 'playwright';
import { logger } from '../utils/logger.js';

export interface ExtractedContact {
  fullName: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  emails: Array<{ address: string; type: 'pattern_inferred'; confidence: number; verified: boolean; source: string }>;
  sources: Array<{ url: string; type: 'company_website'; scrapedAt: Date; confidence: number }>;
}

const TEAM_PATHS = ['/team', '/about', '/about-us', '/people', '/leadership'];

async function tryPage(page: Page, url: string): Promise<ExtractedContact[]> {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
    if (!resp || resp.status() >= 400) return [];

    const contacts = await page.evaluate(() => {
      const results: Array<{ name: string; title?: string }> = [];

      // 1. JSON-LD Person schemas
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent ?? '');
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (item['@type'] === 'Person' && item.name) {
              results.push({ name: item.name, title: item.jobTitle });
            }
          }
        } catch { /* ignore malformed JSON-LD */ }
      }

      // 2. data-name / data-title attributes
      document.querySelectorAll('[data-name]').forEach(el => {
        const name = (el as HTMLElement).dataset['name'];
        const title = (el as HTMLElement).dataset['title'];
        if (name) results.push({ name, title });
      });

      // 3. Heading + paragraph pairs (name + title heuristic)
      const headings = Array.from(document.querySelectorAll('h2, h3, h4'));
      for (const h of headings) {
        const text = h.textContent?.trim() ?? '';
        // Name heuristic: 2-4 words, each capitalised, no common stop-words
        if (/^[A-Z][a-z]+ [A-Z][a-z]+/.test(text) && text.split(' ').length <= 4) {
          const next = h.nextElementSibling;
          const titleText = next?.textContent?.trim();
          if (titleText && titleText.length < 80) {
            results.push({ name: text, title: titleText });
          }
        }
      }

      return results;
    });

    return contacts.map(({ name, title }) => {
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ') || undefined;
      return {
        fullName: name,
        firstName,
        lastName,
        title,
        emails: [],
        sources: [{ url, type: 'company_website' as const, scrapedAt: new Date(), confidence: 0.7 }],
      };
    });
  } catch {
    return [];
  }
}

function inferEmails(contact: ExtractedContact, domain: string): void {
  if (!contact.firstName) return;
  const first = contact.firstName.toLowerCase().replace(/[^a-z]/g, '');
  const last = contact.lastName?.toLowerCase().replace(/[^a-z]/g, '');
  const patterns = last
    ? [`${first}.${last}@${domain}`, `${first}@${domain}`, `${first[0]}${last}@${domain}`]
    : [`${first}@${domain}`];

  for (const address of patterns) {
    contact.emails.push({ address, type: 'pattern_inferred', confidence: 0.4, verified: false, source: `pattern:${domain}` });
  }
}

export async function extractContacts(page: Page, domain: string): Promise<ExtractedContact[]> {
  const allContacts: ExtractedContact[] = [];
  const seen = new Set<string>();

  for (const path of TEAM_PATHS) {
    const url = `https://${domain}${path}`;
    const found = await tryPage(page, url);
    for (const c of found) {
      if (!seen.has(c.fullName.toLowerCase())) {
        seen.add(c.fullName.toLowerCase());
        inferEmails(c, domain);
        allContacts.push(c);
      }
    }
    if (allContacts.length >= 20) break; // cap per domain
  }

  logger.info('contactExtractor: extracted contacts', { domain, count: allContacts.length });
  return allContacts;
}
