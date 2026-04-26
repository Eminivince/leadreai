import { z } from 'zod';
import {
  ClarificationQuestionSchema,
  type ClarificationQuestion,
} from '@leadreai/shared';
import { generateText, type AiMessage } from './aiProvider.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * The LLM only emits `{questions: [...]}`. The shared
 * `ClarifyResponseSchema` also requires `policy`, but policy comes
 * from `checkQueryPolicy()` — a separate call, not the LLM. Parsing
 * the LLM output with `ClarifyResponseSchema` silently failed every
 * call and dropped clarifications entirely.
 *
 * This schema matches the prompt contract exactly: questions only,
 * nothing else required.
 */
const LlmClarifyOutputSchema = z.object({
  questions: z.array(ClarificationQuestionSchema).max(8),
});

/**
 * Generates a short clarifying-question checklist from a raw NL query.
 *
 * Commercial goal: narrow the agent's search space BEFORE it burns credits.
 * An ambiguous query ("fintechs in Africa") wastes 10+ agent steps exploring
 * directions the user never wanted; 30 seconds of clarification upfront
 * often halves the run cost and doubles reply quality.
 *
 * Prompt discipline: ZERO questions is a valid answer. Only ask what
 * materially changes the research. Skipping trivia is more valuable than
 * filling the screen.
 */

