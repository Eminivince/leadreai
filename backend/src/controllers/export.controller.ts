import type { Request, Response } from 'express';
import Lead from '../models/Lead.js';
import { ApiError } from '../utils/ApiError.js';
import { leadsToCsv } from '../services/export/csvExporter.js';
import { leadsToXlsx } from '../services/export/xlsxExporter.js';

export async function exportLeads(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const { format = 'csv', jobId } = req.query as { format?: string; jobId?: string };

  const ALLOWED = ['csv', 'xlsx', 'json', 'proof-bundle'];
  if (!ALLOWED.includes(format)) {
    throw ApiError.badRequest(`format must be one of: ${ALLOWED.join(', ')}`);
  }

  const filter: Record<string, unknown> = { workspaceId, isDuplicate: false };
  if (jobId) filter.jobId = jobId;

  const leads = await Lead.find(filter).sort({ rankScore: -1 }).limit(5000);

  if (format === 'xlsx') {
    const buffer = await leadsToXlsx(leads);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="leads-${workspaceId}.xlsx"`);
    res.send(buffer);
    return;
  }

  if (format === 'json') {
    res.json({ success: true, data: leads });
    return;
  }

  // Proof bundle — the regulated-buyer flavour. Every fact carries its
  // sourceUrl + confidence + scrapedAt; auditors can verify any cell
  // without the LeadreAI UI. Same shape as JSON but explicitly named so
  // the file name signals to procurement that it's the audit copy.
  if (format === 'proof-bundle') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="leads-proof-bundle-${workspaceId}.json"`);
    res.send(JSON.stringify({
      generatedAt: new Date().toISOString(),
      workspaceId,
      jobId: jobId ?? null,
      leadCount: leads.length,
      leads,
    }, null, 2));
    return;
  }

  const csv = await leadsToCsv(leads);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${workspaceId}.csv"`);
  res.send(csv);
}
