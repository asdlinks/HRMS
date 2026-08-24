import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { PayrollRunDetailPage } from '../pages/PayrollRunDetailPage';
import { PayslipView } from '../pages/components/PayslipView';
import { createSalaryStructure, createEmployeeWithSalaryAssignment, createPayrollRunApi, completeBankingPayload } from '../helpers/payroll';
import { readPersonaUser } from '../fixtures/personas';

/**
 * docs/Payroll_SalaryGrades_TestCases.csv — Payslips rows.
 * Automates: PR-FN-19, PR-FN-20, PR-FN-21, PR-NG-24, PR-NG-25, PR-UI-08,
 * PR-AP-07, PR-PM-02.
 */
async function createPaidRunLine(adminPage: Page) {
  const structure = await createSalaryStructure(adminPage);
  const emp = await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
  const run = await createPayrollRunApi(adminPage);
  const processResponse = await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
  if (!processResponse.ok()) throw new Error(`Failed to process run ${run.id}: ${processResponse.status()} ${await processResponse.text()}`);
  const lines = await (await adminPage.request.get(`/api/payroll/runs/${run.id}/lines`)).json();
  const runLineId = lines.find((l: { user_id: number }) => l.user_id === emp.id)?.id;
  if (!runLineId) throw new Error(`No run line found for ${emp.name} (user ${emp.id}) in run ${run.id}`);
  return { emp, run, runLineId };
}

/**
 * PR-NG-25/PR-FN-19 need a run-line owned by a *real, fixed* persona (so
 * `employeeSelfPage`'s own request genuinely satisfies `isSelf`) — the same
 * accepted exception FRAMEWORK_GUIDELINES.md's Employee-creation section
 * describes ("prefer createEmployee() ... wherever the test doesn't
 * specifically require self-service semantics"). This one does.
 */
async function createPaidRunLineForEmployeeSelf(adminPage: Page) {
  const selfUser = readPersonaUser('employeeSelf');
  if (!selfUser) return null;
  const structure = await createSalaryStructure(adminPage);
  const structures = await (await adminPage.request.get('/api/payroll/structures')).json();
  const structureId = structures.find((s: { name: string }) => s.name === structure.name)?.id;

  // employeeSelf is a fixed, reused persona — a prior run of this exact
  // helper (this suite has no cleanup mechanism) may have already left an
  // open assignment for them. createAssignment() auto-closes it via
  // `effective_to = new effective_from - 1 day`; picking a fixed literal
  // date here would violate CK_employee_salary_assignments_dates
  // (effective_to >= effective_from) the moment a *later* effective_from
  // already exists open — confirmed live. Always pick a date strictly after
  // whatever's currently open, so re-running this test never regresses.
  const existingHistory = await (await adminPage.request.get(`/api/payroll/assignments?userId=${selfUser.id}`)).json();
  const openAssignment = existingHistory.find((h: { effective_to: string | null }) => h.effective_to === null);
  const floorDate = openAssignment ? new Date(openAssignment.effective_from) : new Date('2025-01-01');
  floorDate.setDate(floorDate.getDate() + 1);
  const effectiveFrom = floorDate.toISOString().slice(0, 10);

  const bankingResponse = await adminPage.request.patch(`/api/users/${selfUser.id}/banking`, { data: completeBankingPayload(selfUser.name) });
  // See helpers/payroll.ts's createEmployeeWithSalaryAssignment() doc comment
  // for why a silently-failed banking PATCH here is a standing regression,
  // not just a flaky test — it would leave a real, permanent, banking-less
  // active assignment blocking every future run's processing.
  if (!bankingResponse.ok()) throw new Error(`Failed to set banking for employeeSelf (user ${selfUser.id}): ${bankingResponse.status()}`);
  const assignResponse = await adminPage.request.post('/api/payroll/assignments', {
    data: { user_id: selfUser.id, structure_id: structureId, ctc_annual: 500000, effective_from: effectiveFrom },
  });
  if (!assignResponse.ok()) throw new Error(`Failed to create assignment for employeeSelf (user ${selfUser.id}): ${assignResponse.status()}`);
  const run = await createPayrollRunApi(adminPage);
  const processResponse = await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
  if (!processResponse.ok()) throw new Error(`Failed to process run ${run.id}: ${processResponse.status()} ${await processResponse.text()}`);
  const lines = await (await adminPage.request.get(`/api/payroll/runs/${run.id}/lines`)).json();
  const runLineId = lines.find((l: { user_id: number }) => l.user_id === selfUser.id)?.id;
  return { selfUser, runLineId };
}

