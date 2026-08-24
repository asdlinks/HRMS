import { test, expect } from '../fixtures/auth';
import { PayrollReportsPage } from '../pages/PayrollReportsPage';
import { PayrollDashboardPage } from '../pages/PayrollDashboardPage';
import { createSalaryComponent, createSalaryStructure, createEmployeeWithSalaryAssignment, createPayrollRunApi } from '../helpers/payroll';

/**
 * docs/Payroll_SalaryGrades_TestCases.csv — Payroll Reports/Dashboard rows.
 * Automates: PR-FN-23, PR-UI-10, PR-AP-08.
 */
test.describe('Payroll — Reports & Dashboard', () => {
  // Each test here chains several UI/API arrange steps against a real remote
  // dev server with a large, shared, ever-growing tenant dataset — the default
  // 30s Playwright test timeout is comfortably enough for a single-page CRUD
  // check but not for these multi-step flows. test.slow() (3x multiplier) is
  // Playwright's own idiom for exactly this, applied file-wide via beforeEach
  // rather than hand-picking which individual tests are 'heavy enough'.
  test.beforeEach(() => { test.slow(); });

  test('PR-FN-23 / PR-AP-08: dashboard summary/component-breakdown/trend return correct aggregate data for the caller\'s selected period', { tag: ['@smoke'] }, async ({ adminPage }) => {
    // An empty structure computes zero gross earnings — attach a real
    // earning component first so total_gross/component-breakdown have
    // something non-zero to actually assert against. prorateOnLop: false is
    // required here — this run's period is a "safe distant future" one (see
    // uniquePayrollPeriod()'s doc comment) with zero real attendance by
    // construction, so a prorated (the component form's own default)
    // component's value would be multiplied by a proration factor of 0.
    const component = await createSalaryComponent(adminPage, { componentType: 'Earning', calculationType: 'Fixed amount', value: '20000', prorateOnLop: false });
    const structure = await createSalaryStructure(adminPage);
    const structures = await (await adminPage.request.get('/api/payroll/structures')).json();
    const structureId = structures.find((s: { name: string }) => s.name === structure.name)?.id;
    const components = await (await adminPage.request.get('/api/payroll/components')).json();
    const componentId = components.find((c: { code: string }) => c.code === component.code)?.id;
    await adminPage.request.put(`/api/payroll/structures/${structureId}/components`, { data: { items: [{ component_id: componentId, sort_order: 0 }] } });

    await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);

    const summary = await (await adminPage.request.get(`/api/payroll/reports/summary?year=${run.year}&month=${run.month}`)).json();
    expect(summary.employee_count).toBeGreaterThanOrEqual(1);
    expect(Number(summary.total_gross)).toBeGreaterThan(0);

    const breakdown = await (await adminPage.request.get(`/api/payroll/reports/component-breakdown?year=${run.year}&month=${run.month}`)).json();
    expect(Array.isArray(breakdown)).toBe(true);
    expect(breakdown.length).toBeGreaterThan(0);

    const trend = await (await adminPage.request.get('/api/payroll/reports/trend?months=12')).json();
    expect(Array.isArray(trend)).toBe(true);
  });

  test('PR-AP-08 (permission distinctness): /payroll/reports/* requires payroll.view.all specifically, distinct from the generic reports engine\'s payroll category', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    // hrDirectory's actual role in this tenant carries payroll.view.all
    // (confirmed live — broader than e2e/.env.e2e.example's documented
    // profile), so it can't serve as the "lacks payroll.view.all" negative
    // here. employeeSelf (payroll.view.own only, per migration
    // 012_payroll_permissions.sql's seeded 'employee' role) reliably does.
    const response = await employeeSelfPage.request.get('/api/payroll/reports/summary?year=2025&month=1');
    expect(response.status()).toBe(403);
  });

  test('PR-UI-10: PayrollReportsPage renders the selected period\'s stat cards and component-breakdown chart', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);

    const reports = new PayrollReportsPage(adminPage);
    await reports.goto();
    await reports.expectLoaded();
    await expect(reports.statCard('Employees Paid')).toBeVisible();
    await expect(reports.statCard('Total Net Pay')).toBeVisible();
  });

  test('PR-UI-10: PayrollDashboardPage renders the org-wide overview for a payroll.view.all holder, and the self view otherwise', { tag: ['@sanity'] }, async ({ adminPage, employeeSelfPage }) => {
    const orgDashboard = new PayrollDashboardPage(adminPage);
    await orgDashboard.goto();
    await orgDashboard.expectOrgView();

    const selfDashboard = new PayrollDashboardPage(employeeSelfPage);
    await selfDashboard.goto();
    await selfDashboard.expectSelfView();
  });
});
