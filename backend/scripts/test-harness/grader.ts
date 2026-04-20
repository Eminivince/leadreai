/**
 * Auto-grades a completed prospecting job against a PromptSpec rubric.
 *
 * "Auto" means: every metric here is deterministic from the lead records alone.
 * Subjective axes (e.g. "is this persona actually a decision-maker?") are
 * approximated with heuristics; a future version will delegate those to an
 * LLM judge with the prompt + rubric as context.
 */
import type { PromptSpec } from './prompts.js';

export interface LeadSnapshot {
  companyName: string;
  companyDomain?: string;
  website?: string;
  industry?: string;
  address?: { country?: string; city?: string; state?: string };
  emails: Array<{ address: string; type?: string; confidence?: number | null; source?: string }>;
  phones: Array<{ raw: string; normalized?: string; type?: string; countryCode?: string; source?: string }>;
  socialProfiles?: { linkedinUrl?: string };
  contactSummary?: { totalContacts?: number; topContact?: { fullName?: string; title?: string; seniority?: string } };
  sources?: Array<{ url: string; type?: string }>;
  rankScore?: number;
  completenessScore?: number;
  tags?: string[];
}

export interface AxisScore { score: number; notes: string[]; }
export interface GradedReport {
  promptId: string;
  jobId: string;
  totalLeads: number;
  axes: {
    coverage: AxisScore;
    accuracy: AxisScore;
    usefulness: AxisScore;
    relevance: AxisScore;
    honesty: AxisScore;
  };
  composite: number;
  redFlags: string[];
  leadBreakdown: {
    withBusinessEmail: number;
    withNamedContact: number;
    withLinkedIn: number;
    withSourcedContact: number;
    withValidPhone: number;
    personalEmailsAsBusiness: number;
    duplicatePhoneCount: number;
    hallucinatedDomains: number;
    honestNulls: number;
  };
}

const PERSONAL_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com']);

function extractEmailDomain(addr: string): string {
  const at = addr.lastIndexOf('@');
  return at > 0 ? addr.slice(at + 1).toLowerCase() : '';
}

function isPersonalDomain(addr: string): boolean {
  return PERSONAL_DOMAINS.has(extractEmailDomain(addr));
}

function clamp100(n: number): number { return Math.max(0, Math.min(100, Math.round(n))); }

