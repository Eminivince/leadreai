import { z } from 'zod';
import { DESIRED_FIELDS } from '../../utils/constants.js';

export const CreateJobSchema = z.object({
  rawQuery: z.string().min(10).max(500),
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
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;
export type ParsedIntentOutput = z.infer<typeof ParsedIntentSchema>;
