# Phase 11 — Research Skills Marketplace

## Goal

Turn one-off prospecting queries into **reusable, shareable, installable research Skills**. A Skill bundles a parsed intent template + output schema + system-prompt guidance into an artifact that can be re-run with minor parameter changes, shared within a workspace, published cross-workspace, and (eventually) sold.

## Commercial Outcome

- Positions the product as "Clay for on-demand research" — arbitrary columns with provenance, now also arbitrary *repeatable workflows*.
- Agencies publish their proprietary ICP research as Skills — this is the killer agency feature.
- First-run UX transforms: "stare at an empty compose box" → "pick from 20 curated Skills or write your own."
- Cross-workspace publishing is the groundwork for a paid Skills marketplace (Phase 11.x or later).

## What Users Can Do After This Phase

### M0 — `search_workspace_leads` tool (pre-Skills plumbing)
1. The agent has a new tool that returns matching leads from the workspace's existing research before hitting SERP.
2. Measured cost drop on repeat-topic jobs: materially fewer SERP + scrape calls when a workspace already has relevant leads.

### M1 — Skills v0 (save as Skill)
3. Save any completed job as a **Skill**: `{name, description, parsedIntent template, outputSchema, systemPromptOverride?}`.
4. Skills list page shows every saved Skill in the workspace.
5. "Run this Skill" button — prefills the compose with the Skill's raw-query template and jumps through the clarify step with Skill-provided defaults.

### M2 — Skills v1 (install + share)
6. Publish a workspace Skill as shareable — generates a shareable URL token.
7. Install a Skill from a share URL into your workspace.
8. The Skills list shows both owned + installed Skills.
9. "Run" on an installed Skill records attribution back to the publisher for future rev-share.

---

## Architecture Overview

### `search_workspace_leads` as the M0 primitive

This sits ahead of Skills because it's the more immediate commercial win AND it's the primitive Skills re-use at scale:

- Added to the 14-tool registry as entry #1 after `read_document` (cost tier: Library → **Workspace leads (new)** → Registries → SERP → Scrape).
- System-prompt rule: "Before calling `list_companies` or `search_web`, call `search_workspace_leads` with the industry / geography / keywords from the parsed intent. Leads already in your workspace are free and already validated."
- Returns `{_id, companyName, companyDomain, industry, address, topContact?, lastVerifiedAt}` for up-to-20 best matches. Full lead records available via subsequent `fetch_lead` if needed (optional; for M0 the summary is usually enough).

This alone can reduce the SERP-heavy agent loop by 20–40% for workspaces that do repeat research — and it's the foundation for the "Skills benefit from accumulated knowledge" feedback loop.

### Skills data model

```typescript
interface ISkill {
  _id: ObjectId;
  workspaceId: ObjectId;        // owner workspace
  createdBy: ObjectId;
  name: string;                  // "Series A Nigerian Fintechs + funding"
  description?: string;
  category?: 'funding' | 'portfolio_lookalike' | 'conference' | 'regulatory' | 'custom';
  intentTemplate: {
    // Fields with {{placeholders}} the user fills at run time.
    rawQueryTemplate: string;             // "Top {{count}} {{industry}} in {{country}} with recent funding"
    parameters: Array<{
      key: string;                        // 'count', 'industry', 'country'
      label: string;                      // 'Number of leads', 'Industry', 'Country'
      type: 'text' | 'number' | 'select';
      defaultValue?: string | number;
      options?: string[];                 // for 'select'
      required: boolean;
    }>;
    outputSchema: OutputSchemaColumn[];   // reuses the existing type
    systemPromptOverride?: string;         // optional — for very specialized Skills
  };
  origin: 'local' | { shareId: string; publishedBy: string }; // where this Skill came from
  stats: {
    timesRun: number;
    installedByWorkspaces?: number;        // only for published Skills
  };
  tags: string[];
  isPublished: boolean;
  publishedAt?: Date;
  shareToken?: string;                     // unique, 32-char, opaque
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes: `(workspaceId, updatedAt)`, `(shareToken)` unique sparse.

### Skill execution flow

Running a Skill doesn't bypass the existing job pipeline — it populates the clarify/submit flow:

```
User picks Skill → Skill parameter form (the `parameters[]` array from the template) →
Interpolate rawQueryTemplate with the user's params →
Flow through existing /jobs/clarify → clarify UI (rare, since a Skill should be specific) →
Submit /jobs with rawQuery + clarifications + optional parsedIntent overrides from the Skill →
Agent runs as normal, honoring the Skill's outputSchema and systemPromptOverride.
```

The `Skill.intentTemplate.outputSchema` gets passed through to the job — the agent already supports per-job output columns.

### Publishing + installing

Publishing a Skill mints a unique `shareToken`. Anyone with the URL `https://{app}/skills/install/{token}` hits a public (unauthenticated) endpoint that returns the Skill metadata + a prominent "Install to my workspace" button.

Installing copies the Skill into the target workspace with `origin.shareId` pointing at the publisher. This preserves attribution without coupling — the installed Skill is a full copy, so the publisher can edit their own without affecting installed clones.

**Cross-workspace safety**:
- `systemPromptOverride` strings are displayed to the installer BEFORE install, with a warning: "This Skill ships a custom system prompt. Review it here before installing." — stops prompt-injection via install.
- No executable code in Skills. Just data.
- Share tokens are revocable — publisher can unpublish; installed copies keep working but future installs 404.

---

## API Endpoints

### M0 (no new endpoints — tool registry addition only)