export function gradeJob(spec: PromptSpec, jobId: string, leads: LeadSnapshot[]): GradedReport {
  const notes: Record<keyof GradedReport['axes'], string[]> = {
    coverage: [], accuracy: [], usefulness: [], relevance: [], honesty: [],
  };
  const redFlags: string[] = [];

  // --- Breakdown counters -------------------------------------------------
  const withBusinessEmail = leads.filter(l =>
    l.emails.some(e => e.address && !isPersonalDomain(e.address) &&
      (e.type === 'business' || (e.confidence ?? 0) >= 0.6)),
  ).length;

  const withNamedContact = leads.filter(l =>
    !!(l.contactSummary?.topContact?.fullName?.trim()) ||
    l.emails.some(e => e.address && !!e.address.split('@')[0]?.match(/[a-z]+\.[a-z]+/i)),
  ).length;

  const withLinkedIn = leads.filter(l => !!l.socialProfiles?.linkedinUrl).length;

  const withSourcedContact = leads.filter(l =>
    (l.sources?.length ?? 0) > 0 ||
    l.emails.some(e => !!e.source && e.source !== 'ai_extracted' && e.source !== 'pattern_inferred'),
  ).length;

  const withValidPhone = leads.filter(l => l.phones.some(p => !!p.normalized)).length;

  const personalEmailsAsBusiness = leads.reduce(
    (acc, l) => acc + l.emails.filter(e =>
      e.address && isPersonalDomain(e.address) && e.type === 'business'
    ).length,
    0,
  );

  // Duplicate phone detection — same normalized number across different domains is a red flag.
  const phoneToCompanies = new Map<string, Set<string>>();
  for (const l of leads) {
    for (const p of l.phones) {
      const key = p.normalized || p.raw;
      if (!key) continue;
      if (!phoneToCompanies.has(key)) phoneToCompanies.set(key, new Set());
      phoneToCompanies.get(key)!.add(l.companyDomain ?? l.companyName);
    }
  }
  const duplicatePhoneCount = [...phoneToCompanies.values()].filter(s => s.size > 1).length;

  // Hallucination heuristic: domain doesn't match company name at all.
  const hallucinatedDomains = leads.filter(l => {
    if (!l.companyDomain) return false;
    const nameTokens = l.companyName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 4);
    if (nameTokens.length === 0) return false;
    const domainRoot = l.companyDomain.split('.')[0]?.toLowerCase() ?? '';
    return !nameTokens.some(t => domainRoot.includes(t.slice(0, 4)) || t.includes(domainRoot.slice(0, 4)));
  }).length;

  // Honest nulls — presence of explicit nulls rather than guessed values.
  const honestNulls = leads.reduce((acc, l) => {
    let n = 0;
    for (const p of l.phones) if (p.normalized === null || p.type === null) n++;
    for (const e of l.emails) if (e.confidence === null) n++;
    return acc + n;
  }, 0);

  // --- COVERAGE -----------------------------------------------------------
  const coverageRaw = (leads.length / Math.max(1, spec.expectedTargetCount)) * 100;
  const coverageStrongRaw = (leads.length / Math.max(1, spec.strongMinimums.totalLeads)) * 100;
  const coverage = clamp100((coverageRaw + coverageStrongRaw) / 2);
  notes.coverage.push(`${leads.length}/${spec.expectedTargetCount} targetCount (${Math.round(coverageRaw)}%), strong-min ${spec.strongMinimums.totalLeads} → ${Math.round(coverageStrongRaw)}%`);

  // --- ACCURACY -----------------------------------------------------------
  // Penalize hallucinated domains heavily; reward domain-name congruence.
  const nonHallucinatedPct = leads.length > 0 ? ((leads.length - hallucinatedDomains) / leads.length) * 100 : 0;
  const validPhonePct = leads.length > 0 ? (withValidPhone / leads.length) * 100 : 0;
  const accuracy = clamp100(nonHallucinatedPct * 0.6 + validPhonePct * 0.4);
  notes.accuracy.push(`${hallucinatedDomains} possibly-hallucinated domains; ${withValidPhone}/${leads.length} leads have libphonenumber-valid phones`);
  if (hallucinatedDomains > 0) redFlags.push(`${hallucinatedDomains} suspected hallucinated domain(s)`);

  // --- USEFULNESS ---------------------------------------------------------
  // How many leads have an actually-contactable path (email OR phone)?
  const contactable = leads.filter(l =>
    withBusinessEmailFor(l) || l.phones.some(p => !!p.normalized) || !!l.socialProfiles?.linkedinUrl,
  ).length;
  const usefulness = clamp100(leads.length > 0 ? (contactable / leads.length) * 100 : 0);
  notes.usefulness.push(`${contactable}/${leads.length} leads contactable (biz email, valid phone, or LinkedIn)`);

  // --- RELEVANCE ----------------------------------------------------------
  // Heuristic: named-contact presence + strong-min satisfaction; a real implementation
  // would ask an LLM judge to read the query + lead and rate persona/ICP/signal match.
  const relMin = spec.strongMinimums;
  const relTotal = 0
    + (leads.length >= relMin.totalLeads ? 100 : (leads.length / relMin.totalLeads) * 100)
    + (relMin.withBusinessEmail ? (withBusinessEmail >= relMin.withBusinessEmail ? 100 : (withBusinessEmail / relMin.withBusinessEmail) * 100) : 100)
    + (relMin.withNamedContact ? (withNamedContact >= relMin.withNamedContact ? 100 : (withNamedContact / relMin.withNamedContact) * 100) : 100)
    + (relMin.withSignal ? 0 /* signals not yet tracked — will add when pipeline exists */ : 100);
  const relevance = clamp100(relTotal / 4);
  notes.relevance.push(`named=${withNamedContact}, bizEmail=${withBusinessEmail}${relMin.withSignal ? ', withSignal=0 (signal pipeline not built)' : ''}`);

  // --- HONESTY ------------------------------------------------------------
  // Penalize: personal-as-business emails, duplicate phones across companies, hallucinated domains, missing sources.
  let honesty = 100;
  if (personalEmailsAsBusiness > 0) { honesty -= Math.min(40, personalEmailsAsBusiness * 5); redFlags.push(`${personalEmailsAsBusiness} personal emails tagged as business`); }
  if (duplicatePhoneCount > (spec.redFlags.maxDupePhonesAcrossCompanies ?? 2)) {
    honesty -= Math.min(30, (duplicatePhoneCount - (spec.redFlags.maxDupePhonesAcrossCompanies ?? 2)) * 10);
    redFlags.push(`${duplicatePhoneCount} phone(s) reused across companies`);
  }
  if (hallucinatedDomains > 0) honesty -= Math.min(20, hallucinatedDomains * 5);
  if (spec.redFlags.requireSourceForEveryContact) {
    const missingSrcPct = leads.length > 0 ? ((leads.length - withSourcedContact) / leads.length) * 100 : 0;
    if (missingSrcPct > 20) { honesty -= Math.min(20, missingSrcPct * 0.3); redFlags.push(`${Math.round(missingSrcPct)}% of leads lack a source URL`); }
  }
  honesty = clamp100(honesty);
  notes.honesty.push(`${honestNulls} explicit-null field(s); ${withSourcedContact}/${leads.length} leads sourced`);

  // --- COMPOSITE ----------------------------------------------------------
  const w = spec.axisWeights;
  const composite = clamp100(
    coverage * w.coverage +
    accuracy * w.accuracy +
    usefulness * w.usefulness +
    relevance * w.relevance +
    honesty * w.honesty,
  );

  return {
    promptId: spec.id,
    jobId,
    totalLeads: leads.length,
    axes: {
      coverage: { score: coverage, notes: notes.coverage },
      accuracy: { score: accuracy, notes: notes.accuracy },
      usefulness: { score: usefulness, notes: notes.usefulness },
      relevance: { score: relevance, notes: notes.relevance },
      honesty: { score: honesty, notes: notes.honesty },
    },
    composite,
    redFlags,
    leadBreakdown: {
      withBusinessEmail,
      withNamedContact,
      withLinkedIn,
      withSourcedContact,
      withValidPhone,
      personalEmailsAsBusiness,
      duplicatePhoneCount,
      hallucinatedDomains,
      honestNulls,
    },
  };
}

function withBusinessEmailFor(l: LeadSnapshot): boolean {
  return l.emails.some(e => e.address && !isPersonalDomain(e.address) &&
    (e.type === 'business' || (e.confidence ?? 0) >= 0.6));
}
