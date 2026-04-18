import { OUTREACH_STATUSES, LEAD_EMAIL_TYPES, PHONE_TYPES, SOURCE_TYPES } from '../utils/constants.js';

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];
export type LeadEmailType = (typeof LEAD_EMAIL_TYPES)[number];
export type PhoneType = (typeof PHONE_TYPES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface LeadEmail {
  address: string;
  type: LeadEmailType;
  confidence: number;
  verified: boolean;
  verifiedAt?: string;
  source: string;
}

export interface LeadPhone {
  raw: string;
  normalized?: string;
  type?: PhoneType;
  countryCode?: string;
  source: string;
}

export interface SocialProfiles {
  linkedinUrl?: string;
  twitterUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
}

export interface LeadAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postcode?: string;
  fullText?: string;
}

export interface WhoisData {
  registrar?: string;
  registeredAt?: string;
  expiresAt?: string;
  registrantName?: string;
  registrantEmail?: string;
  registrantOrg?: string;
  nameservers: string[];
}

export interface DnsData {
  aRecords: string[];
  mxRecords: string[];
  txtRecords: string[];
  cnameRecords: string[];
}

export interface SslData {
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  subject?: string;
  altNames: string[];
}

export interface LeadOsint {
  whois?: WhoisData;
  dns?: DnsData;
  ssl?: SslData;
  techStack: string[];
  estimatedEmployees?: number;
  linkedinFollowers?: number;
  linkedinHeadquarters?: string;
}

export interface LeadSource {
  url: string;
  type: SourceType;
  scrapedAt: string;
  confidence: number;
}

export interface Lead {
  _id: string;
  workspaceId: string;
  jobId: string;
  companyName: string;
  companyDomain?: string;
  companyType?: string;
  industry?: string;
  subIndustry?: string;
  description?: string;
  address?: LeadAddress;
  emails: LeadEmail[];
  phones: LeadPhone[];
  socialProfiles?: SocialProfiles;
  website?: string;
  osint?: LeadOsint;
  sources: LeadSource[];
  rawSnippets: string[];
  rankScore: number;
  completenessScore: number;
  isVerified: boolean;
  isDuplicate: boolean;
  mergedIntoId?: string;
  outreachStatus: OutreachStatus;
  tags: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
