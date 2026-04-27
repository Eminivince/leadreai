import { Redis } from 'ioredis';
import type { ParsedIntent } from '@leadreai/shared';
import type { LeadRecord } from '../deduplicator.js';
import { queueCompanyTool } from './queueCompany.js';

export interface Candidate {
  companyName: string;
  companyDomain?: string;
  hints: string[];
}

export interface ToolContext {
  jobId: string;
  workspaceId: string;
  publisher: Redis;
  parsedIntent: ParsedIntent;
  leadsSoFar: LeadRecord[];       // mutable — write_lead pushes here
  pagesScrapedThisJob: Set<string>; // dedupe scrapes across the job
  /** Populated only in dispatcher mode — `queue_company` tool pushes here. */
  candidatesSoFar?: Candidate[];
}

export interface ToolResult {
  ok: boolean;
  output: string;                 // short text fed back to the LLM (<4KB)
  meta?: Record<string, unknown>; // telemetry only, never shown to LLM
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolHandler = (args: any, ctx: ToolContext) => Promise<ToolResult>;

export interface ToolDef {
  name: string;
  description: string;           // one-line summary for the prompt
  parametersSchema: string;      // JSON-ish schema as a single string, rendered in prompt
  handler: ToolHandler;
}

// Re-export handlers from individual tool files
import { searchWebTool } from './searchWeb.js';
import { fetchUrlTool } from './fetchUrl.js';
import { fetchFileTool, getFileChunkTool } from './fetchFile.js';
import { transcribeUrlTool } from './transcribeUrl.js';
import { readDocumentTool } from './readDocument.js';
import { searchWorkspaceLeadsTool } from './searchWorkspaceLeads.js';
import { scrapePageTool } from './scrapePage.js';
import { lookupRegistryTool } from './lookupRegistry.js';
import { listCompaniesTool } from './listCompanies.js';
import { extractNamesFromUrlsTool } from './extractNamesFromUrls.js';
import { permuteEmailTool } from './permuteEmail.js';
import { verifyEmailTool } from './verifyEmail.js';
import { scoreLeadTool } from './scoreLead.js';
import { writeLeadTool } from './writeLead.js';

export const TOOL_REGISTRY: ToolDef[] = [
  // Library tier — cheapest, try first. User's own uploaded docs +
  // this workspace's accumulated prior research. Both are free, zero-
  // latency, and reuse work instead of paying to recreate it.
  readDocumentTool,
  searchWorkspaceLeadsTool,
  // Discovery — registry-first, SERP-second for demographic queries.
  listCompaniesTool, lookupRegistryTool,
  // Search — fall back to these when registry + library coverage is thin.
  searchWebTool, fetchUrlTool, fetchFileTool, getFileChunkTool, transcribeUrlTool, scrapePageTool,
  // Enrichment — person/contact extraction on discovered domains.
  extractNamesFromUrlsTool, permuteEmailTool, verifyEmailTool,
  // Scoring / finalize.
  scoreLeadTool, writeLeadTool,
];

export function renderToolMenu(tools: ToolDef[] = TOOL_REGISTRY): string {
  return tools.map(t =>
    `- ${t.name}(${t.parametersSchema}) — ${t.description}`
  ).join('\n');
}

export async function executeTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any,
  ctx: ToolContext,
  registry: ToolDef[] = TOOL_REGISTRY,
): Promise<ToolResult> {
  const def = registry.find(t => t.name === name);
  if (!def) return { ok: false, output: `unknown tool: ${name}. Valid tools: ${registry.map(t => t.name).join(', ')}` };
  try {
    return await def.handler(args ?? {}, ctx);
  } catch (err) {
    return { ok: false, output: `tool threw: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Role-scoped tool subsets for Phase 14 fan-out ──────────────────────────

const DISPATCHER_TOOL_NAMES = new Set([
  'read_document',
  'search_workspace_leads',
  'list_companies',
  'lookup_registry',
  'search_web',
  'fetch_url',
]);

const SUBAGENT_TOOL_NAMES = new Set([
  'fetch_url',
  'fetch_file',
  'get_file_chunk',
  'transcribe_url',
  'scrape_page',
  'extract_names_from_urls',
  'permute_email',
  'verify_email',
  'score_lead',
  'write_lead',
]);

/**
 * Discovery-only tools for the dispatcher agent.
 * Includes queue_company (not in TOOL_REGISTRY) as the output action.
 */
export const DISPATCHER_TOOLS: ToolDef[] = [
  ...TOOL_REGISTRY.filter(t => DISPATCHER_TOOL_NAMES.has(t.name)),
  queueCompanyTool,
];

/**
 * Enrichment-only tools for per-company subagents.
 * No discovery tools to prevent SERP explosions.
 */
export const SUBAGENT_TOOLS: ToolDef[] = TOOL_REGISTRY.filter(t =>
  SUBAGENT_TOOL_NAMES.has(t.name),
);
