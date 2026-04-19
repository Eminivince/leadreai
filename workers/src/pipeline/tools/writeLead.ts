import type { ToolDef } from './index.js';
import type { LeadRecord } from '../deduplicator.js';
import { logger } from '../../utils/logger.js';

export const writeLeadTool: ToolDef = {
  name: 'write_lead',
  description: 'Commit a lead to the job results. Deduplicates on companyDomain + primary email within this job. Call this ONLY for leads you are confident in (ideally after score_lead returns isVerified:true).',
  parametersSchema: '{"companyName": string, "companyDomain": string, "website"?: string, "emails": [{address,type?,confidence,name?,title?,department?,source?}], "phones": [{raw,normalized?,source?}], "topContact"?: {fullName,title?,seniority?}, "rankScore"?: number, "sources"?: [{url,type?}], "reasoning"?: string}',
  handler: async (args, ctx) => {
    const companyName = String(args?.companyName ?? '').trim();
    const companyDomain = String(args?.companyDomain ?? '').trim().toLowerCase().replace(/^www\./, '');
    if (!companyName || !companyDomain) return { ok: false, output: 'companyName and companyDomain required' };

    const primaryEmail = Array.isArray(args?.emails) && args.emails[0]?.address ? String(args.emails[0].address).toLowerCase() : '';
    const dedupeKey = `${companyDomain}|${primaryEmail}`;
    if (ctx.leadsSoFar.some(l => `${l.companyDomain}|${(l.emails[0]?.address ?? '').toLowerCase()}` === dedupeKey)) {
      return { ok: true, output: JSON.stringify({ skipped: true, reason: 'duplicate in this job' }) };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emails = Array.isArray(args?.emails) ? args.emails.map((e: any) => ({
      address: String(e.address ?? '').toLowerCase().trim(),
      type: (e.type ?? (e.name ? 'business' : 'generic')) as 'business' | 'generic',
      confidence: Math.max(0, Math.min(1, Number(e.confidence ?? 0.6))),
      source: String(e.source ?? 'ai_extracted'),
      name: e.name ? String(e.name) : undefined,
      title: e.title ? String(e.title) : undefined,
      department: e.department ? String(e.department) : undefined,
    })).filter((e: { address: string }) => e.address.includes('@')) : [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const phones = Array.isArray(args?.phones) ? args.phones.map((p: any) => ({
      raw: String(p.raw ?? ''),
      normalized: p.normalized ? String(p.normalized) : undefined,
      type: p.type ? String(p.type) : undefined,
      countryCode: p.countryCode ? String(p.countryCode) : undefined,
      source: String(p.source ?? 'ai_extracted'),
    })).filter((p: { raw: string }) => p.raw) : [];

    const lead: LeadRecord = {
      workspaceId: ctx.workspaceId,
      jobId: ctx.jobId,
      companyName,
      companyDomain,
      website: args?.website ? String(args.website) : `https://${companyDomain}`,
      industry: ctx.parsedIntent.industry,
      address: {
        country: ctx.parsedIntent.geography?.country ?? undefined,
        city: ctx.parsedIntent.geography?.city ?? undefined,
        state: ctx.parsedIntent.geography?.state ?? undefined,
      },
      emails,
      phones,
      socialProfiles: undefined,
      osint: { viaAgent: true } as Record<string, unknown>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sources: Array.isArray(args?.sources) ? args.sources.map((s: any) => ({
        url: String(s.url ?? ''),
        type: (s.type ?? 'scraped_page') as 'scraped_page',
        scrapedAt: new Date(),
        confidence: 0.6,
      })) : [],
      rawSnippets: [],
      rankScore: Math.max(0, Math.min(100, Number(args?.rankScore ?? 70))),
      completenessScore: 0,
      isDuplicate: false,
      tags: ['agent_emitted'],
      contactSummary: args?.topContact ? {
        totalContacts: 1,
        topContact: {
          fullName: String(args.topContact.fullName ?? ''),
          title: String(args.topContact.title ?? ''),
          seniority: String(args.topContact.seniority ?? ''),
        },
      } : undefined,
    };

    ctx.leadsSoFar.push(lead);

    await ctx.publisher.publish(
      `job:progress:${ctx.jobId}`,
      JSON.stringify({ type: 'progress', leadsFoundSoFar: ctx.leadsSoFar.length }),
    );
    await ctx.publisher.publish(
      `job:progress:${ctx.jobId}`,
      JSON.stringify({
        type: 'activity', stage: 'agent', ts: Date.now(),
        title: `Agent emitted lead: ${companyName}`,
        meta: { domain: companyDomain, emails: emails.length, phones: phones.length, reasoning: args?.reasoning },
      }),
    );

    logger.info('[writeLead] lead emitted by agent', {
      jobId: ctx.jobId, companyName, companyDomain, emailCount: emails.length, phoneCount: phones.length,
    });

    return {
      ok: true,
      output: JSON.stringify({
        written: true,
        totalLeadsSoFar: ctx.leadsSoFar.length,
        targetCount: ctx.parsedIntent.targetCount,
      }),
    };
  },
};
