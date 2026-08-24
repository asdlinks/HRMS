import { test, expect } from '../fixtures/auth';
import { ReportsWorkspacePage } from '../pages/ReportsWorkspacePage';
import { getReportDataApi, exportReportApi, getReportCatalogApi } from '../helpers/reports';

/**
 * docs/ReportsEngine_TestCases.csv — Report Data / Export rows.
 * Automates: RP-FN-03, RP-FN-04, RP-FN-05, RP-FN-06, RP-FN-07, RP-FN-13,
 * RP-FN-16, RP-NG-01, RP-NG-02, RP-NG-03, RP-NG-04, RP-NG-10, RP-AP-03,
 * RP-AP-04, RP-SC-05.
 * NOT automated here (see reports-not-automatable.spec.ts):
 * - RP-BD-01/RP-FN-15 (exact 50,000/50,001-row export cap) — needs bulk
 *   test-data seeding at production scale, not a functional assertion this
 *   suite's disposable-record generation can reach.
 * - RP-PF-01 (export memory-streaming characteristic) — a load-profiling
 *   concern, not a Playwright-observable behavior.
 */
test.describe('Reports Engine — Report Data & Export', () => {
  test('RP-FN-03 / RP-AP-03: a table-mode report returns paginated, sorted rows matching the registry\'s declared columns', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const response = await getReportDataApi(adminPage, 'employee-master', { page: 1, pageSize: 10 });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(10);
    if (body.rows.length > 0) {
      expect(body.rows[0]).toHaveProperty('user_name');
      expect(body.rows[0]).toHaveProperty('employee_id');
    }
  });

  test('RP-FN-04 / RP-AP-03: a bespoke-mode report returns an aggregate JSON shape instead of a row table', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const response = await getReportDataApi(adminPage, 'gender-distribution');
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.bespoke).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.total).toBe(body.rows.length);
  });

  test('RP-FN-13: stub reports (attendance-regularization/compliance-overview/audit-trail) return {rows:[],total:0,stub:true} via /data with no query ever executed', { tag: ['@regression'] }, async ({ adminPage }) => {
    for (const reportId of ['attendance-regularization', 'compliance-overview', 'audit-trail']) {
      const response = await getReportDataApi(adminPage, reportId);
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body).toEqual({ rows: [], total: 0, page: 1, pageSize: 0, stub: true });
    }
  });

  test('RP-FN-05 / RP-FN-06 / RP-FN-07 / RP-AP-04: export streams the correct file per format (csv default, xlsx, pdf)', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const csv = await exportReportApi(adminPage, 'employee-master', 'csv', { pageSize: '5' });
    expect(csv.ok()).toBe(true);
    expect(csv.headers()['content-type']).toContain('text/csv');
    expect((await csv.body()).length).toBeGreaterThan(0);

    const xlsx = await exportReportApi(adminPage, 'employee-master', 'xlsx', { pageSize: '5' });
    expect(xlsx.ok()).toBe(true);
    expect(xlsx.headers()['content-type']).toContain('spreadsheetml');
    expect((await xlsx.body()).length).toBeGreaterThan(0);

    const pdf = await exportReportApi(adminPage, 'employee-master', 'pdf', { pageSize: '5' });
    expect(pdf.ok()).toBe(true);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).length).toBeGreaterThan(0);
  });

  test('RP-NG-01: GET /:reportId/data for an unknown reportId returns 404', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await getReportDataApi(adminPage, 'not-a-real-report-id');
    expect(response.status()).toBe(404);
  });

  test('RP-NG-02 / RP-BD-02: GET /:reportId/data for a report the caller has no scope for returns 403 (employeeSelf lacks reports.organization.view)', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    const response = await getReportDataApi(employeeSelfPage, 'org-branch-summary');
    expect(response.status()).toBe(403);
  });

  test('RP-NG-03: GET /:reportId/export for a stub report is rejected with 400 — no query is ever attempted', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await exportReportApi(adminPage, 'attendance-regularization', 'csv');
    expect(response.status()).toBe(400);
  });

  test('RP-NG-04 (confirmed gap): GET /:reportId/export?format=foo silently falls back to CSV rather than returning 400', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await exportReportApi(adminPage, 'employee-master', 'foo', { pageSize: '5' });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/csv');
  });

  test('RP-NG-10 / RP-SC-05 (confirmed inconsistency): export always sorts by the report\'s defaultSortField, ignoring the caller\'s requested sortField — exported order can differ from the on-screen sort', { tag: ['@regression'] }, async ({ adminPage }) => {
    const catalog = await getReportCatalogApi(adminPage);
    const entry = catalog.find((r) => r.id === 'employee-master')!;
    expect(entry.defaultSortField).toBe('user_name');

    const dataResponse = await getReportDataApi(adminPage, 'employee-master', { sortField: 'joining_date', sortDir: 'asc', pageSize: '100' });
    const dataBody = await dataResponse.json();
    const dataOrderNames = dataBody.rows.map((r: Record<string, unknown>) => r.user_name);

    const exportResponse = await exportReportApi(adminPage, 'employee-master', 'csv', { sortField: 'joining_date', sortDir: 'asc' });
    const csvText = await exportResponse.text();
    const csvLines = csvText.trim().split('\r\n').slice(1); // drop the header row
    const exportOrderNames = csvLines.map((line) => line.split(',')[1]).slice(0, dataOrderNames.length);

    // /data honors the requested sort (joining_date); /export ignores it and
    // always orders by defaultSortField (user_name) — the two orders differ
    // whenever the underlying data isn't coincidentally already alphabetical
    // by name in joining-date order, which a real multi-employee tenant won't be.
    expect(exportOrderNames).not.toEqual(dataOrderNames);
  });

  test('RP-FN-16: clicking a bar on a drill-down-enabled summary chart navigates into Employee Master pre-filtered by the clicked dimension', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const workspace = new ReportsWorkspacePage(adminPage);
    await workspace.goto('employee', '?report=department-summary');
    // Recharts gives bar elements no accessible role/name — the only stable
    // anchor is its own rendered class, same documented exception as
    // AppShellPopup.ts's structural fallback.
    const bar = adminPage.locator('.recharts-bar-rectangle').first();
    await bar.waitFor({ state: 'visible', timeout: 10_000 });
    await bar.click();
    await expect(adminPage).toHaveURL(/report=employee-master/);
    await expect(adminPage).toHaveURL(/departmentId=\d+/);
  });
});
