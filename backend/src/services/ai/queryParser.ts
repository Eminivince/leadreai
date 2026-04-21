import { ParsedIntentSchema, type ParsedIntent } from '@leadreai/shared';
import { generateText, type AiMessage } from './aiProvider.js';
import { ApiError } from '../../utils/ApiError.js';

export const PARSER_SYSTEM_PROMPT = `You are a lead-generation query parser. Your sole job is to extract structured intent from a natural-language prospecting query and return it as a single, valid JSON object.

CRITICAL OUTPUT RULES (violating any of these is a failure):
- Output ONLY the JSON object. First character MUST be "{". Last character MUST be "}".
- NO markdown, NO code fences, NO preamble, NO reasoning, NO explanation, NO trailing commentary.
- Do NOT "think out loud". Do NOT describe your reasoning. Emit the JSON and stop.

Output EXACTLY this JSON schema (all keys required; use null only where explicitly allowed):

{
  "industry": "<string | null> — primary industry if the query states or strongly implies one (e.g. 'fintech', 'law firms', 'accounting'). Use null ONLY when the query names a specific company by name without industry context (e.g. 'contact info for Acme Corp') — in that case enrichment will infer it later. DO NOT invent an industry from a company name alone.",
  "subIndustry": "<string | null> — more specific vertical if mentioned, otherwise null",
  "geography": {
    "country": "<string | null>",
    "state": "<string | null>",
    "city": "<string | null>"
  },
  "targetCount": "<integer 1-1000> — leads requested; default 50 if not specified; for 'top N' use N",
  "desiredFields": "<array of strings> — pick any subset of: 'businessEmail', 'officePhone', 'mobilePhone', 'address', 'website', 'linkedin', 'whois', 'techStack'; default to ['businessEmail'] if none implied. Infer: 'email' → 'businessEmail'; 'phone' → 'officePhone'; 'website' → 'website'; 'LinkedIn' → 'linkedin'; etc. NEVER invent new field names.",
  "companySize": "<string | null> — e.g. '50-200', 'startup', 'enterprise', or null",
  "keywords": "<string[]> — relevant search terms extracted from the query",
  "confidenceScore": "<number 0-1> — decimal confidence",
  "queryType": "<'named_entity_list' | 'demographic_filter' | 'contact_lookup'>",
  "namedEntities": "<string[] | null> — specific company/org names ONLY if query mentions them (e.g. ['Aluko & Oyebode']); null otherwise",
  "outputSchema": "<array> — extra columns the user wants beyond standard contact fields. One entry per column. Empty [] if the query only asks for standard fields (name/email/phone/website)."
}

outputSchema entries: each object has {key, label, type, description, required}.
- key: lowercase_snake_case slug (e.g. 'amount_raised', 'funding_round', 'raised_on', 'hire_count')
- label: human header (e.g. 'Amount Raised', 'Funding Round')
- type: one of 'text','number','currency','percentage','date','url','email','phone','tags'. PICK FROM THIS LIST ONLY.
- description: one-line meaning (optional, <200 chars)
- required: true if the user explicitly names this column; false if you're inferring it would be useful
Examples:
  "top 20 fintechs with funding info"
    → [{"key":"amount_raised","label":"Amount Raised","type":"currency","required":true},
       {"key":"funding_round","label":"Funding Round","type":"text","required":true},
       {"key":"raised_on","label":"Date Raised","type":"date","required":false}]
  "companies hiring engineers in Lagos"
    → [{"key":"open_roles","label":"Open Roles","type":"tags","required":true},
       {"key":"hire_count","label":"Hires Announced","type":"number","required":false}]
  "list 50 Nigerian fintechs, show company email and phone"
    → [] (email + phone are standard contact fields — use desiredFields, NOT outputSchema)
  Rule: if a requested column is already covered by standard contact fields (businessEmail, officePhone, mobilePhone, address, website, linkedin, whois, techStack), do NOT duplicate it in outputSchema — add it to desiredFields instead.

queryType classification:
- 'named_entity_list': user wants top-N or specific named orgs (e.g. 'top 10 law firms in Nigeria', 'biggest banks in Ghana')
- 'contact_lookup': user wants contact info for specific named companies (e.g. 'phone number of Aluko and Oyebode', 'anyone at FUR ALLE LIMITED')
- 'demographic_filter': filter-based prospecting (e.g. 'Series B fintechs in NYC using Salesforce')

Rules:
- targetCount must be an integer 1-1000.
- confidenceScore must be a decimal 0-1.
- desiredFields must be a non-empty array from the allowed enum ONLY.
- For named_entity_list with 'top N': set targetCount=N. If no specific names, namedEntities is null.
- For contact_lookup with explicit company names: list them in namedEntities.
- For demographic_filter: namedEntities is ALWAYS null.
- outputSchema is ALWAYS an array (possibly empty []), never null. Keys must be unique.

REMINDER: Your entire response must be a single valid JSON object. No prose before, no prose after. Start with "{". End with "}".`;

