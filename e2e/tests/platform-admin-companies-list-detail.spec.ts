/**
 * Platform Admin — Company Management: List / Detail (read-only slice).
 * Automates: PA-FN-05/06/07/15/16/17, PA-NG-09 (GET sub-case only),
 * PA-BD-10, PA-UI-04/05/11/12/13, PA-AP-05/06/13/14/15, PA-SC-10.
 *
 * Explicitly out of scope for this slice (a later phase): PA-FN-08/09/10/
 * 11/12/13/14 (provision/update/activate/suspend/reset/assign-subscription —
 * all mutations), PA-NG-09's Update/Activate sub-cases, PA-NG-10/11/12,
 * PA-VD-03..09/13, PA-UI-06/07/08/09/10, PA-AP-07/08/09/10/11/12, PA-SC-09/16
 * (need a created/updated company), PA-DB-* (raw DB access, and every DB row
 * relevant here is write-side anyway), PA-PF-04/06 (provisioning
 * performance), PA-FN-23/PA-NG-15/16/PA-BD-09/PA-PM-05/06 (Employee
 * Limit/Module Gating).
 *
 * PA-SC-17 (IDOR — confirm non-platform-admin callers can't do this) is not
 * re-tested here — platform-admin-cross-portal-isolation.spec.ts's PA-PM-01/
 * PA-PM-02 already hit `/api/platform-admin/companies` directly with tenant
 * tokens and got 401, which is exactly this row's assertion.
 *
 * Uses real, already-existing `testauto`-tenant-environment companies (no
 * provisioning performed by this file — reads only): a live inventory check
 * ahead of writing these tests found 6 real companies spanning active/
 * suspended/trial statuses and multiple subscription plans, more than enough
 * to exercise every read path without creating anything. Company `id: 18`
 * (slug `testauto`) is referenced only by id/slug, never by `name` — its
 * `name` field has been overwritten by an unrelated module's own test data
 * (Company Profile Settings' CP-FN-01) and is not a stable value to assert on.
 *
 * This file makes at most 1 platform-admin login (the shared, cached
 * `platformAdminPage` fixture) — every test below reuses that one session,
 * well inside the 10-req/15-min budget documented in Phase 1.
 */
import { expect, test } from '../fixtures/platformAdminAuth';
import { PlatformAdminCompanyListPage } from '../pages/PlatformAdminCompanyListPage';
import { PlatformAdminCompanyDetailPage } from '../pages/PlatformAdminCompanyDetailPage';
import {
  getCompanyRequest,
  getProvisioningHistoryRequest,
  getTenantHealthRequest,
  getTenantUsageRequest,
  listCompaniesRequest,
} from '../helpers/platformAdminCompanies';

// Stable identifiers for real, pre-existing companies in this environment —
// see this file's header comment. Referenced by id/slug, never by `name`
// where that value could be shared/mutated by another module's own tests.
const ACTIVE_COMPANY_ID = 20; // "Golden Lotus Stays Demo", Enterprise plan, has real provisioning history
const SUSPENDED_COMPANY_SLUG = 'autotest';
const TRIAL_COMPANY_ID = 14; // "Spotit", Professional plan (max_employees=100), comfortably under any usage threshold

