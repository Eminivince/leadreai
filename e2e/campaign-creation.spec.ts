/**
 * End-to-end: campaign creation flow (multi-step wizard).
 *
 * Uses the table that has olaoye.esq@gmail.com as its only row.
 * Auth + workspace are mocked (same pattern as lead-drawer-reasoning.spec.ts)
 * so the test is deterministic and doesn't need a seeded DB. All other API
 * calls are mocked to return realistic payloads that mirror what the real
 * backend returns for this workspace/table.
 *
 * 4-step wizard flow:
 *   Step 0 — Audience: pick file/table, name campaign
 *   Step 1 — Sequence: fill email step subject + body
 *   Step 2 — Schedule: set send window (toggle Anytime), click "Save & review"
 *   Step 3 — Review: see preflight → "Activate campaign" → "You're live."
 */

import { test, expect, type Route, type Request } from '@playwright/test';

/* ─── Constants ──────────────────────────────────────────────────── */
const BASE = 'http://localhost:3000';
const WS_ID = 'ws1';
const TABLE_ID = '69e8fa94ba5e37d9c7d6ce36';
const FILE_ID = 'aaaaaa000000000000000001';
const CAMPAIGN_ID = 'bbbbbb000000000000000001';
const SEQ_ID = 'cccccc000000000000000001';

/* ─── Mock data ──────────────────────────────────────────────────── */
const MOCK_USER = {
  _id: 'user1',
  email: 'forchatandwork@gmail.com',
  name: 'Test User',
  workspaces: [{ _id: WS_ID, name: 'Test Workspace', role: 'owner' }],
};

const MOCK_TABLE = {
  _id: TABLE_ID,
  name: 'Olaoye Contacts',
  rowCount: 1,
  rowType: 'lead',
};

const MOCK_PREFLIGHT = {
  totalInFile: 1,
  eligibleLeadsCount: 1,
  skipped: { noEmail: 0, suppressed: 0, filtered: 0, alreadyEnrolled: 0 },
  hasEmailConfig: true,
  firstSendAt: '2026-05-05T09:00:00.000Z',
};

const MOCK_ACTIVATE = {
  enrolled: 1,
  skipped: 0,
  firstSendAt: '2026-05-05T09:00:00.000Z',
};

function ok(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: body }),
  };
}

/* ─── Helpers ────────────────────────────────────────────────────── */
async function setupBaseRoutes(page: InstanceType<typeof import('@playwright/test').Page>) {
  await page.route('**/api/v1/auth/me', (r) =>
    r.fulfill(ok(MOCK_USER))
  );
  await page.route(/\/api\/v1\/workspaces$/, (r) =>
    r.fulfill(ok([{ _id: WS_ID, name: 'Test Workspace' }]))
  );
  await page.route(`**/api/v1/workspaces/${WS_ID}/credits**`, (r) =>
    r.fulfill(ok({ balance: 500, plan: 'pro' }))
  );
  await page.route(`**/api/v1/workspaces/${WS_ID}/jobs**`, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], total: 0 }) })
  );
  // Campaigns list — start empty
  await page.route(`**/api/v1/workspaces/${WS_ID}/campaigns**`, (r) => {
    if (r.request().method() === 'GET') {
      return r.fulfill(ok({ data: [], total: 0 }));
    }
    return r.continue();
  });
}

