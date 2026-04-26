import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Types (mirror workers/src/services/outreachGenerator.ts — kept in sync manually)
// ---------------------------------------------------------------------------

export interface LeadForOutreach {
  companyName?: string;
  companyDomain?: string;
  website?: string;
  industry?: string;
  address?: { city?: string; country?: string; state?: string };
  socialProfiles?: { linkedinUrl?: string };
}

export interface WorkspaceForOutreach {
  name?: string;
  settings?: { cheapMode?: boolean };
  knowledgeBase?: Array<{ title: string; content: string; type?: string }>;
}

export interface CampaignForOutreach {
  name?: string;
  outreachConfig?: { tone?: string; language?: string; channel?: string };
}

export interface OutreachDraftResult {
  firstLine: string;
  subject: string;
  body: string;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(workspace: WorkspaceForOutreach, campaign: CampaignForOutreach): string {
  const tone = campaign.outreachConfig?.tone ?? 'professional';
  const language = campaign.outreachConfig?.language ?? 'English';

  const kbEntries = (workspace.knowledgeBase ?? [])
    .map((entry) => `## ${entry.title}\n${entry.content}`)
    .join('\n\n');

  const aboutSender = kbEntries.length > 0 ? kbEntries : '(No knowledge base entries provided.)';

  return `You are a cold outreach personalization agent.

RULES:
- First line must be under 25 words, conversational, anchored to a concrete verifiable detail about this specific company
- Never use generic flattery ("I loved your work on...", "I was impressed by...")
- Each email must be unique — prove it wasn't mass-generated
- Channel: email
- Tone: ${tone}
- Language: ${language}

ABOUT THE SENDER:
${aboutSender}

OUTPUT: Return ONLY valid JSON (no markdown, no explanation):
{
  "firstLine": "...",
  "subject": "...",
  "body": "...",
  "reasoning": "..."
}`;
}

// ---------------------------------------------------------------------------
// buildUserMessage
// ---------------------------------------------------------------------------

function buildUserMessage(lead: LeadForOutreach, snippets: string[]): string {
  const companyName = lead.companyName ?? 'Unknown';
  const companyDomain = lead.companyDomain ?? 'N/A';
  const industry = lead.industry ?? 'N/A';
  const city = lead.address?.city ?? 'N/A';
  const country = lead.address?.country ?? 'N/A';
  const website = lead.website ?? 'N/A';
  const linkedinUrl = lead.socialProfiles?.linkedinUrl ?? 'N/A';

  const researchSection =
    snippets.length > 0
      ? snippets.map((s) => `- ${s}`).join('\n')
      : 'No recent research available.';

  return `LEAD:
Company: ${companyName}
Domain: ${companyDomain}
Industry: ${industry}
Location: ${city}, ${country}
Website: ${website}
LinkedIn: ${linkedinUrl}

RECENT RESEARCH (if available):
${researchSection}

Generate a personalized cold email for this lead.`;
}

// ---------------------------------------------------------------------------
// generateOutreachDraft
// ---------------------------------------------------------------------------

export async function generateOutreachDraft(
  lead: LeadForOutreach,
  workspace: WorkspaceForOutreach,
  campaign: CampaignForOutreach,
  snippets: string[],
): Promise<OutreachDraftResult> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set — cannot generate outreach draft');
  }

  const systemPrompt = buildSystemPrompt(workspace, campaign);
  const userMessage = buildUserMessage(lead, snippets);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30_000);

  let fetchRes: Response;
  try {
    fetchRes = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://leadreai.app',
        'X-Title': 'LeadreAI',
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        max_tokens: 1000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(t);
    throw new Error(
      `OpenRouter fetch failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  clearTimeout(t);

  if (!fetchRes.ok) {
    const body = await fetchRes.text().catch(() => '');
    throw new Error(
      `OpenRouter returned non-OK status ${fetchRes.status}: ${body.slice(0, 200)}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    json = await fetchRes.json();
  } catch (err) {
    throw new Error(
      `Failed to parse OpenRouter JSON response: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const content: string = json?.choices?.[0]?.message?.content ?? '';

  // Attempt to parse JSON — strip markdown fences if present
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).firstLine !== 'string' ||
    typeof (parsed as Record<string, unknown>).subject !== 'string' ||
    typeof (parsed as Record<string, unknown>).body !== 'string'
  ) {
    logger.error('[outreachDraftService] AI response did not return valid JSON', { content: content.slice(0, 300) });
    throw new Error(
      `AI response did not return valid outreach JSON. Content: ${content.slice(0, 300)}`
    );
  }

  const result = parsed as Record<string, unknown>;
  return {
    firstLine: result['firstLine'] as string,
    subject: result['subject'] as string,
    body: result['body'] as string,
    reasoning: typeof result['reasoning'] === 'string' ? result['reasoning'] : '',
  };
}
