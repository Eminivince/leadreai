import type { ToolDef } from './index.js';
import type { LeadRecord } from '../deduplicator.js';
import { logger } from '../../utils/logger.js';
import { normalizePhones, countryNameToCode } from '../phoneNormalizer.js';

/**
 * Rejects strings that look like page chrome / navigation text rather than a
 * human name. Backs up the agent-prompt rule with a code-level guard.
 *
 * A plausible human name:
 *   - is not empty / too short / too long
 *   - is not a single line of newlines or whitespace
 *   - does not match common UI-navigation labels
 *   - does not contain section-header verbs (History, Vision, About...)
 */
const UI_CHROME_PATTERNS = /^(related\s+pages?|our\s+(team|people|history|values|story)|about(\s+us)?|contact(\s+us)?|home|leadership|meet\s+(our|the)\s+team|vision\s+and\s+values|management\s+team|board\s+of\s+directors|menu|navigation|read\s+more|learn\s+more|click\s+here)$/i;
const SECTION_HEADER_WORDS = /\b(History|Vision|Mission|Values|Story|Overview|Approach|Services|Expertise|Practice Areas?|Locations?|News|Careers|Portfolio)\b/;

function looksLikePersonName(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.length < 3 || v.length > 100) return false;
  if (v.includes('\n')) return false;
  if (UI_CHROME_PATTERNS.test(v)) return false;
  if (SECTION_HEADER_WORDS.test(v)) return false;
  // Require at least one space (first + last name) OR a recognized single-word
  // name pattern like "Templars" — but for a topContact we want two-word minimum.
  if (!/\s/.test(v)) return false;
  // Too many capitalized words (>4) is usually a title string, not a name.
  const capWords = v.match(/\b[A-Z][a-z]+\b/g) ?? [];
  if (capWords.length > 4) return false;
  return true;
}

/**
 * Parses an unknown value into a finite number in [min, max]; falls back to `fallback`.
 * Guards against NaN sneaking into BSON (where NaN is persisted as null, which breaks
 * downstream ranking/filtering that expects a number).
 */
function clampToFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export const writeLeadTool: ToolDef = {
  name: 'write_lead',
  description: 'Commit a lead to the job results. Deduplicates on companyDomain + primary email within this job. Call this ONLY for leads you are confident in (ideally after score_lead returns isVerified:true).',
  parametersSchema: '{"companyName": string, "companyDomain": string, "website"?: string, "emails": [{address,type?,confidence,name?,title?,department?,source?}], "phones": [{raw,normalized?,source?}], "topContact"?: {fullName,title?,seniority?}, "rankScore"?: number, "sources"?: [{url,type?}], "reasoning"?: string}',
  handler: async (args, ctx) => {
    const companyName = String(args?.companyName ?? '').trim();
    const companyDomain = String(args?.companyDomain ?? '').trim().toLowerCase().replace(/^www\./, '');
    if (!companyName || !companyDomain) return { ok: false, output: 'companyName and companyDomain required' };

    // Same-domain handling — we support UPGRADES: a second write_lead on the same
    // domain can replace the prior record if the new one has strictly better data
    // (e.g. named topContact where previous was generic-only). This lets the agent
    // write baseline first and enrich later without fear of losing the baseline.
    const existingIdx = ctx.leadsSoFar.findIndex((l) => l.companyDomain === companyDomain);
    const incomingHasNamedContact = !!(args?.topContact?.fullName && String(args.topContact.fullName).trim());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emails = Array.isArray(args?.emails) ? args.emails.map((e: any) => ({
      address: String(e.address ?? '').toLowerCase().trim(),
      type: (e.type ?? (e.name ? 'business' : 'generic')) as 'business' | 'generic',
      confidence: clampToFiniteNumber(e.confidence, 0.6, 0, 1),
      source: String(e.source ?? 'ai_extracted'),
      name: e.name ? String(e.name) : undefined,
      title: e.title ? String(e.title) : undefined,
      department: e.department ? String(e.department) : undefined,
    })).filter((e: { address: string }) => e.address.includes('@')) : [];

    // Normalize phones through libphonenumber-js so downstream consumers get E.164 +
    // type classification (office/mobile/fax). Country hint comes from parsed intent
    // when present, else libphonenumber will try to infer from the number itself.
    const rawPhoneStrings: string[] = Array.isArray(args?.phones)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? args.phones.map((p: any) => String(p?.raw ?? p ?? '').trim()).filter(Boolean)
      : [];
    const countryHint = countryNameToCode(ctx.parsedIntent.geography?.country);
    const normalized = normalizePhones(rawPhoneStrings, countryHint);
    const phones = normalized.map((p) => ({
      raw: p.raw,
      normalized: p.normalized,
      type: p.type,
      countryCode: p.countryCode,
      source: 'agent_extracted',
    })).filter((p) => p.raw);

    const lead: LeadRecord = {
      workspaceId: ctx.workspaceId,
      jobId: ctx.jobId,
      companyName,
      companyDomain,
      website: args?.website ? String(args.website) : `https://${companyDomain}`,
      industry: ctx.parsedIntent.industry ?? undefined,
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
      rankScore: clampToFiniteNumber(args?.rankScore, 70, 0, 100),
      completenessScore: 0,
      isDuplicate: false,
      tags: ['agent_emitted'],
      contactSummary: (() => {
        const rawName = args?.topContact?.fullName ? String(args.topContact.fullName) : undefined;
        if (!rawName || !looksLikePersonName(rawName)) {
          if (rawName) logger.warn('[writeLead] rejected implausible topContact name', { companyName, rawName: rawName.slice(0, 80) });
          return undefined;
        }
        return {
          totalContacts: 1,
          topContact: {
            fullName: rawName.trim(),
            title: String(args?.topContact?.title ?? '').trim(),
            seniority: String(args?.topContact?.seniority ?? '').trim(),
          },
        };
      })(),
    };

    // Upgrade logic: if same domain already written, merge emails/phones and
    // replace the record only if the new one adds named-contact data. Otherwise
    // silently skip (no duplicate rows in leadsSoFar).
    let writeAction: 'new' | 'upgrade' | 'merge' | 'skip' = 'new';
    if (existingIdx >= 0) {
      const existing = ctx.leadsSoFar[existingIdx]!;
      const existingHasNamedContact = !!existing.contactSummary?.topContact?.fullName;

      // Merge email/phone arrays (dedupe by address / raw).
      const mergedEmails = [...existing.emails];
      for (const ne of lead.emails) {
        if (!mergedEmails.some((e) => e.address === ne.address)) mergedEmails.push(ne);
      }
      const mergedPhones = [...existing.phones];
      for (const np of lead.phones) {
        if (!mergedPhones.some((p) => (p.normalized ?? p.raw) === (np.normalized ?? np.raw))) mergedPhones.push(np);
      }

      if (incomingHasNamedContact && !existingHasNamedContact) {
        // Strict upgrade — replace with new lead but keep merged contact arrays.
        ctx.leadsSoFar[existingIdx] = { ...lead, emails: mergedEmails, phones: mergedPhones };
        writeAction = 'upgrade';
      } else if (mergedEmails.length > existing.emails.length || mergedPhones.length > existing.phones.length) {
        // Merge only — add new emails/phones to existing record.
        existing.emails = mergedEmails;
        existing.phones = mergedPhones;
        writeAction = 'merge';
      } else {
        writeAction = 'skip';
      }
    } else {
      ctx.leadsSoFar.push(lead);
    }

    await ctx.publisher.publish(
      `job:progress:${ctx.jobId}`,
      JSON.stringify({ type: 'progress', leadsFoundSoFar: ctx.leadsSoFar.length }),
    );
    await ctx.publisher.publish(
      `job:progress:${ctx.jobId}`,
      JSON.stringify({
        type: 'activity', stage: 'agent', ts: Date.now(),
        title: `Agent ${writeAction === 'new' ? 'emitted' : writeAction === 'upgrade' ? 'upgraded' : writeAction} lead: ${companyName}`,
        meta: { domain: companyDomain, emails: emails.length, phones: phones.length, action: writeAction, reasoning: args?.reasoning },
      }),
    );

    logger.info('[writeLead] lead %s', writeAction, {
      jobId: ctx.jobId, companyName, companyDomain, emailCount: emails.length, phoneCount: phones.length, action: writeAction,
    });

    return {
      ok: true,
      output: JSON.stringify({
        action: writeAction,
        totalLeadsSoFar: ctx.leadsSoFar.length,
        targetCount: ctx.parsedIntent.targetCount,
        hint: writeAction === 'new'
          ? 'Baseline lead written. If budget allows, consider enriching with a team-page search to find a named decision-maker, then call write_lead again on the same domain to upgrade.'
          : writeAction === 'upgrade'
            ? 'Existing lead upgraded with named contact. Move on to the next company.'
            : writeAction === 'merge'
              ? 'Existing lead had additional emails/phones merged in. Move on to the next company.'
              : 'Incoming data was not strictly better than existing lead. Move on.',
      }),
    };
  },
};
