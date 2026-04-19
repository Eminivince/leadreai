import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import type { ParsedIntent } from '@leadreai/shared';
import type { LeadRecord } from './deduplicator.js';

export interface LeadScore {
  score: number;      // 0.0 – 1.0
  reason: string;
  isVerified: boolean; // true if score >= VERIFY_THRESHOLD
}

const VERIFY_THRESHOLD = 0.65;
const AI_TIMEOUT_MS = 8_000;

const SYSTEM_PROMPT = `You are a B2B lead quality evaluator. Given a lead record and what the user was searching for, return a JSON object with:
- score: number 0.0-1.0 (probability this is a good, actionable lead for the user's query)
- reason: one sentence explaining the score

Scoring guide:
- 0.8-1.0: Directly matches the query, has real contact data (named email or phone)
- 0.5-0.79: Plausible match, some contact data present
- 0.2-0.49: Weak match or poor contact data
- 0.0-0.19: Spam, irrelevant, or no usable contact data

Respond ONLY with JSON, no markdown.`;

function buildUserPrompt(lead: LeadRecord, intent: ParsedIntent): string {
  const contacts = [
    lead.emails.map(e => e.address).join(', ') || 'none',
  ].join('; ');
  const phones = lead.phones.map(p => p.normalized ?? p.raw).join(', ') || 'none';

  return `User query intent:
- Industry: ${intent.industry}
- Geography: ${JSON.stringify(intent.geography)}
- Query type: ${intent.queryType}
- Desired fields: ${intent.desiredFields.join(', ')}

Lead data:
- Company: ${lead.companyName}
- Domain: ${lead.companyDomain}
- Emails: ${contacts}
- Phones: ${phones}
- Has LinkedIn: ${lead.socialProfiles?.linkedinUrl ? 'yes' : 'no'}
- Completeness score: ${lead.completenessScore}

Rate this lead's quality for this query.`;
}

function heuristicScore(lead: LeadRecord): LeadScore {
  let score = 0;
  if (lead.emails.some(e => e.type === 'business' && e.confidence >= 0.9)) score += 0.4;
  else if (lead.emails.length > 0) score += 0.2;
  if (lead.phones.length > 0) score += 0.25;
  if (lead.socialProfiles?.linkedinUrl) score += 0.1;
  if (lead.completenessScore >= 60) score += 0.1;
  if (lead.companyDomain && !lead.companyDomain.includes(' ')) score += 0.05;
  const capped = Math.min(score, 1.0);
  return {
    score: capped,
    reason: 'heuristic fallback (AI unavailable)',
    isVerified: capped >= VERIFY_THRESHOLD,
  };
}

export async function scoreLeadRelevance(
  lead: LeadRecord,
  intent: ParsedIntent,
): Promise<LeadScore> {
  if (!env.OPENROUTER_API_KEY) {
    return heuristicScore(lead);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://leadreai.app',
      },
      body: JSON.stringify({
        model: 'google/gemini-flash-1.5',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(lead, intent) },
        ],
        max_tokens: 120,
        temperature: 0,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      logger.warn('[leadScorer] OpenRouter non-200', { status: res.status, domain: lead.companyDomain });
      return heuristicScore(lead);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const content: string = json?.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content) as { score?: number; reason?: string };
    const score = Math.max(0, Math.min(1, Number(parsed.score ?? 0)));
    const reason = String(parsed.reason ?? 'no reason given');

    logger.debug('[leadScorer] AI score', { domain: lead.companyDomain, score, reason });
    return { score, reason, isVerified: score >= VERIFY_THRESHOLD };
  } catch (err) {
    logger.warn('[leadScorer] AI scoring failed — using heuristic', {
      domain: lead.companyDomain,
      err: err instanceof Error ? err.message : String(err),
    });
    return heuristicScore(lead);
  }
}
