import type { Request, Response } from 'express';
import Lead from '../models/Lead.js';
import { ApiError } from '../utils/ApiError.js';
import { leadsToCsv } from '../services/export/csvExporter.js';
import { leadsToXlsx } from '../services/export/xlsxExporter.js';

export async function exportLeads(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const { format = 'csv', jobId } = req.query as { format?: string; jobId?: string };

  if (!['csv', 'xlsx'].includes(format)) throw ApiError.badRequest('format must be csv or xlsx');

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

  const csv = await leadsToCsv(leads);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${workspaceId}.csv"`);
  res.send(csv);
}
