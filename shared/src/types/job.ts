export type JobStatus =
  | 'queued'
  | 'parsing'
  | 'collecting'
  | 'enriching'
  | 'deduplicating'
  | 'complete'
  | 'failed'
  | 'cancelled';

export interface JobGeography {
  country?: string | null;
  state?: string | null;
  city?: string | null;
}

export interface ParsedIntent {
  industry: string;
  subIndustry?: string | null;
  geography: JobGeography;
  targetCount: number;
  desiredFields: string[];
  companySize?: string | null;
  keywords: string[];
  confidenceScore: number;
}

export interface JobProgress {
  percentage: number;
  currentStage: string;
  stagesComplete: string[];
  leadsFoundSoFar: number;
}

export interface JobResult {
  totalLeadsFound: number;
  totalAfterDedup: number;
  dorkQueriesUsed: string[];
  sourcesScraped: string[];
  filesDownloaded: number;
  durationMs: number;
}

export interface JobError {
  message: string;
  stack?: string;
  stage: string;
}

export interface ProspectingJob {
  _id: string;
  workspaceId: string;
  createdBy: string;
  rawQuery: string;
  parsedIntent?: ParsedIntent;
  status: JobStatus;
  progress: JobProgress;
  result?: JobResult;
  error?: JobError;
  bullmqJobId?: string;
  creditsCharged: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
