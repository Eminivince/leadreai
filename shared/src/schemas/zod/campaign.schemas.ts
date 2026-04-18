import { z } from 'zod';

export const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  leadIds: z.array(z.string()).min(1),
  outreachConfig: z.object({
    channel: z.enum(['email', 'linkedin', 'sms']),
    tone: z.string().min(1),
    language: z.string().default('English'),
    personalization: z.array(z.string()).default([]),
    systemPromptOverride: z.string().optional(),
  }),
});

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
