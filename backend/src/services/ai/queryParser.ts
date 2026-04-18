import { ParsedIntentSchema, type ParsedIntent } from '@leadreai/shared';
import { generateText } from './aiProvider.js';
import { ApiError } from '../../utils/ApiError.js';

export const PARSER_SYSTEM_PROMPT = `You are a lead-generation query parser. Your sole job is to extract structured intent from a natural-language prospecting query and return it as a single, valid JSON object with NO markdown formatting, NO code fences, and NO extra text before or after the JSON.

Output EXACTLY this JSON schema (all keys required unless marked optional):

{
  "industry": "<string> — primary industry, e.g. 'fintech', 'law firms', 'accounting'",
  "subIndustry": "<string | null> — more specific vertical if mentioned, otherwise null",
  "geography": {
    "country": "<string | null> — country if mentioned, otherwise null",
    "state": "<string | null> — US state or equivalent if mentioned, otherwise null",
    "city": "<string | null> — city if mentioned, otherwise null"
  },
  "targetCount": "<number> — how many leads were requested; default 50 if not specified",
  "desiredFields": "<array of strings> — data fields inferred from the query context; pick any subset of: 'businessEmail', 'officePhone', 'mobilePhone', 'address', 'website', 'linkedin', 'whois', 'techStack'; default to ['businessEmail'] if none are implied",
  "companySize": "<string | null> — e.g. '50-200', 'startup', 'enterprise', or null if unspecified",
  "keywords": "<string[]> — relevant search terms extracted from the query",
  "confidenceScore": "<number 0–1> — your confidence that you have correctly parsed the intent"
}

Rules:
- Output ONLY the JSON object. No markdown, no code fences, no preamble, no explanation.
- Use null (not the string "null") for missing optional fields.
- targetCount must be an integer between 1 and 1000.
- confidenceScore must be a decimal between 0 and 1.
- desiredFields must be a non-empty array; default to ["businessEmail"] when the query gives no field hints.`;

/**
 * Parses a raw natural-language prospecting query into a structured ParsedIntent
 * using the configured AI provider.
 */
export async function parseQuery(rawQuery: string): Promise<ParsedIntent> {
  if (!rawQuery.trim()) {
    throw ApiError.badRequest('rawQuery must not be empty');
  }

  const response = await generateText(
    [{ role: 'user', content: rawQuery }],
    {
      systemPrompt: PARSER_SYSTEM_PROMPT,
      cacheSystem: true,
      maxTokens: 1024,
    },
  );

  // Extract the first {...} JSON object from the response; handles stray text or code fences
  const jsonMatch = response.text.match(/\{[\s\S]*\}/);
  const stripped = jsonMatch ? jsonMatch[0] : response.text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new ApiError(502, 'AI_PARSE_ERROR', 'AI returned unparseable response');
  }

  const result = ParsedIntentSchema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(502, 'AI_SCHEMA_ERROR', 'AI response did not match expected structure');
  }

  // Keep in sync with DESIRED_FIELDS constant
  return result.data;
}
