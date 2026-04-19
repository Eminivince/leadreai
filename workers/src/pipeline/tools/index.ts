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
import { scrapePageTool } from './scrapePage.js';
import { lookupRegistryTool } from './lookupRegistry.js';
import { guessDomainsTool } from './guessDomains.js';
import { extractNamesFromUrlsTool } from './extractNamesFromUrls.js';
import { permuteEmailTool } from './permuteEmail.js';
import { verifyEmailTool } from './verifyEmail.js';
import { scoreLeadTool } from './scoreLead.js';
import { writeLeadTool } from './writeLead.js';

export const TOOL_REGISTRY: ToolDef[] = [
  searchWebTool, fetchUrlTool, scrapePageTool, lookupRegistryTool,
  guessDomainsTool, extractNamesFromUrlsTool, permuteEmailTool,
  verifyEmailTool, scoreLeadTool, writeLeadTool,
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
