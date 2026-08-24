import { test, expect } from '../fixtures/auth';
import { ReportsDashboardPage } from '../pages/ReportsDashboardPage';
import { ReportsWorkspacePage } from '../pages/ReportsWorkspacePage';
import { getReportCatalogApi } from '../helpers/reports';

/**
 * docs/ReportsEngine_TestCases.csv — Catalog/Dashboard/Nav rows.
 * Automates: RP-FN-01, RP-FN-02, RP-AP-01, RP-AP-02, RP-UI-01 (admin angle),
 * RP-UI-03, RP-UI-06.
 * NOT automated here (see reports-not-automatable.spec.ts):
 * - RP-AP-02's 403 branch (dashboard summary with zero qualifying scope) — no
 *   configured persona holds zero of employee/attendance/leave/payroll .own,
 *   since every default role template grants all four.
 * - RP-UI-01's employeeSelf/manager (own/team-scope) angle — confirmed via
 *   direct bundle inspection to be blocked by an ENVIRONMENT issue, not a
 *   product defect: App.tsx's REPORTS_PERMISSIONS array in the git source
 *   already includes own/team scopes (its own comment says so explicitly:
 *   "previously only .all-scope codes were listed here, which redirected
 *   managers and employees to /dashboard"), but the JS bundle actually
 *   served by https://dev.mywetechnologies.com/assets/index-B0KvfBhj.js
 *   contains only 'reports.employee.view.all' — never '.own' or '.team' —
 *   proving the deployed frontend predates that fix. own/team-scoped
 *   personas are live-redirected from /reports to /dashboard as a result.
 *   The API layer is unaffected (confirmed correctly deployed — see this
 *   file's own RP-FN-01 catalog-scoping assertions, all API-driven). Asserting
 *   either the old or the already-fixed-in-source behavior here would make
 *   this test wrong the moment someone redeploys the frontend; recommend a
 *   frontend redeploy, then re-add the employeeSelf nav-visibility assertion.
 */
test.describe('Reports Engine — Dashboard & Catalog', () => {
  test('RP-FN-01 / RP-AP-01: GET /reports/catalog returns only permission-visible entries, each flagged with its stub status', { tag: ['@smoke'] }, async ({ adminPage, employeeSelfPage }) => {
    const adminCatalog = await getReportCatalogApi(adminPage);
    const adminCategories = new Set(adminCatalog.map((r) => r.category));
    // admin (super_admin) holds dashboard.view + own/all across employee/attendance/leave/payroll
    // plus organization.view/compliance.view/audit.view — every category should be visible.
    expect(adminCategories).toEqual(new Set(['employee', 'attendance', 'leave', 'payroll', 'organization', 'compliance', 'audit']));
    expect(adminCatalog.every((r) => typeof r.stub === 'boolean')).toBe(true);
    expect(adminCatalog.some((r) => r.stub === true)).toBe(true);
    expect(adminCatalog.some((r) => r.stub === false)).toBe(true);

    const selfCatalog = await getReportCatalogApi(employeeSelfPage);
    const selfCategories = new Set(selfCatalog.map((r) => r.category));
    // employeeSelf holds only *.view.own for employee/attendance/leave/payroll — no
    // organization.view/compliance.view/audit.view, so those 3 categories must be absent.
    expect(selfCategories).toEqual(new Set(['employee', 'attendance', 'leave', 'payroll']));
  });

  test('RP-FN-02 / RP-AP-02: GET /reports/dashboard/summary returns aggregate KPI data for a persona holding at least one qualifying scope', { tag: ['@smoke'] }, async ({ employeeSelfPage }) => {
    const response = await employeeSelfPage.request.get('/api/reports/dashboard/summary');
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(typeof body).toBe('object');
  });

  test('RP-UI-01: ReportsNav only lists categories present in the server-filtered catalog (admin angle — deployment-invariant)', { tag: ['@regression'] }, async ({ adminPage }) => {
    const adminDashboard = new ReportsDashboardPage(adminPage);
    await adminDashboard.goto();
    await adminDashboard.expectLoaded();
    await expect(adminDashboard.navCategoryLink('Organization')).toBeVisible();
    await expect(adminDashboard.navCategoryLink('Compliance')).toBeVisible();
    await expect(adminDashboard.navCategoryLink('Audit')).toBeVisible();
    await expect(adminDashboard.navCategoryLink('Employees')).toBeVisible();
    await expect(adminDashboard.navCategoryLink('Payroll')).toBeVisible();
  });

  test('RP-UI-03: switching reports within a workspace via the chip strip updates the ?report= query param without a full navigation', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const workspace = new ReportsWorkspacePage(adminPage);
    // AnalyticsWorkspace.tsx computes its default report id (DEFAULT_REPORT_ID)
    // purely in local state when no `?report=` is present — it does NOT call
    // setSearchParams to reflect that default into the URL (confirmed live: a
    // bare goto('employee') leaves the URL at plain /reports/employees).
    // Start from an explicit `?report=` so this test verifies the chip
    // strip's OWN url-updating behavior, not that unstated assumption.
    await workspace.goto('employee', '?report=employee-master');
    await expect(adminPage).toHaveURL(/report=employee-master/);

    await workspace.selectReport('Employee Directory');
    await expect(adminPage).toHaveURL(/report=employee-directory/);
    // Same SPA document — ReportsNav (present on every workspace page) never
    // unmounts across the switch. Scoped to the nav's own <List> — "Favorites"
    // (unlike "Dashboard"/category names) has no colliding TopNav banner link.
    await expect(adminPage.getByRole('list').getByRole('link', { name: /Favorites/ })).toBeVisible();
  });

  test('RP-UI-06: a legacy /reports/:reportId bookmark redirects into the owning workspace with the report pre-selected', { tag: ['@sanity'] }, async ({ adminPage }) => {
    await adminPage.goto('/reports/payroll-summary');
    await expect(adminPage).toHaveURL(/\/reports\/payroll\?report=payroll-summary/);
  });
});
