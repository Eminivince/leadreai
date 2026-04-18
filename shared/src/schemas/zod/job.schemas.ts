import { z } from 'zod';

export const CreateJobSchema = z.object({
  rawQuery: z.string().min(10).max(500),
});

export const ParsedIntentSchema = z.object({
  industry: z.string(),
  subIndustry: z.string().optional(),
  geography: z.object({
    country: z.string().optional(),
    state: z.string().optional(),
    city: z.string().optional(),
  }),
  targetCount: z.number().int().min(1).max(1000),
  desiredFields: z.array(z.string()),
  companySize: z.string().optional(),
  keywords: z.array(z.string()),
  confidenceScore: z.number().min(0).max(1),
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;
export type ParsedIntentOutput = z.infer<typeof ParsedIntentSchema>;