/**
 * Scans text for the first balanced {...} block. Returns the extracted substring or null.
 * Tolerant of prose before/after the JSON; tolerant of strings containing braces.
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
 * Parses a raw natural-language prospecting query into a structured ParsedIntent
 * using the configured AI provider. On schema failure, retries ONCE with a
 * correction prompt that includes the previous bad output and Zod's complaints.
 */
export async function parseQuery(rawQuery: string): Promise<ParsedIntent> {
  if (!rawQuery.trim()) {
    throw ApiError.badRequest('rawQuery must not be empty');
  }

  const conversation: AiMessage[] = [{ role: 'user', content: rawQuery }];
  const MAX_ATTEMPTS = 2;
  let lastRawResponse = '';
  let lastZodIssues: unknown = null;
  let lastParsed: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await generateText(conversation, {
      systemPrompt: PARSER_SYSTEM_PROMPT,
      cacheSystem: true,
      maxTokens: 2048,
    });
    lastRawResponse = response.text;

    const extracted = extractFirstJsonObject(response.text);
    if (!extracted) {
      console.error(
        '[queryParser] no JSON object found (attempt %d/%d)\nprovider=%s\nrawResponse=\n%s',
        attempt, MAX_ATTEMPTS, response.provider, response.text,
      );
      if (attempt === MAX_ATTEMPTS) {
        throw new ApiError(502, 'AI_PARSE_ERROR', 'AI returned unparseable response');
      }
      conversation.push(
        { role: 'assistant', content: response.text },
        { role: 'user', content: 'Your previous response contained no valid JSON object. Respond with ONLY the JSON object, starting with "{" and ending with "}". No prose. No reasoning. No preamble.' },
      );
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extracted);
    } catch {
      console.error(
        '[queryParser] JSON.parse failed (attempt %d/%d)\nextracted=\n%s',
        attempt, MAX_ATTEMPTS, extracted,
      );
      if (attempt === MAX_ATTEMPTS) {
        throw new ApiError(502, 'AI_PARSE_ERROR', 'AI returned unparseable response');
      }
      conversation.push(
        { role: 'assistant', content: response.text },
        { role: 'user', content: 'Your previous response had invalid JSON syntax. Respond with ONLY a syntactically valid JSON object. No prose. No trailing commas.' },
      );
      continue;
    }
    lastParsed = parsed;

    const result = ParsedIntentSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    lastZodIssues = result.error.issues;

    if (attempt === MAX_ATTEMPTS) {
      console.error(
        '[queryParser] AI_SCHEMA_ERROR after %d attempts\nprovider=%s\nrawQuery=%j\nlastRawResponse=\n%s\nlastParsedJSON=%j\nzodIssues=%j',
        MAX_ATTEMPTS, response.provider, rawQuery, lastRawResponse, lastParsed, lastZodIssues,
      );
      throw new ApiError(502, 'AI_SCHEMA_ERROR', 'AI response did not match expected structure');
    }

    // Feed the model its own output + the specific Zod complaints so it can correct.
    const issueSummary = result.error.issues
      .map((i) => `- path=${i.path.join('.') || '(root)'} code=${i.code} message=${i.message}`)
      .join('\n');
    conversation.push(
      { role: 'assistant', content: response.text },
      {
        role: 'user',
        content: `Your previous response failed schema validation:\n${issueSummary}\n\nRespond again with ONLY a valid JSON object that conforms to the schema. Fix the fields above. No prose. No reasoning. No preamble. Start with "{" and end with "}".`,
      },
    );
  }

  // Unreachable — loop always returns or throws — but satisfies TS.
  throw new ApiError(502, 'AI_SCHEMA_ERROR', 'AI response did not match expected structure');
}