test.describe('Payroll — Payslips', () => {
  // Each test here chains several UI/API arrange steps against a real remote
  // dev server with a large, shared, ever-growing tenant dataset — the default
  // 30s Playwright test timeout is comfortably enough for a single-page CRUD
  // check but not for these multi-step flows. test.slow() (3x multiplier) is
  // Playwright's own idiom for exactly this, applied file-wide via beforeEach
  // rather than hand-picking which individual tests are 'heavy enough'.
  test.beforeEach(() => { test.slow(); });

  test('PR-FN-19: payslip visibility is scoped by permission — view.own sees only the caller\'s own payslips', { tag: ['@smoke'] }, async ({ adminPage, employeeSelfPage }) => {
    const { emp } = await createPaidRunLine(adminPage);
    const own = await createPaidRunLineForEmployeeSelf(adminPage);
    test.skip(!own, 'employeeSelf persona not configured.');

    const ownScoped = await (await employeeSelfPage.request.get('/api/payroll/payslips')).json();
    expect(ownScoped.length).toBeGreaterThan(0);
    expect(ownScoped.every((p: { user_id: number }) => p.user_id === own!.selfUser.id)).toBe(true);

    const allScoped = await (await adminPage.request.get('/api/payroll/payslips')).json();
    expect(allScoped.some((p: { user_id: number }) => p.user_id === emp.id)).toBe(true);
    expect(allScoped.some((p: { user_id: number }) => p.user_id === own!.selfUser.id)).toBe(true);
  });

  test('PR-FN-20: publishing an individual payslip sets is_published true only for that payslip (no dedicated UI button exists — API-only)', { tag: ['@regression'] }, async ({ adminPage }) => {
    const { runLineId } = await createPaidRunLine(adminPage);
    const before = await (await adminPage.request.get(`/api/payroll/payslips/${runLineId}`)).json();
    expect(before.is_published).toBeFalsy();

    const response = await adminPage.request.post(`/api/payroll/payslips/${runLineId}/publish`);
    expect(await response.json()).toEqual({ success: true });

    const after = await (await adminPage.request.get(`/api/payroll/payslips/${runLineId}`)).json();
    expect(after.is_published).toBe(true);
  });

  test('PR-FN-21: viewing a payslip detail sets first_viewed_at on first view and increments view_count on each subsequent view', { tag: ['@regression'] }, async ({ adminPage }) => {
    const { runLineId } = await createPaidRunLine(adminPage);
    await adminPage.request.post(`/api/payroll/payslips/${runLineId}/publish`);

    const beforeDetail = await (await adminPage.request.get(`/api/payroll/payslips/${runLineId}`)).json();
    expect(beforeDetail.first_viewed_at).toBeFalsy();
    expect(beforeDetail.view_count).toBe(0);

    await adminPage.request.patch(`/api/payroll/payslips/${runLineId}/viewed`);
    const afterFirst = await (await adminPage.request.get(`/api/payroll/payslips/${runLineId}`)).json();
    expect(afterFirst.first_viewed_at).toBeTruthy();
    expect(afterFirst.view_count).toBe(1);

    await adminPage.request.patch(`/api/payroll/payslips/${runLineId}/viewed`);
    const afterSecond = await (await adminPage.request.get(`/api/payroll/payslips/${runLineId}`)).json();
    expect(afterSecond.view_count).toBe(2);
    expect(afterSecond.first_viewed_at).toBe(afterFirst.first_viewed_at); // unchanged on subsequent views
  });

  test('PR-NG-24: requesting another user\'s payslip without team/all scope is rejected with 403', { tag: ['@regression'] }, async ({ adminPage, employeeSelfPage }) => {
    const { runLineId } = await createPaidRunLine(adminPage);
    await adminPage.request.post(`/api/payroll/payslips/${runLineId}/publish`);

    const response = await employeeSelfPage.request.get(`/api/payroll/payslips/${runLineId}`);
    expect(response.status()).toBe(403);
  });

  test('PR-NG-25: requesting one\'s own unpublished payslip without a manage permission returns a deliberately non-revealing 404', { tag: ['@regression'] }, async ({ adminPage, employeeSelfPage }) => {
    const own = await createPaidRunLineForEmployeeSelf(adminPage);
    test.skip(!own, 'employeeSelf persona not configured.');

    // isSelf satisfies canViewScope, but employeeSelf holds no
    // payroll.process/.approve, so canManage is false and the not-yet-published
    // branch fires — 404, never 403, per payslips.routes.js.
    const response = await employeeSelfPage.request.get(`/api/payroll/payslips/${own!.runLineId}`);
    expect(response.status()).toBe(404);
    expect((await response.json()).error).toBe('Payslip not yet available');
  });

  test('PR-UI-08: the payslip view renders no bank account number, IFSC code or UPI ID anywhere', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const { emp, run } = await createPaidRunLine(adminPage);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/approve`);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/pay`);

    // Opens the same PayslipView via the run detail page's own lines grid
    // (this run has exactly one line) rather than the tenant-wide payslips
    // list — that list has no quick-filter toolbar and only grows over
    // repeated suite runs, so a specific employee's row isn't reliably on
    // any fixed page.
    const runDetail = new PayrollRunDetailPage(adminPage);
    const payslipView = new PayslipView(adminPage);
    await runDetail.goto(run.id);
    await runDetail.openLine(emp.name);
    await payslipView.expectVisible();
    await payslipView.expectNoBankingFields();
  });

  test('PR-AP-07: payslips GET list/detail/publish/viewed match the documented VIEW_PERMS scoping and unpublished-filtering behavior', { tag: ['@regression'] }, async ({ adminPage }) => {
    const { runLineId } = await createPaidRunLine(adminPage);

    // adminPage holds payroll.process/approve — canSeeUnpublished is true, so the unpublished list still includes it.
    const list = await (await adminPage.request.get('/api/payroll/payslips')).json();
    expect(list.some((p: { run_line_id: number }) => p.run_line_id === runLineId)).toBe(true);

    const publishResponse = await adminPage.request.post(`/api/payroll/payslips/${runLineId}/publish`);
    expect(publishResponse.status()).toBe(200);

    const detailResponse = await adminPage.request.get(`/api/payroll/payslips/${runLineId}`);
    expect(detailResponse.status()).toBe(200);
    expect(Array.isArray((await detailResponse.json()).components)).toBe(true);

    const viewedResponse = await adminPage.request.patch(`/api/payroll/payslips/${runLineId}/viewed`);
    expect(await viewedResponse.json()).toEqual({ success: true });
  });

  test('PR-PM-02: payroll.view.own/team/all gate payslip visibility only — never grant GET /payroll/runs', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    const payslipsResponse = await employeeSelfPage.request.get('/api/payroll/payslips');
    expect(payslipsResponse.ok()).toBeTruthy();

    const runsResponse = await employeeSelfPage.request.get('/api/payroll/runs');
    expect(runsResponse.status()).toBe(403);
  });
});