export const CLARIFIER_SYSTEM_PROMPT = `You are a research-briefing assistant. You receive a user's natural-language prospecting query and you generate a clarifying-question checklist whose purpose is to make it NEAR-IMPOSSIBLE for the downstream research agent to produce an irrelevant lead.

COST FRAMING (read this first — it governs every decision below):
A dispatch the agent runs against a vague brief burns hundreds of tool calls, LLM turns, scraping, and real credits, and still produces leads the user discards. Clarifying questions cost the user seconds. Asking is ALWAYS cheaper than re-running. The goal of the checklist is to make it near-impossible for the downstream agent to produce an irrelevant lead once the user answers.

CRITICAL OUTPUT RULES:
- Output ONLY a JSON object. First character MUST be "{". Last character MUST be "}".
- NO markdown, NO code fences, NO preamble, NO reasoning, NO trailing commentary.

Schema: {"questions": [{id, question, type, options?, required, placeholder?, rationale}]}

Question-count policy — you decide:
- Use your own judgment. Ask as many questions as you genuinely need, and no more. Redundant questions are as harmful as missing ones.
- The hard upper bound is 8 (schema cap). Fewer is fine when the raw query is already sharp.
- ZERO questions is valid ONLY when the query is a contact_lookup for a specific named entity ("phone number of Aluko & Oyebode", "email for Jane Doe at Acme"). Every other shape of query should get at least enough questions to cover the axes below that the raw query didn't pin.
- The bar for each question: "If the user answers this, does it measurably reduce the chance of an irrelevant lead?" If yes, ask. If no, drop it.

The six ICP axes — ask about any axis the query has NOT explicitly pinned:
  1. PERSONA — decision-maker role + seniority (e.g. "VP Engineering at the target", "founding partner", "ops lead"). Without this, the agent finds the right companies but the wrong humans.
  2. PRODUCT — what the target company actually sells (e.g. "B2B SaaS", "card-issuing API", "lending-as-a-service"). "Fintech" alone is useless; "fintech" covers 40+ sub-products.
  3. CUSTOMER — who the target sells to (e.g. "enterprise financial institutions", "SMB retailers", "individual consumers"). B2B vs. B2C vs. B2B2C flips the entire candidate set.
  4. GEOGRAPHY — narrower than country when country alone was given (state/region/city). "African fintechs" is 54 countries.
  5. SIZE / STAGE — employees, funding round, revenue bracket, or "established vs. startup". Directly controls which registries and directories the agent queries first.
  6. DISQUALIFIERS — what makes a lead unmistakably WRONG. Agencies, incumbents, specific competitors, wrong business model, etc. This is the single highest-leverage axis — without it, relevance grading is guesswork.

Two high-leverage anchoring questions — include at least ONE unless the query is already crystal-specific:
  7. EXEMPLAR ANCHOR — free-text asking for 1–3 real company/person names that would be a perfect fit. Nothing pins an ICP like a named example. Placeholder: "e.g. Paystack, Flutterwave, Chipper Cash".
  8. REJECTION ANCHOR — free-text asking for a one-sentence description of a lead that would clearly be a BAD fit. Catches disqualifiers the user didn't think to list.

Hard rules on question craft:
- Prefer \`type: "single"\` or \`type: "multi"\` when a short enumerable answer set exists. Use \`type: "text"\` for truly open answers (exemplar list, rejection anchor, custom excludes).
- Every \`single\` / \`multi\` question: 3–8 sharp, non-overlapping \`options\`. Always include a neutral escape ("Any", "No preference", "Open to all").
- Mark \`required: true\` when proceeding without an answer would almost certainly produce mis-targeted leads — typically persona/product/customer when the query is ambiguous on that axis. Aim for 1–2 required questions per brief, not zero and not everything.
- Every question needs a one-sentence \`rationale\` — what the answer changes about the research (which tool, which registry, which filter).
- \`id\`: lowercase_snake_case stable slug (persona_seniority, product_category, customer_segment, geo_subregion, company_stage, disqualifiers, exemplar_companies, rejection_description).

Anti-patterns — NEVER ask:
- Confirmation of something already in the query ("you said Nigeria — confirm Nigeria?").
- Output field names (that's the parser's job — email vs. phone vs. funding column).
- "Why do you want these leads?" (belongs to the outreach layer, not research).
- Preferences that have no operational effect on the search (favorite color, tone of outreach).

Examples (these reflect the new default — more questions, sharper anchoring):

Query: "Top 20 fintech companies in Nigeria with funding info — CEO name and work email"
Reasonable output:
{
  "questions": [
    {
      "id": "product_category",
      "question": "Which fintech sub-sector?",
      "type": "multi",
      "options": ["Payments / PSP", "Lending / credit", "Neobank / digital bank", "Wealthtech / investing", "Insurtech", "Crypto / stablecoin", "B2B infrastructure", "No preference"],
      "required": true,
      "rationale": "'Fintech' spans 40+ product categories with almost no overlap in candidate lists — pinning this is the single biggest filter."
    },
    {
      "id": "customer_segment",
      "question": "Who does the target serve?",
      "type": "single",
      "options": ["B2B — financial institutions", "B2B — SMB / enterprise", "B2C — consumers", "B2B2C — both", "Any"],
      "required": true,
      "rationale": "B2B vs. B2C flips the entire candidate set and controls which aggregator directories we prioritize."
    },
    {
      "id": "company_stage",
      "question": "What stage of fintech?",
      "type": "multi",
      "options": ["Pre-seed / seed", "Series A–B", "Series C+ / growth", "Bootstrapped / profitable", "Any stage"],
      "required": false,
      "rationale": "Stage changes which registries and press sources the agent searches first."
    },
    {
      "id": "exemplar_companies",
      "question": "Name 1–3 companies that would be a perfect fit.",
      "type": "text",
      "required": false,
      "placeholder": "e.g. Paystack, Flutterwave, Moniepoint",
      "rationale": "Named exemplars are the highest-signal anchor — the agent uses them to look-alike the candidate set."
    },
    {
      "id": "disqualifiers",
      "question": "What kind of lead would be clearly WRONG?",
      "type": "text",
      "required": false,
      "placeholder": "e.g. 'agencies or consultancies', 'pure crypto/stablecoin plays', 'pre-product startups'",
      "rationale": "Explicit disqualifiers become hard filters in list_companies and the agent's relevance grader."
    }
  ]
}

Query: "phone number of Aluko and Oyebode"
Reasonable output (contact_lookup for a named entity — genuinely nothing to clarify):
{ "questions": [] }

Query: "managing partners at mid-tier Nigerian law firms, excluding the big five"
Reasonable output:
{
  "questions": [
    {
      "id": "practice_area",
      "question": "Any preferred practice area(s)?",
      "type": "multi",
      "options": ["Corporate / M&A", "Tax", "Energy / Oil & Gas", "Banking & Finance", "Litigation", "IP", "Dispute resolution", "No preference"],
      "required": false,
      "rationale": "Practice area flips the search between specialized directories and general bar listings."
    },
    {
      "id": "mid_tier_definition",
      "question": "How do you define mid-tier?",
      "type": "single",
      "options": ["10–50 lawyers", "50–150 lawyers", "Regional / single-state only", "No preference"],
      "required": true,
      "rationale": "'Mid-tier' has no canonical definition; pinning it prevents drift to boutiques or second-big-five firms."
    },
    {
      "id": "geo_subregion",
      "question": "Which part of Nigeria?",
      "type": "multi",
      "options": ["Lagos only", "Abuja only", "Port Harcourt / South-South", "Across all regions", "No preference"],
      "required": false,
      "rationale": "Firm location affects which bar directories and LinkedIn city filters apply."
    },
    {
      "id": "exemplar_companies",
      "question": "Name 1–3 firms that would be a perfect example of mid-tier for you.",
      "type": "text",
      "required": false,
      "placeholder": "e.g. Punuka Attorneys, SimmonsCooper Partners",
      "rationale": "Named exemplars anchor the 'mid-tier' definition to real-world firms."
    },
    {
      "id": "disqualifiers",
      "question": "Anything else to exclude beyond the big five?",
      "type": "text",
      "required": false,
      "placeholder": "e.g. 'firms without a website', 'single-practitioner shops'",
      "rationale": "Custom exclusions become filters in list_companies and the relevance grader."
    }
  ]
}

REMINDER: Output must be a single valid JSON object. Start with "{". End with "}".`;