/* ─── Tests ──────────────────────────────────────────────────────── */
test.describe('Campaign creation — end-to-end', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page);

    // Files list — none (forces table picker)
    await page.route(`**/api/v1/workspaces/${WS_ID}/files**`, (r) =>
      r.fulfill(ok({ data: [], total: 0 }))
    );

    // Tables list — the olaoye table
    await page.route(`**/api/v1/workspaces/${WS_ID}/tables**`, (r) =>
      r.fulfill(ok({ data: [MOCK_TABLE], total: 1 }))
    );

    // Table → file conversion
    await page.route(`**/api/v1/workspaces/${WS_ID}/tables/${TABLE_ID}/to-file`, (r) =>
      r.fulfill(ok({ fileId: FILE_ID, name: 'Olaoye Contacts File', leadCount: 1 }))
    );

    // Campaign create — validate payload then return
    await page.route(`**/api/v1/workspaces/${WS_ID}/campaigns`, async (r: Route) => {
      if (r.request().method() === 'POST') {
        return r.fulfill(ok({ campaign: { _id: CAMPAIGN_ID }, sequence: { _id: SEQ_ID } }));
      }
      return r.continue();
    });

    // Preflight
    await page.route(`**/api/v1/workspaces/${WS_ID}/campaigns/${CAMPAIGN_ID}/preflight`, (r) =>
      r.fulfill(ok(MOCK_PREFLIGHT))
    );

    // Activate
    await page.route(`**/api/v1/workspaces/${WS_ID}/campaigns/${CAMPAIGN_ID}/activate`, (r) =>
      r.fulfill(ok(MOCK_ACTIVATE))
    );

    // Bootstrap workspace selection
    await page.goto(BASE);
    await page.evaluate((wsId) => localStorage.setItem('activeWorkspaceId', wsId), WS_ID);
  });

  test('creates a campaign and activates it end-to-end', async ({ page }) => {
    /* ── 1. Navigate to campaigns list ── */
    await page.goto(`${BASE}/dashboard/campaigns`);
    await expect(page.getByRole('heading', { name: 'Campaigns' })).toBeVisible({ timeout: 12_000 });

    /* ── 2. Open wizard ── */
    await page.getByRole('button', { name: /new campaign/i }).click();

    /* ── 3. Step 0 — Audience: enter campaign name ── */
    const nameInput = page.getByPlaceholder(/name your campaign/i);
    await expect(nameInput).toBeVisible({ timeout: 8_000 });
    await nameInput.fill('Olaoye E2E Test');

    /* ── 4. Pick the audience table ── */
    await expect(page.getByText('Olaoye Contacts')).toBeVisible({ timeout: 8_000 });
    await page.getByText('Olaoye Contacts').first().click();

    // Convert-to-file inline form — fill name and confirm
    await expect(page.getByRole('button', { name: /^use$/i })).toBeVisible({ timeout: 5_000 });
    const convertDiv = page.locator('div').filter({ hasText: 'Name this file for use in campaigns:' }).last();
    const convertInput = convertDiv.locator('input[type="text"]');
    await convertInput.fill('Olaoye Contacts File');
    await page.getByRole('button', { name: /^use$/i }).click();

    // Audience confirmed — green checkmark with file name
    await expect(page.getByText('Olaoye Contacts File')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('1 leads').first()).toBeVisible();

    /* ── 5. Continue to Step 1 — Sequence ── */
    await page.getByRole('button', { name: /continue/i }).click();

    // Email step 1 is expanded by default
    const subjectInput = page.getByPlaceholder(/quick thought on/i);
    await expect(subjectInput).toBeVisible({ timeout: 5_000 });
    await subjectInput.fill('Quick intro — LeadreAI');

    const bodyInput = page.getByPlaceholder(/Hi \{\{first_name\}\}/i);
    await bodyInput.fill('Hi {{first_name}},\n\nWanted to reach out about LeadreAI.\n\nBest,\nTest');

    /* ── 6. Continue to Step 2 — Schedule ── */
    await page.getByRole('button', { name: /continue/i }).click();

    // Toggle "Anytime" mode
    await page.getByRole('button', { name: /anytime/i }).first().click();
    await expect(page.getByText('No time restrictions')).toBeVisible({ timeout: 3_000 });

    /* ── 7. Save & review — capture the create request ── */
    const [createRequest] = await Promise.all([
      page.waitForRequest((req) =>
        req.url().includes(`/workspaces/${WS_ID}/campaigns`) && req.method() === 'POST'
      ),
      page.getByRole('button', { name: /save & review/i }).click(),
    ]);

    // Validate the payload shape
    const body = JSON.parse(createRequest.postData() ?? '{}') as Record<string, unknown>;
    expect(Array.isArray(body.steps), 'steps must be a top-level array').toBeTruthy();
    expect(body.steps).toHaveLength(1);
    expect(body.fileId).toBe(FILE_ID);
    expect(body.audienceFilters).toMatchObject({ hotOnly: false, verifiedOnly: false });

    // Steps must have flat subject/body
    const step = (body.steps as Record<string, unknown>[])[0];
    expect(typeof step?.subject, 'subject must be flat string').toBe('string');
    expect(typeof step?.body, 'body must be flat string').toBe('string');
    expect(step?.subject).toBe('Quick intro — LeadreAI');

    // Schedule: anytime → unrestricted hours
    const schedule = body.schedule as Record<string, unknown>;
    expect(schedule?.startHour).toBe(0);
    expect(schedule?.endHour).toBe(24);
    expect(schedule?.allowedDays).toEqual([0, 1, 2, 3, 4, 5, 6]);

    /* ── 8. Step 3 — Review: preflight loaded ── */
    await expect(page.getByText(/of 1 leads will be enrolled/i)).toBeVisible({ timeout: 8_000 });

    /* ── 9. Activate ── */
    await page.getByRole('button', { name: /activate campaign/i }).click();

    // "You're live." success state
    await expect(page.getByText(/live\./i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/1 leads enrolled/i)).toBeVisible();

    /* ── 10. View campaign navigates to detail ── */
    await page.getByRole('button', { name: /view campaign/i }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/campaigns/${CAMPAIGN_ID}`), { timeout: 5_000 });
  });

  test('shows blockers when required fields are missing', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/campaigns`);
    await page.getByRole('button', { name: /new campaign/i }).click();

    // On step 0 (Audience), "Continue" is disabled until name + audience are set
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeVisible({ timeout: 8_000 });
    await expect(continueBtn).toBeDisabled();

    // Enter name only — still no audience → still disabled
    await page.getByPlaceholder(/name your campaign/i).fill('Test Campaign');
    await expect(continueBtn).toBeDisabled();

    // After picking an audience the button becomes enabled
    await expect(page.getByText('Olaoye Contacts')).toBeVisible({ timeout: 8_000 });
    await page.getByText('Olaoye Contacts').first().click();
    await expect(page.getByRole('button', { name: /^use$/i })).toBeVisible({ timeout: 5_000 });
    const convertDiv = page.locator('div').filter({ hasText: 'Name this file for use in campaigns:' }).last();
    await convertDiv.locator('input[type="text"]').fill('Olaoye Contacts File');
    await page.getByRole('button', { name: /^use$/i }).click();
    // Mock returns name 'Olaoye Contacts File' — confirm audience selected
    await expect(page.getByText('Olaoye Contacts File')).toBeVisible({ timeout: 5_000 });
    await expect(continueBtn).toBeEnabled();
  });

  test('anytime toggle correctly shows/hides business hours controls', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/campaigns`);
    await page.getByRole('button', { name: /new campaign/i }).click();

    // Navigate to Step 2 — Schedule (need to go through step 0 and 1 first)
    await page.getByPlaceholder(/name your campaign/i).fill('Toggle Test');
    await expect(page.getByText('Olaoye Contacts')).toBeVisible({ timeout: 8_000 });
    await page.getByText('Olaoye Contacts').first().click();
    await expect(page.getByRole('button', { name: /^use$/i })).toBeVisible({ timeout: 5_000 });
    const convertDiv = page.locator('div').filter({ hasText: 'Name this file for use in campaigns:' }).last();
    await convertDiv.locator('input[type="text"]').fill('Olaoye Contacts File');
    await page.getByRole('button', { name: /^use$/i }).click();
    // Mock returns name 'Olaoye Contacts File' — confirm audience selected
    await expect(page.getByText('Olaoye Contacts File')).toBeVisible({ timeout: 5_000 });

    // Step 0 → Step 1 (Sequence)
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByPlaceholder(/quick thought on/i)).toBeVisible({ timeout: 5_000 });

    // Step 1 → Step 2 (Schedule)
    await page.getByRole('button', { name: /continue/i }).click();

    // Default: business hours mode — day buttons visible
    await expect(page.getByRole('button', { name: /^M$/ }).first()).toBeVisible({ timeout: 8_000 });

    // Switch to Anytime
    await page.getByRole('button', { name: /anytime/i }).first().click();
    await expect(page.getByText('No time restrictions')).toBeVisible();
    await expect(page.getByRole('button', { name: /^M$/ }).first()).not.toBeVisible();

    // Switch back to Business hours
    await page.getByRole('button', { name: /business hours/i }).first().click();
    await expect(page.getByRole('button', { name: /^M$/ }).first()).toBeVisible();
    await expect(page.getByText('No time restrictions')).not.toBeVisible();
  });
});
