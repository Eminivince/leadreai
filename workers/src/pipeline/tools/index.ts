import { Redis } from 'ioredis';
import type { ParsedIntent } from '@leadreai/shared';
import type { LeadRecord } from '../deduplicator.js';

export interface ToolContext {
  jobId: string;
  workspaceId: string;
  publisher: Redis;
  parsedIntent: ParsedIntent;
  leadsSoFar: LeadRecord[];       // mutable — write_lead pushes here
  pagesScrapedThisJob: Set<string>; // dedupe scrapes across the job
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

export function renderToolMenu(): string {
  return TOOL_REGISTRY.map(t =>
    `- ${t.name}(${t.parametersSchema}) — ${t.description}`
  ).join('\n');
}

export async function executeTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any,
  ctx: ToolContext,
): Promise<ToolResult> {
  const def = TOOL_REGISTRY.find(t => t.name === name);
  if (!def) return { ok: false, output: `unknown tool: ${name}. Valid tools: ${TOOL_REGISTRY.map(t => t.name).join(', ')}` };
  try {
    return await def.handler(args ?? {}, ctx);
  } catch (err) {
    return { ok: false, output: `tool threw: ${err instanceof Error ? err.message : String(err)}` };
  }
}
