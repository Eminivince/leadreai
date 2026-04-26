import { stringify } from 'csv-stringify';
import type { ILead } from '../../models/Lead.js';

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
    }));

    stringify(rows, { header: true }, (err, output) => {
      if (err) reject(err);
      else resolve(output);
    });
  });
}