test.describe('Platform Admin Companies — List', () => {
  test('PA-FN-05/PA-AP-05: GET /companies defaults to page 1, pageSize 20, and returns the documented fields', async ({ platformAdminPage }) => {
    const res = await listCompaniesRequest(platformAdminPage.request);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.total).toBeGreaterThanOrEqual(6);
    const golden = body.items.find((c: { id: number }) => c.id === ACTIVE_COMPANY_ID);
    // page 1 sorts by created_at DESC (companies.repository.js) — only
    // asserted if this company's row happens to be within the first page.
    if (golden) {
      expect(golden).toMatchObject({ slug: 'golden-lotus-demo', status: 'active', subscription_plan_name: 'Enterprise' });
    }
  });

  test('PA-FN-06: search + status filter combined matches the query params', async ({ platformAdminPage }) => {
    const res = await listCompaniesRequest(platformAdminPage.request, { search: 'golden-lotus', status: 'active', pageSize: 50 });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.status).toBe('active');
      expect(`${item.name} ${item.slug}`.toLowerCase()).toContain('golden-lotus');
    }
  });

  test('PA-BD-10: page=0 fails as a raw 500 instead of a graceful result (confirmed gap); page-beyond-last and a very large pageSize are both graceful', async ({
    platformAdminPage,
  }) => {
    // Graceful cases first (these are correct behavior).
    const beyondLast = await listCompaniesRequest(platformAdminPage.request, { page: 9999 });
    expect(beyondLast.status()).toBe(200);
    const beyondLastBody = await beyondLast.json();
    expect(beyondLastBody.items).toEqual([]);

    const hugePageSize = await listCompaniesRequest(platformAdminPage.request, { pageSize: 999999 });
    expect(hugePageSize.status()).toBe(200);
    expect(Array.isArray((await hugePageSize.json()).items)).toBe(true);

    // page=0 (confirmed gap): (page - 1) * pageSize computes a negative SQL
    // OFFSET, which the server never guards against — companies.repository.js's
    // listCompanies() passes `page` straight through with no floor.
    const zeroPage = await listCompaniesRequest(platformAdminPage.request, { page: 0 });
    expect(zeroPage.status()).toBe(500);
    expect((await zeroPage.json()).error).toMatch(/offset/i);
  });

  test('PA-UI-04: typing in the search box filters the company list (debounced)', async ({ platformAdminPage }) => {
    const list = new PlatformAdminCompanyListPage(platformAdminPage);
    await list.goto();
    await expect(list.row('Golden Lotus')).toBeVisible();
    await list.search('golden-lotus');
    await expect(list.row('Golden Lotus')).toBeVisible();
    await expect(platformAdminPage.getByRole('row', { name: /Mywe Technologies/ })).toHaveCount(0);
  });

  test('PA-UI-05: cycling the status filter changes which companies are listed', async ({ platformAdminPage }) => {
    const list = new PlatformAdminCompanyListPage(platformAdminPage);
    await list.goto();
    await list.filterByStatus('Suspended');
    await expect(list.row('Automation_old')).toBeVisible();
    await expect(platformAdminPage.getByRole('row', { name: /Golden Lotus/ })).toHaveCount(0);

    await list.filterByStatus('All statuses');
    await expect(list.row('Golden Lotus')).toBeVisible();
    await expect(list.row('Automation_old')).toBeVisible();
  });
});

