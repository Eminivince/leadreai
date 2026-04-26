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

/**
 * Team/people page path guesses. Ordered by frequency across corporate + pro-services
 * sites. Law firms in particular favor /partners, /attorneys, /our-lawyers.
 */
const TEAM_PATHS = [
  '/team', '/our-team', '/team-members',
  '/people', '/our-people',
  '/leadership', '/management', '/executives',
  '/partners', '/our-partners',
  '/attorneys', '/lawyers', '/our-lawyers',
  '/professionals', '/practitioners',
  '/staff',
  '/about', '/about-us',
];

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
      //    Matches: "Firstname Lastname", "Firstname M. Lastname", "Firstname-Smith Lastname"
      //    Rejects: all-caps pure headers, single words, 5+ word phrases
      const NAME_PATTERN = /^[A-Z][a-z'-]+(?: [A-Z]\.?)?(?: [A-Z][a-z'-]+){1,3}$/;
      const headings = Array.from(document.querySelectorAll('h2, h3, h4, h5, a.person, a.attorney, a.lawyer, .member-name, .team-member-name, .attorney-name, .person-name, .partner-name'));
      for (const h of headings) {
        const text = h.textContent?.trim().replace(/\s+/g, ' ') ?? '';
        if (!NAME_PATTERN.test(text)) continue;
        // Rough chrome-filter: skip if heading text matches known non-person labels.
        if (/^(about|our|the|home|contact|news|careers|services|practice areas|locations|partners?$|people$|team$|leadership$)$/i.test(text)) continue;

        // Look for an adjacent title element — sibling, or a child of the same card.
        const candidates: (Element | null)[] = [
          h.nextElementSibling,
          h.parentElement?.querySelector('.title, .role, .position, .job-title, .attorney-title, .member-title') ?? null,
          h.parentElement?.nextElementSibling ?? null,
        ];
        let titleText: string | undefined;
        for (const c of candidates) {
          if (!c) continue;
          const t = c.textContent?.trim().replace(/\s+/g, ' ');
          if (t && t.length >= 2 && t.length <= 120 && t !== text) {
            titleText = t;
            break;
          }
        }
        results.push({ name: text, title: titleText });
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
