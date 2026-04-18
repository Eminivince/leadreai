export interface LeadEmail {
  address: string;
  type: 'business' | 'generic' | 'personal' | 'pattern_inferred';
  confidence: number;
  verified: boolean;
  verifiedAt?: string;
  source: string;
}

export interface LeadPhone {
  raw: string;
  normalized?: string;
  type?: 'office' | 'mobile' | 'fax';
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
  type:
    | 'serpapi'
    | 'scraped_page'
    | 'pdf'
    | 'docx'
    | 'xlsx'
    | 'whois'
    | 'dns'
    | 'ssl'
    | 'linkedin';
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
  outreachStatus: 'not_contacted' | 'draft_created' | 'sent' | 'replied' | 'bounced';
  tags: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
