import { z } from 'zod';
import { DESIRED_FIELDS } from '../../utils/constants.js';

export const CreateJobSchema = z.object({
  rawQuery: z.string().min(10).max(500),
});

/**
 * Supported fact types. The UI formatter and CSV exporter both key off this.
 * Keep conservative — every new type requires corresponding UI handling.
 *   - text         : freeform short string
 *   - number       : unitless numeric (headcount, employees, etc.)
 *   - currency     : monetary amount — pair with { unit: "USD" | "NGN" | ... }
 *   - percentage   : 0-100 or 0-1 numeric with % suffix
 *   - date         : ISO date string (YYYY-MM-DD) or ISO datetime
 *   - url          : absolute URL, rendered as link
 *   - email        : email address, rendered with mailto:
 *   - phone        : phone number, rendered with tel:
 *   - tags         : short string array, rendered as chip list
 */
export const FactTypeSchema = z.enum([
  'text', 'number', 'currency', 'percentage',
  'date', 'url', 'email', 'phone', 'tags',
]);

/**
 * A single column the user asked for in their query output. Multiple columns
 * together form the `outputSchema` on ParsedIntent.
 *
 * `key` is a stable lowercase snake_case slug used as the map key in
 * `Lead.facts`. `label` is the human header. `type` drives UI formatting.
 * `required` controls whether leads missing this fact are flagged
 * "incomplete" on the UI (they are still written).
 */
export const OutputSchemaColumnSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, 'must be lowercase snake_case'),
  label: z.string().min(1).max(80),
  type: FactTypeSchema.default('text'),
  description: z.string().max(200).optional(),
  required: z.boolean().default(false),
});

export const ParsedIntentSchema = z.object({
  // Nullable: for named-entity / contact-lookup queries ("anyone at Acme Corp") the
  // industry is unknowable from the query text alone — enrichment fills it in later.
  industry: z.string().nullish(),
  subIndustry: z.string().nullish(),
  geography: z.object({
    country: z.string().nullish(),
    state: z.string().nullish(),
    city: z.string().nullish(),
  }),
  targetCount: z.number().int().min(1).max(1000).default(50),
  desiredFields: z.array(z.enum(DESIRED_FIELDS)).default(['businessEmail']),
  companySize: z.string().nullish(),
  keywords: z.array(z.string()).default([]),
  confidenceScore: z.number().min(0).max(1).default(0.8),
  queryType: z.enum(['named_entity_list', 'demographic_filter', 'contact_lookup']).default('demographic_filter'),
  namedEntities: z.array(z.string()).nullable().default(null),
  /**
   * Extra columns the user asked for beyond the standard contact fields.
   * e.g. "top 20 fintechs with funding info" → [{key:"amount_raised",...},
   * {key:"funding_round",...}]. Empty array when the query asks only for
   * standard fields. Agent fills in `Lead.facts[key]` when it finds values.
   */
  outputSchema: z.array(OutputSchemaColumnSchema).default([]),
});

/** A single fact value attached to a lead, keyed under Lead.facts. */
export const FactValueSchema = z.object({
  /** The actual value. Type depends on the paired outputSchema column. */
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).nullable(),
  /** Optional unit hint (e.g. "USD", "NGN" for currency; "employees" for number). */
  unit: z.string().optional(),
  /** Where we learned this — required when method implies a URL. */
  sourceUrl: z.string().url().optional(),
  /** 0-1 confidence. Distinct from lead rankScore. */
  confidence: z.number().min(0).max(1).optional(),
  /** Original raw text snippet, useful for debugging / audit. */
  raw: z.string().max(500).optional(),
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;
export type ParsedIntentOutput = z.infer<typeof ParsedIntentSchema>;
export type FactType = z.infer<typeof FactTypeSchema>;
export type OutputSchemaColumn = z.infer<typeof OutputSchemaColumnSchema>;
export type FactValue = z.infer<typeof FactValueSchema>;
