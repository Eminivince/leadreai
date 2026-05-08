/**
 * Verifies that agentReasoning renders below the AI score in the lead drawer.
 *
 * Strategy: intercept API calls so we don't need a real backend.
 *   /api/v1/auth/me        → fake logged-in user (stops the redirect to /login)
 *   /api/v1/workspaces/…   → fake workspace
 *   /api/v1/…/leads        → one mock lead WITH agentReasoning
 *   /api/v1/…/jobs         → empty job list
 *
 * Then navigate to the leads page, click the first row, and assert the
 * reasoning text appears inside the drawer.
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

const REASONING_TEXT =
  'Lagos-based commercial law firm with active contact page and verified Nigerian Bar registration.';

const MOCK_USER = {
  _id: 'user1',
  email: 'test@leadreai.com',
  name: 'Test User',
  workspaces: [{ _id: 'ws1', name: 'Test Workspace', role: 'owner' }],
};

const MOCK_LEAD = {
  _id: 'aaaaaa000000000000000001',
  workspaceId: 'ws1',
  jobId: 'job1',
  companyName: 'Eko Legal Partners',
  companyDomain: 'ekolegal.ng',
  website: 'https://ekolegal.ng',
  industry: 'Legal Services',
  address: { city: 'Lagos', country: 'Nigeria' },
  emails: [{ address: 'contact@ekolegal.ng', type: 'generic', confidence: 0.9, source: 'scraped' }],
  phones: [],
  sources: [{ url: 'https://ekolegal.ng/about', type: 'scraped_page' }],
  rankScore: 82,
  completenessScore: 75,
  isDuplicate: false,
  outreachStatus: 'new',
  qualificationStatus: 'qualified',
  qualificationScore: 0.87,
  agentReasoning: REASONING_TEXT,
  tags: ['agent_emitted'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function ok(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

test.describe('Lead drawer — agentReasoning', () => {
  test.beforeEach(async ({ page }) => {
    // Auth — /api/v1/auth/me so useAuth doesn't redirect to /login
    await page.route('**/api/v1/auth/me', (r) =>
      r.fulfill(ok({ success: true, data: MOCK_USER }))
    );

    // Workspace list — useWorkspace fetches /api/v1/workspaces (no trailing ID)
    // Must be matched BEFORE the more-specific /workspaces/ws1/* routes.
    await page.route(/\/api\/v1\/workspaces$/, (r) =>
      r.fulfill(ok({ success: true, data: [{ _id: 'ws1', name: 'Test Workspace' }] }))
    );

    // Jobs — empty (no active search banner)
    await page.route('**/api/v1/workspaces/ws1/jobs**', (r) =>
      r.fulfill(ok({ success: true, data: [], total: 0, page: 1, limit: 20 }))
    );

    // Credits
    await page.route('**/api/v1/workspaces/ws1/credits**', (r) =>
      r.fulfill(ok({ success: true, data: { balance: 100 } }))
    );
  });

  test('shows agentReasoning text below the AI score', async ({ page }) => {
    // Lead with agentReasoning
    await page.route('**/api/v1/workspaces/ws1/leads**', (r) =>
      r.fulfill(
        ok({ success: true, data: [MOCK_LEAD], total: 1, page: 1, limit: 100 })
      )
    );

    // Specific job — registered after beforeEach so LIFO gives it priority over
    // the blanket /jobs** mock, preventing the array-vs-object crash at job._id.slice(-4)
    await page.route('**/api/v1/workspaces/ws1/jobs/job1', (r) =>
      r.fulfill(ok({
        success: true,
        data: {
          _id: 'job1',
          rawQuery: 'Eko Legal test',
          status: 'complete',
          progress: { percentage: 100, leadsFoundSoFar: 1 },
          parsedIntent: { outputSchema: [], targetCount: 5 },
          createdAt: new Date().toISOString(),
        },
      }))
    );

    // Inject workspace selection before navigating (useWorkspace reads localStorage)
    await page.goto(BASE);
    await page.evaluate(() => localStorage.setItem('activeWorkspaceId', 'ws1'));

    // Navigate directly to job-scoped view — avoids the grouped-by-job table
    // where leads are hidden inside collapsed rows by default.
    await page.goto(`${BASE}/dashboard/leads?jobId=job1`);

    // Row should appear
    await expect(page.getByText('Eko Legal Partners')).toBeVisible({ timeout: 12_000 });

    // Open drawer by clicking the row
    await page.getByText('Eko Legal Partners').first().click();

    // AI score section should be visible
    await expect(page.getByText('AI score', { exact: false })).toBeVisible({ timeout: 5_000 });

    // The reasoning text must appear underneath
    await expect(page.getByText(REASONING_TEXT)).toBeVisible({ timeout: 3_000 });
  });

  test('shows nothing in the reasoning slot when agentReasoning is absent', async ({ page }) => {
    const noReasonLead = {
      ...MOCK_LEAD,
      _id: 'aaaaaa000000000000000002',
      agentReasoning: undefined,
    };

    await page.route('**/api/v1/workspaces/ws1/leads**', (r) =>
      r.fulfill(
        ok({ success: true, data: [noReasonLead], total: 1, page: 1, limit: 100 })
      )
    );

    // Same LIFO trick — specific job route takes priority over blanket /jobs** mock
    await page.route('**/api/v1/workspaces/ws1/jobs/job1', (r) =>
      r.fulfill(ok({
        success: true,
        data: {
          _id: 'job1',
          rawQuery: 'Eko Legal test',
          status: 'complete',
          progress: { percentage: 100, leadsFoundSoFar: 1 },
          parsedIntent: { outputSchema: [], targetCount: 5 },
          createdAt: new Date().toISOString(),
        },
      }))
    );

    await page.goto(BASE);
    await page.evaluate(() => localStorage.setItem('activeWorkspaceId', 'ws1'));

    await page.goto(`${BASE}/dashboard/leads?jobId=job1`);

    await expect(page.getByText('Eko Legal Partners')).toBeVisible({ timeout: 12_000 });
    await page.getByText('Eko Legal Partners').first().click();

    await expect(page.getByText('AI score', { exact: false })).toBeVisible({ timeout: 5_000 });

    // Reasoning text must NOT be in the drawer
    await expect(page.getByText(REASONING_TEXT)).not.toBeVisible();
  });
});