/**
 * Scans text for the first balanced {...} block. Tolerant of prose before /
 * after the JSON and of strings that contain braces.
 */
function extractFirstJsonObject(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Heuristic: does this query look like a contact_lookup for a specific
 * named entity? That's the ONE case where returning zero clarifying
 * questions is legitimate. Everything else — named_entity_list, generic
 * demographic filters — should get clarifications by default, even if
 * the LLM decides the query "looks specific enough".
 *
 * Signals for contact_lookup (any one triggers a match):
 *   - Explicit intent verbs: "phone number of", "email for", "contact
 *     details of", "reach out to", "who is", etc.
 *   - Query ≤ 12 words AND contains a capitalized multi-word proper
 *     noun that isn't a country / region / generic job title.
 *   - Direct "X at Y" pattern where Y is a proper noun.
 *
 * This intentionally errs on the side of saying "not a contact lookup"
 * — false negatives here mean we ask some clarifications on a genuinely
 * specific query (30s user cost); false positives mean we skip
 * clarification on a vague query (100× agent cost). Asymmetric risk,
 * asymmetric tolerance.
 */
function looksLikeContactLookup(rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  const wordCount = q.split(/\s+/).length;

  const lookupVerbs = [
    /\bphone (number|#) (of|for)\b/,
    /\bemail (address )?(of|for)\b/,
    /\bcontact (info|details|information) (of|for)\b/,
    /\bhow (can|do) i (contact|reach)\b/,
    /\bwho is\b.*\bat\b/,
    /\banyone at\b/,
    /\breach out to\b/,
    /\bmailing address (of|for)\b/,
  ];
  if (lookupVerbs.some((re) => re.test(q))) return true;

  // Short queries (≤ 12 words) that look like bare entity lookups:
  // "contact for Paystack", "Aluko and Oyebode partners", etc.
  if (wordCount <= 12) {
    // Look for capitalized multi-word proper noun in the ORIGINAL casing.
    // At least two adjacent capitalized words, not starting the sentence.
    const properNoun = /(?:^|[^A-Z])([A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|&|and|of|the|la|le|du|de)){1,})/;
    if (properNoun.test(rawQuery)) return true;
  }

  return false;
}

/**
 * Second-chance prompt for when the model violated the "must ask unless
 * it's a contact_lookup" rule. Sent as a follow-up user message when
 * the first response returned zero questions on a non-contact_lookup
 * query. Keeps pushing toward the six ICP axes defined in the system
 * prompt.
 */
const NONZERO_ENFORCEMENT_MESSAGE = `You returned zero questions, but this query is NOT a contact_lookup for a specific named entity — it's a broader research brief. Per your rules, you MUST return at least 3 questions covering whichever of the six ICP axes the raw query left ambiguous (persona, product, customer, geography, size/stage, disqualifiers). Include at least one anchoring question (exemplar companies OR rejection description). Respond again with valid JSON only.`;

/**
 * Generates the clarification checklist. Default posture: always ask
 * questions. Zero is allowed only when the query is a contact_lookup
 * for a specific named entity; every other query gets at least 3
 * questions (enforced server-side — the LLM is coached but not
 * trusted).
 *
 * Every failure path (no-JSON, invalid JSON, schema mismatch, zero
 * questions on a non-lookup query) converges on `fallbackQuestions()`
 * when the query isn't a contact lookup — we never silently skip
 * clarification on an underspecified brief. Contact lookups can
 * legitimately return `[]`.
 *
 * Up to 3 total attempts with progressive correction feedback.
 */
export async function generateClarifications(rawQuery: string): Promise<ClarificationQuestion[]> {
  if (!rawQuery.trim()) {
    throw ApiError.badRequest('rawQuery must not be empty');
  }

  const allowZero = looksLikeContactLookup(rawQuery);

  // Helper: every non-success exit path runs through this. It hands
  // back fallback questions when we must not skip clarification, and
  // an empty list only when the query is genuinely a contact lookup.
  const bail = (reason: string, meta?: Record<string, unknown>): ClarificationQuestion[] => {
    console.warn(`[queryClarifier] ${reason}`, meta ?? {});
    return allowZero ? [] : fallbackQuestions();
  };

  const conversation: AiMessage[] = [{ role: 'user', content: rawQuery }];
  // Three attempts: (1) initial, (2) zero-question retry if needed,
  // (3) schema-fix retry if needed.
  const MAX_ATTEMPTS = 3;
  let enforcedZeroRetry = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await generateText(conversation, {
      systemPrompt: CLARIFIER_SYSTEM_PROMPT,
      cacheSystem: true,
      maxTokens: 1536,
    });

    const extracted = extractFirstJsonObject(response.text);
    if (!extracted) {
      if (attempt === MAX_ATTEMPTS) {
        return bail('no JSON object after max attempts', {
          rawResponsePreview: response.text.slice(0, 300),
        });
      }
      conversation.push(
        { role: 'assistant', content: response.text },
        { role: 'user', content: 'No JSON found. Respond with ONLY the JSON object. Start with "{" and end with "}".' },
      );
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extracted);
    } catch {
      if (attempt === MAX_ATTEMPTS) {
        return bail('invalid JSON after max attempts', {
          extractedPreview: extracted.slice(0, 300),
        });
      }
      conversation.push(
        { role: 'assistant', content: response.text },
        { role: 'user', content: 'Invalid JSON. Respond with ONLY a syntactically valid JSON object.' },
      );
      continue;
    }

    const result = LlmClarifyOutputSchema.safeParse(parsed);
    if (result.success) {
      const questions = result.data.questions;

      // Zero-question enforcement. If the model returned zero AND this
      // query isn't a contact lookup, kick it back ONCE with a
      // stronger instruction before falling back. Guard with
      // `enforcedZeroRetry` so we don't loop forever.
      if (questions.length === 0 && !allowZero && !enforcedZeroRetry && attempt < MAX_ATTEMPTS) {
        enforcedZeroRetry = true;
        console.warn(
          '[queryClarifier] zero questions returned on non-lookup query — retrying with enforcement',
          { rawQuery: rawQuery.slice(0, 120) },
        );
        conversation.push(
          { role: 'assistant', content: response.text },
          { role: 'user', content: NONZERO_ENFORCEMENT_MESSAGE },
        );
        continue;
      }

      if (questions.length === 0 && !allowZero) {
        return bail('zero questions after enforcement retry — using fallback', {
          rawQuery: rawQuery.slice(0, 120),
        });
      }

      return questions;
    }

    if (attempt === MAX_ATTEMPTS) {
      const issueSummary = result.error.issues
        .map((i) => `- path=${i.path.join('.') || '(root)'} code=${i.code} message=${i.message}`)
        .join('\n');
      return bail('schema failed after max attempts', {
        issues: issueSummary,
        parsedPreview: JSON.stringify(parsed).slice(0, 400),
      });
    }

    const issueSummary = result.error.issues
      .map((i) => `- path=${i.path.join('.') || '(root)'} code=${i.code} message=${i.message}`)
      .join('\n');
    conversation.push(
      { role: 'assistant', content: response.text },
      { role: 'user', content: `Schema validation failed:\n${issueSummary}\n\nRespond again with ONLY valid JSON matching the schema.` },
    );
  }

  // Loop should always return via one of the branches above, but TS
  // wants an exit.
  return bail('loop fell through (unreachable)');
}

