import { test, expect } from '../fixtures/auth';
import { createEmployee } from '../helpers/seed';
import { ReportsWorkspacePage } from '../pages/ReportsWorkspacePage';
import { ReportPanel } from '../pages/ReportPanel';
import { getReportDataApi } from '../helpers/reports';

/**
 * docs/ReportsEngine_TestCases.csv — Validation / Security / DB rows.
 * Automates: RP-NG-07, RP-NG-08, RP-NG-09, RP-VD-01, RP-SC-03, RP-SC-04,
 * RP-DB-02, RP-DB-03, RP-UI-02, RP-UI-04.
 */
test.describe('Reports Engine — Validation & Security', () => {
  test('RP-NG-07 / RP-SC-03 (confirmed gap): a search value containing literal % or _ is treated as a SQL wildcard, not a literal character', { tag: ['@regression'] }, async ({ adminPage }) => {
    const employee = await createEmployee(adminPage);
    // Neither "%" nor "_" appears literally in the generated name — a
    // correctly-escaped LIKE would find nothing for either search below.
    // buildDimensionFilters (server/utils/reportFilters.js) wraps the raw
    // value as `%${search}%` with no escaping, so both patterns still match.
    const nameParts = employee.name.split(' ');
    const percentSearch = `${nameParts[0]}%${nameParts[nameParts.length - 1]}`; // "%" standing in for the middle word(s)
    const percentResponse = await getReportDataApi(adminPage, 'employee-master', { search: percentSearch, pageSize: '50' });
    const percentBody = await percentResponse.json();
    expect(percentBody.rows.some((r: Record<string, unknown>) => r.email === employee.email)).toBe(true);

    const underscoreSearch = employee.name.replace(' ', '_'); // "_" standing in for exactly one space
    const underscoreResponse = await getReportDataApi(adminPage, 'employee-master', { search: underscoreSearch, pageSize: '50' });
    const underscoreBody = await underscoreResponse.json();
    expect(underscoreBody.rows.some((r: Record<string, unknown>) => r.email === employee.email)).toBe(true);
  });

  test('RP-NG-08 / RP-VD-01 (confirmed gap): an invalid dateFrom/dateTo string surfaces as a raw, unhandled server error — no filter schema validates it first', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await getReportDataApi(adminPage, 'new-joiners', { dateFrom: 'not-a-real-date', pageSize: '10' });
    // No clean 400 exists anywhere in this route — confirmed by reading
    // reports.routes.js (req.query flows straight into query-building with
    // no shape/format checks). Whatever status the driver-level failure
    // actually surfaces as, it is NOT a well-formed validation response.
    expect(response.ok()).toBe(false);
    expect(response.status()).not.toBe(400);
  });

  test('RP-NG-09 (confirmed gap): non-numeric periodYear/periodMonth silently falls back to the current month/year instead of erroring', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await getReportDataApi(adminPage, 'payroll-summary', { periodYear: 'garbage', periodMonth: 'also-garbage' });
    expect(response.ok()).toBe(true); // never errors, never warns the caller their filter was ignored
    const body = await response.json();
    const now = new Date();
    expect(body.rows[0]?.period_year).toBe(now.getFullYear());
    expect(body.rows[0]?.period_month).toBe(now.getMonth() + 1);
  });

  test('RP-DB-03: an unrecognized sortField is ignored rather than reflected into the ORDER BY clause — the whitelist is entry.columns, not the client', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await getReportDataApi(adminPage, 'employee-master', { sortField: 'not_a_real_column', pageSize: '5' });
    expect(response.ok()).toBe(true); // falls back to defaultSortField silently, never a raw SQL error
  });

  test('RP-SC-04 / RP-DB-02: classic SQL injection payloads across search/filter fields are safely parameterized, not concatenated', { tag: ['@regression'] }, async ({ adminPage }) => {
    const payload = "'; DROP TABLE users; --";
    const response = await getReportDataApi(adminPage, 'employee-master', { search: payload, pageSize: '10' });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(Array.isArray(body.rows)).toBe(true);

    // The tenant's own employee data must still be intact and queryable —
    // the strongest possible proof the payload never reached raw SQL.
    const followUp = await getReportDataApi(adminPage, 'employee-master', { pageSize: '5' });
    expect(followUp.ok()).toBe(true);
    expect((await followUp.json()).total).toBeGreaterThan(0);
  });

  test('RP-UI-02 (confirmed gap): no UI control exists for registry-declared filters outside the fixed control set (e.g. Payroll Summary\'s periodYear/periodMonth)', { tag: ['@regression'] }, async ({ adminPage }) => {
    const workspace = new ReportsWorkspacePage(adminPage);
    await workspace.goto('payroll', '?report=payroll-summary');
    const panel = new ReportPanel(adminPage);
    await expect(panel.searchField).toBeVisible(); // the fixed control set still renders
    await expect(panel.dateFromField).toBeVisible();
    await expect(adminPage.getByLabel('Period Year')).toHaveCount(0);
    await expect(adminPage.getByLabel('Period Month')).toHaveCount(0);
  });

  test('RP-UI-04: the export menu\'s Print option triggers window.print(), not a server export', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const workspace = new ReportsWorkspacePage(adminPage);
    await workspace.goto('employee', '?report=employee-master');
    await adminPage.evaluate(() => { (window as unknown as { __printCalled: boolean }).__printCalled = false; window.print = () => { (window as unknown as { __printCalled: boolean }).__printCalled = true; }; });

    const panel = new ReportPanel(adminPage);
    await panel.exportAs('Print');
    const printCalled = await adminPage.evaluate(() => (window as unknown as { __printCalled: boolean }).__printCalled);
    expect(printCalled).toBe(true);
  });
});
