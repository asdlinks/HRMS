/**
 * Platform Admin — Dashboard & System Health (Phase 8).
 * Automates: PA-FN-18, PA-FN-19, PA-AP-16, PA-AP-17.
 *
 * Not automated: PA-PF-02, PA-PF-05 (load-generation/timing-distribution
 * tooling this suite does not have) — see
 * platform-admin-dashboard-system-health-not-automatable.spec.ts.
 *
 * Both endpoints (`GET /dashboard`, `GET /system-health`) are pure,
 * unconditional reads — no company/plan is created, provisioned, or
 * mutated anywhere in this file, so there is nothing to snapshot or
 * restore. Authorization/no-token/cross-portal-token coverage for these
 * exact two routes already exists in Phase 2's
 * platform-admin-cross-portal-isolation.spec.ts (PA-NG-17/18/19,
 * PA-SC-01/02/13, PA-PM-01..04's "no internal tiers" proof) — not
 * duplicated here.
 *
 * Beyond the documented field-shape contract, each API test also
 * cross-checks the KPI numbers against a second, independently-computed
 * source (`GET /companies?status=X` 's own `total`) rather than only
 * checking types — a shape-only check can't catch a wrong aggregation
 * (e.g. a mis-joined COUNT), only a cross-source comparison can.
 *
 * The two UI tests capture the SAME network response the page itself
 * receives (via `page.waitForResponse`) rather than making a second,
 * separate API call — `database.latencyMs`/`api.uptimeSeconds` are
 * live, continuously-changing values, so a second call would never
 * match the first and any equality assertion built on two separate
 * calls would be inherently flaky.
 *
 * **(confirmed gap, reproduces PA-003 via a second endpoint)** —
 * `docs/HRMS_PRODUCT_DEFECT_REGISTER.md`'s PA-003 (Company Detail's Usage
 * tab) already documents `storageUsedBytes` coming back as a string, not
 * the `number` the client's own TS interface declares, because mssql's
 * driver returns a `SUM()` aggregate as a string. `system-health.repository.js`
 * runs the exact same `SUM(size_bytes)` shape
 * (`SELECT ISNULL(SUM(size_bytes), 0) AS total_storage_bytes FROM
 * company_document_versions`) for `SystemHealth.storageUsedBytes` (also
 * typed `number` on the client) — confirmed live against
 * https://dev.mywetechnologies.com: `"storageUsedBytes": "21494806"`, a
 * JSON string. Same root cause, same masking mechanism (`formatBytes()`'s
 * `bytes / 1024` coerces the string), no new defect ID — PA-003's
 * traceability was updated to include PA-AP-17 instead of registering a
 * duplicate.
 */
import { expect, test } from '../fixtures/platformAdminAuth';
import { getDashboardRequest, getSystemHealthRequest } from '../helpers/platformAdminDashboard';
import { listCompaniesRequest } from '../helpers/platformAdminCompanies';
import { PlatformAdminDashboardPage } from '../pages/PlatformAdminDashboardPage';
import { PlatformAdminSystemHealthPage } from '../pages/PlatformAdminSystemHealthPage';

/** Mirrors SystemHealthPage.tsx's own formatBytes() exactly, so the UI test
 * can assert the rendered Storage Usage card against the raw API number. */
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/** Mirrors SystemHealthPage.tsx's own formatUptime() exactly. */
function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours < 1) return `${minutes}m`;
  const days = Math.floor(hours / 24);
  if (days < 1) return `${hours}h ${minutes}m`;
  return `${days}d ${hours % 24}h`;
}