### M1 (Skills v0)
```
GET    /workspaces/:w/skills                    List workspace Skills
POST   /workspaces/:w/skills                    Create a Skill (body: full template)
POST   /workspaces/:w/skills/from-job/:jobId    Create a Skill from a completed job
GET    /workspaces/:w/skills/:skillId
PATCH  /workspaces/:w/skills/:skillId
DELETE /workspaces/:w/skills/:skillId
POST   /workspaces/:w/skills/:skillId/run       Interpolate params + start a job, returns {jobId}
```

### M2 (Skills v1)
```
POST   /workspaces/:w/skills/:skillId/publish   Mints shareToken, marks isPublished
POST   /workspaces/:w/skills/:skillId/unpublish Clears shareToken + flag (doesn't revoke installs)
GET    /public/skills/:shareToken               Returns Skill metadata (no auth required)
POST   /workspaces/:w/skills/install            Body: {shareToken}
```

Rate-limit the install endpoint — it's unauthenticated-read, installs are authed.

---

## File Map

### M0 additions
- `workers/src/pipeline/tools/searchWorkspaceLeads.ts` — new tool handler
- `workers/src/pipeline/tools/index.ts` — register tool, update registry ordering

### M1 additions
- `backend/src/models/Skill.ts`
- `backend/src/services/skills.ts` — create/run/interpolate helpers
- `backend/src/controllers/skills.controller.ts`
- `backend/src/routes/skills.routes.ts`
- `shared/src/types/skill.ts`
- `shared/src/schemas/zod/skill.schemas.ts`
- `frontend/src/app/(dashboard)/dashboard/skills/page.tsx` — Skills index
- `frontend/src/app/(dashboard)/dashboard/skills/[skillId]/page.tsx` — Skill detail + run form
- `frontend/src/components/skills/SaveAsSkillDialog.tsx` — from completed job

### M2 additions
- `backend/src/routes/public.routes.ts` (if not exists) — public Skill preview route
- `frontend/src/app/skills/install/[token]/page.tsx` — install landing page (outside dashboard, accessible without login)
- `frontend/src/components/skills/ShareSkillDialog.tsx`

### Modified
- `backend/src/app.ts` — mount skill routes
- `frontend/src/components/layout/Sidebar.tsx` — add Skills nav item

---

## Implementation Sequence

### M0 — `search_workspace_leads` (1–2 days)

1. Implement the tool handler that queries Mongo Leads by `workspaceId` + industry-keyword text search + geography match.
2. Register it in `TOOL_REGISTRY` at position #2 (after `read_document`, before `list_companies`).
3. Update `jobAgent.ts` system prompt to include a rule naming this tool as the first call for demographic queries.
4. Measure SERP-call reduction on repeat-topic jobs. Success criterion: 20%+ reduction on second-run of the same topic.

### M1 — Skills v0 (3–4 days)

5. Skill model + Zod schemas.
6. Create/list/get/patch/delete endpoints + controller.
7. "Save from job" endpoint — takes a completed job, derives a Skill template from its `parsedIntent` + `outputSchema`.
8. "Run Skill" endpoint — interpolates params into `rawQueryTemplate`, dispatches through existing `createJob` flow (which runs guardrail → clarifier → parse → job).
9. Frontend Skills index page + detail-with-run-form.
10. Integration: when a job completes, the active-dispatch UI gets a "Save as Skill" button.

### M2 — Skills v1 (2–3 days)

11. Publish / unpublish endpoints — mint/revoke `shareToken`.
12. Public skill-preview endpoint (no auth).
13. Install endpoint — copies Skill to workspace with `origin.shareId`.
14. Public install-landing page outside the dashboard.
15. Share dialog in Skill detail.

Total: **6–9 days** for all three milestones. M0 is independently useful and ships first.

---

## Verification Criteria

### M0
- Agent activity log shows `search_workspace_leads` called ahead of `list_companies` on a repeat-topic demographic query.
- A workspace with 200+ existing fintech leads, running "top Nigerian fintechs with funding" a second time, uses fewer than half the SERP calls of the first run.
- `search_workspace_leads` returns < 20 candidates even on broad queries (enforce `LIMIT 20`).

### M1
- Save a completed job as a Skill. List endpoint returns it. Detail shows editable params.
- Run the Skill with different `count` parameter. New job dispatches with correctly interpolated `rawQuery`.
- `outputSchema` on the Skill's template flows through to the job correctly — ranked facts appear.

### M2
- Publish Skill A in workspace X. Install into workspace Y via shareToken.
- Skill Y's `origin.shareId` is set; editing Skill A in X doesn't affect Y.
- Unpublishing Skill A in X → public preview returns 404; Skill Y in Y still runs.
- System-prompt-override Skills show the prompt preview in install landing page before install.

---

## Explicitly Out of Scope

- **Paid marketplace with revenue-share** — that needs Stripe Connect, author KYC, contracts. Phase 11.x or separate.
- **Skill versioning / updates** — edit-in-place is fine for v1. Versioned Skills + update-notification is future work.
- **Skill forking** — installed Skills are dead copies. "Fork and modify" comes later if there's demand.
- **Parameter types beyond text/number/select** — no file uploads or multi-select parameters in v1. Keep the template simple.
- **Skill chaining** — one Skill's output feeding another's input. Interesting, not v1.
- **Skill analytics for publishers** — "X workspaces ran your Skill this week." Needs auth story + dashboard, defer until demand proven.

## Connection to Other Phases

- **Phase 13 (Cost Explainer)** — Skills benefit dramatically from per-run cost visibility. Phase 13 should land first so Skill-authored flows have honest cost telemetry from day one.
- **Phase 6 (Saved Searches / Triggers)** — overlaps significantly. A scheduled Skill = a saved search. Consider folding Phase 6 into Phase 11 M3 rather than building twice.
- **Phase 12 (Evidence Graph Exports)** — Skills that produce evidence-preserving exports become a differentiator for regulated-industry buyers.
