import ExcelJS from 'exceljs';
import type { ILead } from '../../models/Lead.js';

export async function leadsToXlsx(leads: ILead[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Leads');

  sheet.columns = [
    { header: 'Company Name', key: 'companyName', width: 30 },
    { header: 'Domain', key: 'domain', width: 25 },
    { header: 'Industry', key: 'industry', width: 20 },
    { header: 'Country', key: 'country', width: 15 },
    { header: 'City', key: 'city', width: 15 },
    { header: 'Website', key: 'website', width: 30 },
    { header: 'Primary Email', key: 'primaryEmail', width: 30 },
    { header: 'Email Confidence', key: 'emailConfidence', width: 15 },
    { header: 'All Emails', key: 'allEmails', width: 40 },
    { header: 'Primary Phone', key: 'primaryPhone', width: 20 },
    { header: 'All Phones', key: 'allPhones', width: 30 },
    { header: 'LinkedIn', key: 'linkedin', width: 35 },
    { header: 'Rank Score', key: 'rankScore', width: 12 },
    { header: 'Outreach Status', key: 'outreachStatus', width: 18 },
    { header: 'Tags', key: 'tags', width: 20 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Agent Reasoning', key: 'agentReasoning', width: 40 },
    { header: 'Source URLs', key: 'sourceUrls', width: 60 },
    { header: 'Evidence count', key: 'evidenceCount', width: 15 },
  ];

  // Style header row
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  for (const lead of leads) {
    sheet.addRow({
      companyName: lead.companyName,
      domain: lead.companyDomain ?? '',
      industry: lead.industry ?? '',
      country: lead.address?.country ?? '',
      city: lead.address?.city ?? '',
      website: lead.website ?? '',
      primaryEmail: lead.emails[0]?.address ?? '',
      emailConfidence: lead.emails[0]?.confidence ?? '',
      allEmails: lead.emails.map(e => e.address).join('; '),
      primaryPhone: lead.phones[0]?.normalized ?? lead.phones[0]?.raw ?? '',
      allPhones: lead.phones.map(p => p.normalized ?? p.raw).join('; '),
      linkedin: lead.socialProfiles?.linkedinUrl ?? '',
      rankScore: lead.rankScore,
      outreachStatus: lead.outreachStatus,
      tags: lead.tags.join(', '),
      description: lead.description ?? '',
      agentReasoning: lead.agentReasoning ?? '',
      sourceUrls: (lead.sources ?? []).slice(0, 3).map(s => s.url).join(' | '),
      evidenceCount: (lead.sources ?? []).length,
    });
  }

  return workbook.xlsx.writeBuffer().then(buf => Buffer.from(buf));
}
