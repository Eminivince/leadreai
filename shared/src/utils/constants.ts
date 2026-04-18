export const JOB_STATUSES = [
  'queued',
  'parsing',
  'collecting',
  'enriching',
  'deduplicating',
  'complete',
  'failed',
  'cancelled',
] as const;

export const OUTREACH_CHANNELS = ['email', 'linkedin', 'sms'] as const;

export const PLAN_TIERS = ['free', 'pro', 'enterprise'] as const;

export const WORKSPACE_ROLES = ['owner', 'admin', 'member'] as const;

export const LEAD_EMAIL_TYPES = [
  'business',
  'generic',
  'personal',
  'pattern_inferred',
] as const;

export const PHONE_TYPES = ['office', 'mobile', 'fax'] as const;

export const OUTREACH_STATUSES = [
  'not_contacted',
  'draft_created',
  'sent',
  'replied',
  'bounced',
] as const;

export const SOURCE_TYPES = [
  'serpapi',
  'scraped_page',
  'pdf',
  'docx',
  'xlsx',
  'whois',
  'dns',
  'ssl',
  'linkedin',
] as const;

export const DESIRED_FIELDS = [
  'businessEmail', 'officePhone', 'mobilePhone',
  'address', 'website', 'linkedin', 'whois', 'techStack',
] as const;
export type DesiredField = typeof DESIRED_FIELDS[number];
