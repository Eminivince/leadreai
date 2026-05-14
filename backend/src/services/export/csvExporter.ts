import { stringify } from 'csv-stringify';
import type { ILead } from '../../models/Lead.js';

/**
 * Serialise a lead's sources[] into a JSON string. Truncated to avoid
 * blowing the Excel-imported CSV cell limit (32k chars) — we cap the
 * embedded JSON at 24k chars and append `...truncated` if it exceeds.
 * For the full graph use `format=proof-bundle`.
 */
function evidenceJson(lead: ILead): string {
  const sources = (lead.sources ?? []).map((s) => ({
    url: s.url,
    type: s.type,
    confidence: s.confidence,
    scrapedAt: s.scrapedAt?.toISOString?.() ?? null,
  }));
  const facts = lead.facts
    ? Object.fromEntries(
        Object.entries(lead.facts as Record<string, { value: unknown; sourceUrl?: string; confidence?: number; scrapedAt?: Date }>).map(
          ([k, v]) => [k, { value: v.value, sourceUrl: v.sourceUrl, confidence: v.confidence }],
        ),
      )
    : undefined;
  const json = JSON.stringify({ sources, facts });
  if (json.length > 24_000) return json.slice(0, 24_000) + '"…truncated"]}';
  return json;
}

export function leadsToCsv(leads: ILead[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const rows = leads.map(lead => ({
      'Company Name': lead.companyName,
      'Domain': lead.companyDomain ?? '',
      'Industry': lead.industry ?? '',
      'Country': lead.address?.country ?? '',
      'City': lead.address?.city ?? '',
      'Website': lead.website ?? '',
      'Primary Email': lead.emails[0]?.address ?? '',
      'Email Confidence': lead.emails[0]?.confidence ?? '',
      'All Emails': lead.emails.map(e => e.address).join('; '),
      'Primary Phone': lead.phones[0]?.normalized ?? lead.phones[0]?.raw ?? '',
      'All Phones': lead.phones.map(p => p.normalized ?? p.raw).join('; '),
      'LinkedIn': lead.socialProfiles?.linkedinUrl ?? '',
      'Rank Score': lead.rankScore,
      'Outreach Status': lead.outreachStatus,
      'Tags': lead.tags.join(', '),
      'Description': lead.description ?? '',
      'Agent Reasoning': lead.agentReasoning ?? '',
      'Source URLs': (lead.sources ?? []).slice(0, 3).map(s => s.url).join(' | '),
      'Evidence count': (lead.sources ?? []).length,
      // Full evidence graph as JSON — agencies use this to back claims
      // when client asks "where did this lead come from?". XLSX export
      // gets a dedicated Evidence sheet; CSV is one column.
      'Evidence (JSON)': evidenceJson(lead),
    }));

    stringify(rows, { header: true }, (err, output) => {
      if (err) reject(err);
      else resolve(output);
    });
  });
}