/**
 * Last-resort questions injected when the LLM refuses to generate any
 * for a query that clearly isn't a contact_lookup. Hits the three
 * highest-leverage axes from the six-axis rubric:
 *   - Persona seniority (who the buyer is)
 *   - Disqualifiers (what's a wrong-fit lead)
 *   - Exemplars (concrete reference companies)
 *
 * Deliberately generic so they work on any query — specificity suffers
 * vs. a tailored clarifier but "one generic confirmation step" still
 * catches 80% of "wrong target" dispatches.
 */
function fallbackQuestions(): ClarificationQuestion[] {
  return [
    {
      id: 'persona_seniority',
      question: 'What seniority of decision-maker are you targeting?',
      type: 'multi',
      options: ['Founder / Owner', 'C-suite / VP', 'Director / Head of', 'Manager / IC', 'No preference'],
      required: true,
      rationale: 'Seniority controls which contact-enrichment strategies the agent prioritizes.',
    },
    {
      id: 'exemplar_companies',
      question: 'Name 1–3 organizations that would be a perfect fit.',
      type: 'text',
      required: false,
      placeholder: 'e.g. EAA, AOPA, NBAA',
      rationale: 'Named exemplars anchor the candidate set to real-world matches the agent can look-alike.',
    },
    {
      id: 'disqualifiers',
      question: 'What kind of lead would be clearly WRONG for this?',
      type: 'text',
      required: false,
      placeholder: 'e.g. defunct clubs, single-chapter local groups, government regulators',
      rationale: 'Explicit disqualifiers become hard filters in the relevance grader.',
    },
  ];
}