test.describe('Platform Admin Dashboard & System Health', () => {
  test('PA-FN-18/PA-AP-16: dashboard KPI contract — exactly the 8 documented fields, correct types, and correct against a second source', async ({
    platformAdminPage,
  }) => {
    const res = await getDashboardRequest(platformAdminPage.request);
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Exactly the 8 documented fields — an extra key would mean row-level
    // (or otherwise undocumented) data is leaking out of an aggregate-only
    // endpoint; a missing one would mean the contract regressed.
    expect(Object.keys(body).sort()).toEqual(
      [
        'totalCompanies',
        'activeCompanies',
        'trialCompanies',
        'suspendedCompanies',
        'newCompaniesThisMonth',
        'totalEmployees',
        'totalActiveUsers',
        'newEmployeesThisMonth',
      ].sort()
    );
    for (const key of Object.keys(body)) {
      expect(typeof body[key], `${key} should be a number`).toBe('number');
      expect(body[key], `${key} should be >= 0`).toBeGreaterThanOrEqual(0);
    }

    // Internal consistency: active is a status-partition of total, so it can
    // never exceed it; active USERS is a subset of total employees likewise.
    expect(body.activeCompanies + body.trialCompanies + body.suspendedCompanies).toBeLessThanOrEqual(body.totalCompanies);
    expect(body.totalActiveUsers).toBeLessThanOrEqual(body.totalEmployees);

    // Cross-source correctness (not just shape): each per-status bucket must
    // match GET /companies' own filtered count for that same status.
    for (const [status, dashboardCount] of [
      ['active', body.activeCompanies],
      ['trial', body.trialCompanies],
      ['suspended', body.suspendedCompanies],
    ] as const) {
      const listRes = await listCompaniesRequest(platformAdminPage.request, { status, pageSize: 1 });
      expect(listRes.status()).toBe(200);
      const { total } = await listRes.json();
      expect(dashboardCount, `dashboard's ${status}Companies should match GET /companies?status=${status}'s total`).toBe(total);
    }
  });

  test('PA-FN-19/PA-AP-17: system health contract — documented shape, honest not_configured background-jobs status, correct active-tenant count', async ({
    platformAdminPage,
  }) => {
    const res = await getSystemHealthRequest(platformAdminPage.request);
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.database.status).toBe('ok');
    expect(typeof body.database.latencyMs).toBe('number');
    expect(body.database.latencyMs).toBeGreaterThanOrEqual(0);

    expect(body.api.status).toBe('ok');
    expect(typeof body.api.uptimeSeconds).toBe('number');
    expect(body.api.uptimeSeconds).toBeGreaterThanOrEqual(0);

    // Honest, not fabricated: this codebase has no job scheduler, and the
    // endpoint must say so rather than invent healthy-looking job data.
    expect(body.backgroundJobs.status).toBe('not_configured');
    expect(body.backgroundJobs.message.length).toBeGreaterThan(0);
    expect(body.backgroundJobs.failedJobs).toBe(0);

    expect(typeof body.activeTenants).toBe('number');

    // (confirmed gap, reproduces PA-003) — declared `number` on the client,
    // actually a string; see this file's header for the full explanation.
    expect(typeof body.storageUsedBytes).toBe('string');
    expect(Number.isFinite(Number(body.storageUsedBytes))).toBe(true);

    // Cross-source correctness: activeTenants must match GET /companies'
    // own active-status count, the same source PA-FN-18 cross-checks against.
    const listRes = await listCompaniesRequest(platformAdminPage.request, { status: 'active', pageSize: 1 });
    expect(listRes.status()).toBe(200);
    const { total } = await listRes.json();
    expect(body.activeTenants).toBe(total);
  });

  test('PA-FN-18 (UI): Dashboard page renders all 8 KPI cards matching the API response', async ({ platformAdminPage }) => {
    const dashboardPage = new PlatformAdminDashboardPage(platformAdminPage);
    const [response] = await Promise.all([
      platformAdminPage.waitForResponse((r) => r.url().includes('/api/platform-admin/dashboard') && r.request().method() === 'GET'),
      dashboardPage.goto(),
    ]);
    const body = await response.json();

    const cards: Array<[string, number]> = [
      ['Total Companies', body.totalCompanies],
      ['Active Companies', body.activeCompanies],
      ['Trial Companies', body.trialCompanies],
      ['Suspended Companies', body.suspendedCompanies],
      ['Total Employees', body.totalEmployees],
      ['Total Active Users', body.totalActiveUsers],
      ['New Companies (Month)', body.newCompaniesThisMonth],
      ['New Employees (Month)', body.newEmployeesThisMonth],
    ];
    for (const [label, value] of cards) {
      await expect(dashboardPage.statCard(label)).toBeVisible();
      expect(await dashboardPage.statValue(label), `"${label}" card`).toBe(String(value));
    }
  });

  test('PA-FN-19 (UI): System Health page renders all 6 cards matching the API response', async ({ platformAdminPage }) => {
    const healthPage = new PlatformAdminSystemHealthPage(platformAdminPage);
    const [response] = await Promise.all([
      platformAdminPage.waitForResponse((r) => r.url().includes('/api/platform-admin/system-health') && r.request().method() === 'GET'),
      healthPage.goto(),
    ]);
    const body = await response.json();

    await expect(healthPage.statCard('Database Status')).toBeVisible();
    expect(await healthPage.statValue('Database Status')).toBe(`Healthy (${body.database.latencyMs}ms)`);

    await expect(healthPage.statCard('API Status')).toBeVisible();
    expect(await healthPage.statValue('API Status')).toBe(`Healthy (${formatUptime(body.api.uptimeSeconds)} up)`);

    await expect(healthPage.statCard('Background Jobs')).toBeVisible();
    expect(await healthPage.statValue('Background Jobs')).toBe(body.backgroundJobs.message);

    await expect(healthPage.statCard('Storage Usage')).toBeVisible();
    // formatBytes() is called with the raw (string, per the confirmed gap
    // above) API value in the real app too — `Number(...)` here mirrors the
    // JS numeric-string coercion that already masks it there.
    expect(await healthPage.statValue('Storage Usage')).toBe(formatBytes(Number(body.storageUsedBytes)));

    await expect(healthPage.statCard('Active Tenants')).toBeVisible();
    expect(await healthPage.statValue('Active Tenants')).toBe(String(body.activeTenants));

    await expect(healthPage.statCard('Failed Scheduled Jobs')).toBeVisible();
    expect(await healthPage.statValue('Failed Scheduled Jobs')).toBe(String(body.backgroundJobs.failedJobs));
  });
});