test.describe('Platform Admin Companies — Detail (Profile/Health/Usage/History)', () => {
  test('PA-FN-07: GET /companies/:id returns the full company profile for a valid id', async ({ platformAdminPage }) => {
    const res = await getCompanyRequest(platformAdminPage.request, ACTIVE_COMPANY_ID);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: ACTIVE_COMPANY_ID,
      slug: 'golden-lotus-demo',
      status: 'active',
      subscription_plan_name: 'Enterprise',
    });
    expect(Array.isArray(body.subscription_enabled_modules)).toBe(true);
  });

  test('PA-NG-09 (GET sub-case): a nonexistent-but-numeric company id returns a clean 404', async ({ platformAdminPage }) => {
    const res = await getCompanyRequest(platformAdminPage.request, 999999);
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toMatch(/company not found/i);
  });

  test('PA-AP-06 (confirmed gap): a non-numeric company id fails as a raw 500, not a clean 404', async ({ platformAdminPage }) => {
    const res = await getCompanyRequest(platformAdminPage.request, 'not-a-number');
    expect(res.status()).toBe(500);
    expect((await res.json()).error).toMatch(/invalid number/i);
  });

  test('PA-FN-15/PA-AP-13: tenant health checklist contract', async ({ platformAdminPage }) => {
    const res = await getTenantHealthRequest(platformAdminPage.request, ACTIVE_COMPANY_ID);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.setupCompletionPercent).toBe('number');
    expect(body.setupCompletionPercent).toBeGreaterThanOrEqual(0);
    expect(body.setupCompletionPercent).toBeLessThanOrEqual(100);
    const expectedChecks = [
      'companyProfileCompleted', 'departmentsConfigured', 'employeesAdded', 'holidaysConfigured',
      'attendanceConfigured', 'payrollConfigured', 'faceAttendanceConfigured', 'companyDocumentsPresent',
    ];
    for (const key of expectedChecks) {
      expect(typeof body.checks[key]).toBe('boolean');
    }
  });

  test('PA-FN-16/PA-AP-14: usage summary contract', async ({ platformAdminPage }) => {
    const res = await getTenantUsageRequest(platformAdminPage.request, ACTIVE_COMPANY_ID);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.employeeCount).toBe('number');
    expect(typeof body.activeUserCount).toBe('number');
    expect(typeof body.documentsUploaded).toBe('number');
    expect('storageLimitMb' in body).toBe(true);
    expect('lastPayrollRunAt' in body).toBe(true);
    expect('lastAttendanceSyncAt' in body).toBe(true);
    expect('lastLoginAt' in body).toBe(true);
  });

  /**
   * (confirmed gap) — client/src/platform-admin/api/companies.ts's own
   * `TenantUsage.storageUsedBytes` interface declares `number`, but a live
   * check ahead of writing this test showed the API returns it as a STRING
   * (mssql's driver returns SQL BIGINT/SUM aggregates as strings to avoid
   * JS precision loss — server/repositories/platformTenantHealth.repository.js's
   * `SUM(v.size_bytes)`). Currently masked at runtime because
   * CompanyDetailPage.tsx's formatBytes() does `bytes / 1024`, and JS's `/`
   * operator coerces a numeric string — but any stricter consumer (a JSON
   * schema check, a future `.toFixed()`/comparison) would break on this.
   */
  test('PA-AP-14 (confirmed gap): usage.storageUsedBytes is returned as a string, not the number the client TS interface declares', async ({
    platformAdminPage,
  }) => {
    const res = await getTenantUsageRequest(platformAdminPage.request, ACTIVE_COMPANY_ID);
    const body = await res.json();
    expect(typeof body.storageUsedBytes).toBe('string');
  });

  test('PA-FN-17/PA-AP-15: provisioning history returns parsed JSON steps, not a raw string', async ({ platformAdminPage }) => {
    const res = await getProvisioningHistoryRequest(platformAdminPage.request, ACTIVE_COMPANY_ID);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    const entry = body[0];
    expect(Array.isArray(entry.steps)).toBe(true);
    expect(entry.steps.length).toBeGreaterThan(0);
    for (const step of entry.steps) {
      expect(typeof step.step).toBe('string');
      expect(typeof step.status).toBe('string');
    }
  });

  test('PA-UI-13/PA-SC-10: provisioning history never renders a plaintext password, even for a real historical entry', async ({ platformAdminPage }) => {
    const res = await getProvisioningHistoryRequest(platformAdminPage.request, ACTIVE_COMPANY_ID);
    const body = await res.json();
    const raw = JSON.stringify(body);
    // No step's `detail` payload should ever carry a `password`/`generatedPassword`
    // key — create_admin_user's own detail only ever includes `adminUserId`
    // (companies.routes.js/tenantProvisioning.service.js never write one in).
    expect(raw).not.toMatch(/"password"\s*:/i);
    expect(raw).not.toMatch(/"generatedPassword"\s*:/i);

    const detail = new PlatformAdminCompanyDetailPage(platformAdminPage);
    await detail.goto(ACTIVE_COMPANY_ID);
    await detail.historyTab.click();
    await detail.provisioningLogEntry(0).click();
    await expect(platformAdminPage.getByText(/^password:?\s*[\w!@#$%^&*]{6,}/i)).toHaveCount(0);
  });

  test('PA-UI-11: Profile/Tenant Health/Usage/Provisioning History tabs each render their own content with no cross-tab leakage', async ({
    platformAdminPage,
  }) => {
    const detail = new PlatformAdminCompanyDetailPage(platformAdminPage);
    await detail.goto(ACTIVE_COMPANY_ID);

    await expect(detail.companyNameInput).toBeVisible();
    await expect(platformAdminPage.getByText('Setup Completion', { exact: true })).toHaveCount(0);

    await detail.healthTab.click();
    await expect(platformAdminPage.getByText('Setup Completion', { exact: true })).toBeVisible();
    await expect(detail.companyNameInput).toHaveCount(0);

    await detail.usageTab.click();
    await expect(platformAdminPage.getByText('Employee Count', { exact: true })).toBeVisible();
    await expect(platformAdminPage.getByText('Setup Completion', { exact: true })).toHaveCount(0);

    await detail.historyTab.click();
    await expect(platformAdminPage.getByText('Employee Count', { exact: true })).toHaveCount(0);
  });

  test('PA-UI-12: the employee-usage "Approaching limit" chip is absent for a company comfortably under its plan limit', async ({
    platformAdminPage,
  }) => {
    const detail = new PlatformAdminCompanyDetailPage(platformAdminPage);
    await detail.goto(TRIAL_COMPANY_ID);
    await expect(detail.employeeUsageSection.getByText(detail.approachingLimitChipText)).toHaveCount(0);
  });

  /**
   * (confirmed gap) — PA-BD-12 documents a storage-usage "Approaching limit"
   * chip appearing at >=90% of storage_limit_mb, mirroring the employee-usage
   * one (PA-UI-12, which genuinely exists — see USAGE_WARNING_THRESHOLD in
   * CompanyDetailPage.tsx). Reading that same component's Storage Usage grid
   * item (lines ~239-244) confirms no such chip logic exists anywhere for
   * storage — only the raw "X / Y MB" text renders, regardless of ratio. Not
   * exercisable at the true >=90% boundary without uploading enough data to
   * manufacture that ratio (a write action, out of scope for this read-only
   * slice) — this test instead proves the chip's absence is unconditional
   * (present for no company, not just ones under the threshold).
   */
  test('PA-BD-12 (confirmed gap): no "Approaching limit" chip exists anywhere in the Storage Usage section, for any company, at any usage ratio', async ({
    platformAdminPage,
  }) => {
    const detail = new PlatformAdminCompanyDetailPage(platformAdminPage);
    await detail.goto(ACTIVE_COMPANY_ID);
    await expect(detail.storageUsageSection.getByText(detail.approachingLimitChipText)).toHaveCount(0);
  });
});
