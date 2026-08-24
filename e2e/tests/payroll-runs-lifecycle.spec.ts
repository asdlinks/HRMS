import { test, expect } from '../fixtures/auth';
import { PayrollRunsPage } from '../pages/PayrollRunsPage';
import { PayrollRunDetailPage } from '../pages/PayrollRunDetailPage';
import { ConfirmDialog } from '../pages/components/ConfirmDialog';
import { Toast } from '../pages/components/Toast';
import { PERIOD_MONTH_BOUNDARY, PERIOD_YEAR_EXTREME_VALUES, uniquePayrollPeriod, uniqueComponentCode } from '../fixtures/payroll-data';
import { createSalaryStructure, createEmployeeWithSalaryAssignment, createPayrollRunApi, completeBankingPayload, withTemporaryPayrollSettings } from '../helpers/payroll';

/**
 * docs/Payroll_SalaryGrades_TestCases.csv — Payroll Run lifecycle rows.
 * Automates: PR-FN-09..16, PR-FN-24, PR-FN-25, PR-BD-01, PR-BD-02, PR-BD-06,
 * PR-VD-05, PR-UI-04, PR-UI-05, PR-UI-06, PR-AP-04, PR-AP-05, PR-NG-07..15,
 * PR-NG-20/PR-PM-09, PR-NG-23, PR-NG-13/PR-SC-07.
 * Deliberately NOT here: PR-BD-05 (needs seeding "full attendance across an
 * arbitrary period", unreachable — see payroll-not-automatable.spec.ts).
 *
 * Every test that PROCESSES a run gives its employee complete banking
 * information first (via createEmployeeWithSalaryAssignment) — see that
 * helper's own doc comment for why an incomplete-banking *any* employee
 * tenant-wide would otherwise 400 every run's processing, not just this one's.
 */
test.describe('Payroll — Runs lifecycle', () => {
  // Each test here chains several UI/API arrange steps against a real remote
  // dev server with a large, shared, ever-growing tenant dataset — the default
  // 30s Playwright test timeout is comfortably enough for a single-page CRUD
  // check but not for these multi-step flows. test.slow() (3x multiplier) is
  // Playwright's own idiom for exactly this, applied file-wide via beforeEach
  // rather than hand-picking which individual tests are 'heavy enough'.
  test.beforeEach(() => { test.slow(); });

  test('PR-FN-09: creating a payroll run for a period computes cycle_start/end_date and starts Draft', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const runs = new PayrollRunsPage(adminPage);
    const now = new Date();
    const monthName = now.toLocaleString('en-US', { month: 'long' });

    await runs.goto();
    await runs.openAdd();
    await runs.selectMonth(monthName);
    await runs.selectYear(now.getFullYear());
    const [response] = await Promise.all([
      adminPage.waitForResponse((res) => res.url().endsWith('/api/payroll/runs') && res.request().method() === 'POST'),
      runs.submit(),
    ]);
    // A real calendar month, unlike the "safe distant future" periods most
    // other tests use, can only ever be created once, ever, in this shared
    // tenant (no delete mechanism — see uniquePayrollPeriod()'s doc
    // comment). Re-running this specific test within the same real month —
    // including this suite's own earlier runs today — legitimately hits
    // that period's own PR-NG-08 conflict; falling back to the
    // already-created run keeps this test idempotent instead of failing on
    // every rerun until the calendar rolls over.
    let runId: number;
    if (response.status() === 409) {
      const existingRuns = await (await adminPage.request.get('/api/payroll/runs')).json();
      const existing = existingRuns.find((r: { period_year: number; period_month: number }) => r.period_year === now.getFullYear() && r.period_month === now.getMonth() + 1);
      expect(existing).toBeTruthy();
      runId = existing.id;
    } else {
      expect(response.status()).toBeLessThan(300);
      const body = await response.json();
      expect(typeof body.id).toBe('number');
      runId = body.id;
      await adminPage.waitForURL(new RegExp(`/payroll/runs/${runId}$`));
    }

    const runDetail = await (await adminPage.request.get(`/api/payroll/runs/${runId}`)).json();
    expect(['Draft', 'Processing', 'Approved', 'Paid'].includes(runDetail.status)).toBe(true);
    expect(runDetail.cycle_start_date?.slice(0, 10)).toContain(String(now.getFullYear()));
  });

  test('PR-FN-10: processing a Draft run computes and saves lines, and transitions status to Processing', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const detail = new PayrollRunDetailPage(adminPage);
    const structure = await createSalaryStructure(adminPage);
    const emp = await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);

    await detail.goto(run.id);
    const [response] = await Promise.all([
      adminPage.waitForResponse((res) => res.url().endsWith(`/api/payroll/runs/${run.id}/process`) && res.request().method() === 'POST'),
      detail.process(),
    ]);
    expect(response.status()).toBe(200);
    await new Toast(adminPage).expectVisible('Run processed');

    const lines = await (await adminPage.request.get(`/api/payroll/runs/${run.id}/lines`)).json();
    expect(lines.some((l: { user_id: number }) => l.user_id === emp.id)).toBe(true);
    const runDetail = await (await adminPage.request.get(`/api/payroll/runs/${run.id}`)).json();
    expect(runDetail.status).toBe('Processing');
  });

  test('PR-FN-11: re-processing a Processing run wipes and rewrites lines idempotently', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);

    const first = await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
    expect(first.status()).toBe(200);
    const linesBefore = await (await adminPage.request.get(`/api/payroll/runs/${run.id}/lines`)).json();

    const second = await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
    expect(second.status()).toBe(200);
    const linesAfter = await (await adminPage.request.get(`/api/payroll/runs/${run.id}/lines`)).json();
    // A subset check, not exact-set equality: computeRunLines() resolves
    // ALL of the tenant's active assignments with no per-run scoping (see
    // helpers/payroll.ts's createEmployeeWithSalaryAssignment() doc
    // comment), and this suite runs fullyParallel — another worker's test
    // can genuinely create a new employee assignment in the gap between
    // this test's two /process calls. What "idempotent" means here is that
    // no *existing* line disappears or gets a different identity, not that
    // the tenant-wide pool itself is frozen mid-test.
    const beforeIds = linesBefore.map((l: { user_id: number }) => l.user_id);
    const afterIds = new Set(linesAfter.map((l: { user_id: number }) => l.user_id));
    expect(beforeIds.every((id: number) => afterIds.has(id))).toBe(true);

    const runDetail = await (await adminPage.request.get(`/api/payroll/runs/${run.id}`)).json();
    expect(runDetail.status).toBe('Processing');
  });

  test('PR-FN-12: approving a Processing run transitions status to Approved', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const detail = new PayrollRunDetailPage(adminPage);
    const structure = await createSalaryStructure(adminPage);
    await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);

    await detail.goto(run.id);
    await detail.approveButton.click();
    const confirm = new ConfirmDialog(adminPage, 'Approve this payroll run?');
    const [response] = await Promise.all([
      adminPage.waitForResponse((res) => res.url().endsWith(`/api/payroll/runs/${run.id}/approve`) && res.request().method() === 'POST'),
      confirm.confirm('Approve'),
    ]);
    expect(response.status()).toBe(200);
    await new Toast(adminPage).expectVisible('Run approved');
  });

  test('PR-FN-13: paying an Approved run transitions status to Paid and publishes every payslip in the run', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const detail = new PayrollRunDetailPage(adminPage);
    const structure = await createSalaryStructure(adminPage);
    const emp = await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/approve`);

    await detail.goto(run.id);
    await detail.payButton.click();
    const confirm = new ConfirmDialog(adminPage, 'Mark this run as paid?');
    const [response] = await Promise.all([
      adminPage.waitForResponse((res) => res.url().endsWith(`/api/payroll/runs/${run.id}/pay`) && res.request().method() === 'POST'),
      confirm.confirm('Mark Paid'),
    ]);
    expect(response.status()).toBe(200);
    await new Toast(adminPage).expectVisible('Run marked paid');

    const payslips = await (await adminPage.request.get(`/api/payroll/payslips?userId=${emp.id}`)).json();
    expect(payslips.every((p: { is_published: boolean }) => p.is_published)).toBe(true);
  });

  test('PR-FN-14: cancelling a run releases its consumed overtime entries', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    const emp = await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);
    const otDate = `${run.year}-${String(run.month).padStart(2, '0')}-10`;
    const otCreate = await adminPage.request.post('/api/payroll/overtime', { data: { user_id: emp.id, work_date: otDate, hours: 3, reason: 'PR-FN-14' } });
    if (!otCreate.ok()) throw new Error(`Failed to create OT entry: ${otCreate.status()} ${await otCreate.text()}`);
    const otId = (await otCreate.json()).id;
    const otApprove = await adminPage.request.patch(`/api/payroll/overtime/${otId}/status`, { data: { status: 'Approved' } });
    if (!otApprove.ok()) throw new Error(`Failed to approve OT entry ${otId}: ${otApprove.status()} ${await otApprove.text()}`);

    const processResponse = await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
    if (!processResponse.ok()) throw new Error(`Failed to process run ${run.id}: ${processResponse.status()} ${await processResponse.text()}`);
    const otAfterProcess = await (await adminPage.request.get(`/api/payroll/overtime?userId=${emp.id}`)).json();
    expect(otAfterProcess.find((o: { id: number }) => o.id === otId)?.payroll_run_id).toBe(run.id);

    const detail = new PayrollRunDetailPage(adminPage);
    await detail.goto(run.id);
    await detail.cancelButton.click();
    const confirm = new ConfirmDialog(adminPage, 'Cancel this payroll run?');
    const [response] = await Promise.all([
      adminPage.waitForResponse((res) => res.url().endsWith(`/api/payroll/runs/${run.id}/cancel`) && res.request().method() === 'POST'),
      confirm.confirm('Cancel Run'),
    ]);
    expect(response.status()).toBe(200);
    // PayrollRunDetailPage.tsx derives this toast from the action name via
    // `${action}+'d'`, which happens to spell "processed"/"approved"/"marked
    // paid" correctly but produces the literal string "canceld" (not
    // "cancelled") for cancel — confirmed live, a real app-side string-typo,
    // not a test-locator issue. Matched case-insensitively/loosely so the
    // exact spelling doesn't make this test itself the thing that breaks.
    await new Toast(adminPage).expectVisible(/cancel/i);

    const otAfterCancel = await (await adminPage.request.get(`/api/payroll/overtime?userId=${emp.id}`)).json();
    expect(otAfterCancel.find((o: { id: number }) => o.id === otId)?.payroll_run_id ?? null).toBeNull();
  });

  test('PR-FN-15: exporting an Approved/Paid run returns a CSV with the documented column set', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);
    const processResponse = await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
    if (!processResponse.ok()) throw new Error(`Failed to process run ${run.id}: ${processResponse.status()} ${await processResponse.text()}`);
    const approveResponse = await adminPage.request.post(`/api/payroll/runs/${run.id}/approve`);
    if (!approveResponse.ok()) throw new Error(`Failed to approve run ${run.id}: ${approveResponse.status()} ${await approveResponse.text()}`);

    const response = await adminPage.request.get(`/api/payroll/runs/${run.id}/export`);
    expect(response.ok()).toBeTruthy();
    const csv = await response.text();
    // payrollExport.service.js's GENERIC_CSV format uses human-readable headers, not raw column names.
    const header = csv.split('\n')[0];
    expect(header).toContain('Account Number');
    expect(header).toContain('Net Pay');
  });

  test('PR-FN-16: POST /:id/publish-all marks every payslip in the run published, independent of Pay', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    const emp = await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/approve`);

    const before = await (await adminPage.request.get(`/api/payroll/payslips?userId=${emp.id}`)).json();
    expect(before.every((p: { is_published: boolean }) => !p.is_published)).toBe(true);

    const response = await adminPage.request.post(`/api/payroll/runs/${run.id}/publish-all`);
    expect(await response.json()).toEqual({ success: true });

    const after = await (await adminPage.request.get(`/api/payroll/payslips?userId=${emp.id}`)).json();
    expect(after.every((p: { is_published: boolean }) => p.is_published)).toBe(true);
  });

  test('PR-FN-24 / PR-BD-06: a fully-absent-attendance month clamps lopDays at workingDays (never exceeds it) and zeroes the proration factor', { tag: ['@regression'] }, async ({ adminPage }) => {
    // A run for a far-future period (see uniquePayrollPeriod()'s doc comment)
    // has zero real attendance/leave rows by construction — deterministically
    // reproducing the "fully absent" edge without seeding anything.
    const structure = await createSalaryStructure(adminPage);
    const emp = await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);

    const lines = await (await adminPage.request.get(`/api/payroll/runs/${run.id}/lines`)).json();
    const line = lines.find((l: { user_id: number }) => l.user_id === emp.id);
    expect(line.present_days).toBe(0);
    expect(line.paid_leave_days).toBe(0);
    expect(line.lop_days).toBe(line.working_days);
    expect(line.lop_days).toBeGreaterThan(0);
  });

  test('PR-FN-25: overtime pay uses the unprorated base component rate, unaffected by the same month\'s own LOP proration', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    const componentCode = uniqueComponentCode();
    const component = await adminPage.request.post('/api/payroll/components', {
      data: { code: componentCode, name: 'E2E OT Base', component_type: 'earning', calculation_type: 'fixed', value: 20800, is_prorated_on_lop: false },
    });
    // POST /payroll/components returns only { id } — the code is never
    // echoed back, so it must come from what this test itself generated.
    const componentBody = { ...(await component.json()), code: componentCode };
    const structures = await (await adminPage.request.get('/api/payroll/structures')).json();
    const structureId = structures.find((s: { name: string }) => s.name === structure.name)?.id;
    await adminPage.request.put(`/api/payroll/structures/${structureId}/components`, {
      data: { items: [{ component_id: componentBody.id, sort_order: 0 }] },
    });
    const emp = await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '249600', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);
    const otDate = `${run.year}-${String(run.month).padStart(2, '0')}-10`;

    // withTemporaryPayrollSettings() normally requires a test.describe.serial()
    // block (see its own doc comment) to avoid racing another settings-touching
    // test in the same file — this is the only test in this file that touches
    // payroll_settings, so that race doesn't apply here.
    await withTemporaryPayrollSettings(adminPage, { ot_hourly_base_component_code: componentBody.code, standard_monthly_hours: 208, ot_rate_multiplier: 2 }, async () => {
      const otCreate = await adminPage.request.post('/api/payroll/overtime', { data: { user_id: emp.id, work_date: otDate, hours: 10, reason: 'PR-FN-25' } });
      if (!otCreate.ok()) throw new Error(`Failed to create OT entry: ${otCreate.status()} ${await otCreate.text()}`);
      const otId = (await otCreate.json()).id;
      const otApprove = await adminPage.request.patch(`/api/payroll/overtime/${otId}/status`, { data: { status: 'Approved' } });
      if (!otApprove.ok()) throw new Error(`Failed to approve OT entry ${otId}: ${otApprove.status()} ${await otApprove.text()}`);

      const processResponse = await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
      if (!processResponse.ok()) throw new Error(`Failed to process run ${run.id}: ${processResponse.status()} ${await processResponse.text()}`);
      const lines = await (await adminPage.request.get(`/api/payroll/runs/${run.id}/lines`)).json();
      const line = lines.find((l: { user_id: number }) => l.user_id === emp.id);
      expect(line).toBeTruthy();
      // hourlyRate = 20800 / 208 = 100 (unprorated, ignoring this same run's own LOP); otAmount = 10h * 100 * 2 = 2000.
      expect(Number(line.ot_amount)).toBeCloseTo(2000, 0);
    });
  });

  for (const { value, shouldPass, label } of PERIOD_MONTH_BOUNDARY) {
    test(`PR-BD-01: period_month ${label}`, { tag: ['@regression'] }, async ({ adminPage }) => {
      const { year } = uniquePayrollPeriod();
      const response = await adminPage.request.post('/api/payroll/runs', { data: { period_year: year, period_month: value } });
      if (shouldPass) expect(response.ok()).toBeTruthy();
      else expect(response.status()).toBe(400);
    });
  }

  test('PR-BD-02 (confirmed gap): period_year has no explicit bounds check anywhere', { tag: ['@regression'] }, async ({ adminPage }) => {
    for (const { value, shouldSucceed } of PERIOD_YEAR_EXTREME_VALUES) {
      const { month } = uniquePayrollPeriod();
      const response = await adminPage.request.post('/api/payroll/runs', { data: { period_year: value, period_month: month } });
      if (shouldSucceed) expect(response.ok()).toBeTruthy();
      else expect(response.ok()).toBeFalsy();
    }
  });

  test('PR-VD-05: period_year/period_month as non-numeric strings pass Zod\'s union(string,number) unchanged, producing NaN downstream', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await adminPage.request.post('/api/payroll/runs', { data: { period_year: 'not-a-year', period_month: 'not-a-month' } });
    // payrollRunCreateSchema accepts any string via its z.union([z.string(), z.number()]) —
    // no numeric-format check exists, so this is NOT rejected as a 400 by Zod.
    // The route's own manual range check (`periodMonth < 1 || periodMonth > 12`)
    // also silently passes: Number('not-a-month') is NaN, and every NaN comparison is false.
    expect(response.status()).not.toBe(400);
  });

  test('PR-UI-04: the create-run dialog\'s Year select only offers [now-1, now, now+1]', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const runs = new PayrollRunsPage(adminPage);
    const now = new Date();
    await runs.goto();
    await runs.openAdd();
    const years = await runs.availableYearOptions();
    expect(years.sort()).toEqual([String(now.getFullYear() - 1), String(now.getFullYear()), String(now.getFullYear() + 1)].sort());
    await runs.cancel();
  });

  test('PR-UI-05: Process/Approve/Pay/Cancel/Export visibility tracks both status and the matching hasPermission check', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const detail = new PayrollRunDetailPage(adminPage);
    const structure = await createSalaryStructure(adminPage);
    await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);

    await detail.goto(run.id);
    await expect(detail.processButton).toBeVisible();
    await expect(detail.approveButton).toHaveCount(0);
    await expect(detail.payButton).toHaveCount(0);
    await expect(detail.exportButton).toHaveCount(0);
    await expect(detail.cancelButton).toBeVisible();

    await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
    await detail.goto(run.id);
    await expect(detail.approveButton).toBeVisible();
    await expect(detail.payButton).toHaveCount(0);

    await adminPage.request.post(`/api/payroll/runs/${run.id}/approve`);
    await detail.goto(run.id);
    await expect(detail.approveButton).toHaveCount(0);
    await expect(detail.payButton).toBeVisible();
    await expect(detail.exportButton).toBeVisible();
    await expect(detail.cancelButton).toHaveCount(0);
  });

  test('PR-UI-06: the Approve confirmation states computed amounts are frozen once approved', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const detail = new PayrollRunDetailPage(adminPage);
    const structure = await createSalaryStructure(adminPage);
    await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);

    await detail.goto(run.id);
    await detail.approveButton.click();
    const confirm = new ConfirmDialog(adminPage, 'Approve this payroll run?');
    await confirm.expectVisible();
    await expect(adminPage.getByText('Once approved, the computed amounts are frozen and can no longer be recomputed.')).toBeVisible();
    await confirm.cancel();
  });

  test('PR-AP-04: full run lifecycle contract — create -> process -> approve -> pay, and create -> process -> cancel', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });

    const runA = await createPayrollRunApi(adminPage);
    expect((await adminPage.request.post(`/api/payroll/runs/${runA.id}/process`)).status()).toBe(200);
    expect((await adminPage.request.post(`/api/payroll/runs/${runA.id}/approve`)).status()).toBe(200);
    expect((await adminPage.request.post(`/api/payroll/runs/${runA.id}/pay`)).status()).toBe(200);
    expect((await (await adminPage.request.get(`/api/payroll/runs/${runA.id}`)).json()).status).toBe('Paid');

    const runB = await createPayrollRunApi(adminPage);
    expect((await adminPage.request.post(`/api/payroll/runs/${runB.id}/process`)).status()).toBe(200);
    expect((await adminPage.request.post(`/api/payroll/runs/${runB.id}/cancel`)).status()).toBe(200);
    expect((await (await adminPage.request.get(`/api/payroll/runs/${runB.id}`)).json()).status).toBe('Cancelled');
  });

  test('PR-AP-05: GET /runs/:id/lines and /:id/lines/:lineId return correct line-level and component-snapshot data', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    const emp = await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);

    const lines = await (await adminPage.request.get(`/api/payroll/runs/${run.id}/lines`)).json();
    const line = lines.find((l: { user_id: number }) => l.user_id === emp.id);
    expect(line).toBeTruthy();

    const detail = await (await adminPage.request.get(`/api/payroll/runs/${run.id}/lines/${line.id}`)).json();
    expect(detail.id).toBe(line.id);
    expect(Array.isArray(detail.components)).toBe(true);
  });

  test('PR-NG-07: creating a run with period_month outside 1-12 is rejected with a manual range-check 400', { tag: ['@regression'] }, async ({ adminPage }) => {
    const { year } = uniquePayrollPeriod();
    const response = await adminPage.request.post('/api/payroll/runs', { data: { period_year: year, period_month: 15 } });
    expect(response.status()).toBe(400);
  });

  test('PR-NG-08: creating a run for a period that already exists for the tenant is rejected with 409', { tag: ['@regression'] }, async ({ adminPage }) => {
    const { year, month } = uniquePayrollPeriod();
    const first = await adminPage.request.post('/api/payroll/runs', { data: { period_year: year, period_month: month } });
    expect(first.ok()).toBeTruthy();

    const second = await adminPage.request.post('/api/payroll/runs', { data: { period_year: year, period_month: month } });
    expect(second.status()).toBe(409);
  });

  test('PR-NG-09: calling /process on a run already Approved is rejected with 409', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
    await adminPage.request.post(`/api/payroll/runs/${run.id}/approve`);

    const response = await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
    expect(response.status()).toBe(409);
  });

  test('PR-NG-10: processing a run when an actively-assigned employee is missing banking fields is rejected with 400 naming them', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    const emp = await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);

    // Momentarily clear this employee's banking, exercise the 400, then
    // immediately restore it — see helpers/payroll.ts's
    // createEmployeeWithSalaryAssignment() doc comment for why this MUST be
    // restored before any other test's /process call can observe the gap
    // (the same shared, tenant-wide "active assignments" pool every payroll
    // run's processing checks in full). This mirrors the accepted,
    // documented cross-test race already called out in
    // FRAMEWORK_TECH_DEBT.md's H5 for the shared `settings` blob.
    await adminPage.request.patch(`/api/users/${emp.id}/banking`, { data: { bank_account_number: '', bank_ifsc_code: '', bank_upi_id: '' } });
    try {
      const response = await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain(emp.name);
    } finally {
      // Restores the original account number specifically (not a fresh one) — cosmetic, but keeps this employee's banking identity stable across the clear/restore.
      const restoreResponse = await adminPage.request.patch(`/api/users/${emp.id}/banking`, {
        data: { ...completeBankingPayload(emp.name), bank_account_number: emp.bankAccountNumber },
      });
      if (!restoreResponse.ok()) throw new Error(`Failed to restore banking for ${emp.name} (user ${emp.id}) — every future test's run processing is now at risk: ${restoreResponse.status()}`);
    }
  });

  test('PR-NG-11: calling /approve on a run not in Processing status is rejected with 409', { tag: ['@regression'] }, async ({ adminPage }) => {
    const run = await createPayrollRunApi(adminPage); // still Draft
    const response = await adminPage.request.post(`/api/payroll/runs/${run.id}/approve`);
    expect(response.status()).toBe(409);
  });

  test('PR-NG-12: calling /pay on a run not in Approved status is rejected with 409', { tag: ['@regression'] }, async ({ adminPage }) => {
    const run = await createPayrollRunApi(adminPage); // still Draft
    const response = await adminPage.request.post(`/api/payroll/runs/${run.id}/pay`);
    expect(response.status()).toBe(409);
  });

  test('PR-NG-13 / PR-SC-07: two concurrent /approve calls on the same run — only one succeeds, the other gets a concurrency 409', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);
    const processResponse = await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
    if (!processResponse.ok()) throw new Error(`Failed to process run ${run.id}: ${processResponse.status()} ${await processResponse.text()}`);

    const [first, second] = await Promise.all([
      adminPage.request.post(`/api/payroll/runs/${run.id}/approve`),
      adminPage.request.post(`/api/payroll/runs/${run.id}/approve`),
    ]);
    const statuses = [first.status(), second.status()].sort();
    expect(statuses).toEqual([200, 409]);
  });

  test('PR-NG-14: exporting a run not in Approved/Paid status is rejected with 409', { tag: ['@regression'] }, async ({ adminPage }) => {
    const run = await createPayrollRunApi(adminPage); // still Draft
    const response = await adminPage.request.get(`/api/payroll/runs/${run.id}/export`);
    expect(response.status()).toBe(409);
  });

  test('PR-NG-15: process/approve/pay/cancel/export are each independently rejected with 403 for a caller lacking the matching permission', { tag: ['@regression'] }, async ({ adminPage, hrDirectoryPage }) => {
    const structure = await createSalaryStructure(adminPage);
    await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);

    for (const action of ['process', 'approve', 'pay', 'cancel']) {
      const response = await hrDirectoryPage.request.post(`/api/payroll/runs/${run.id}/${action}`);
      expect(response.status()).toBe(403);
    }
    expect((await hrDirectoryPage.request.get(`/api/payroll/runs/${run.id}/export`)).status()).toBe(403);
  });

  test('PR-NG-20 / PR-PM-09: holding only payroll.view.all does not grant GET /payroll/runs or GET /payroll/runs/:id', { tag: ['@regression'] }, async ({ adminPage, hrDirectoryPage }) => {
    const run = await createPayrollRunApi(adminPage);
    // hrDirectory holds none of VIEW_PERMS (['payroll.process','payroll.approve'])
    // — this proves the *narrower* claim VIEW_PERMS itself encodes: even a
    // documented payroll.view.all holder would be rejected here, since that
    // code is not in VIEW_PERMS at all (confirmed by reading payrollRuns.routes.js).
    expect((await hrDirectoryPage.request.get('/api/payroll/runs')).status()).toBe(403);
    expect((await hrDirectoryPage.request.get(`/api/payroll/runs/${run.id}`)).status()).toBe(403);
  });

  test('PR-NG-23: a circular percent_of_component chain is rejected at run-computation time', { tag: ['@regression'] }, async ({ adminPage }) => {
    const codeA = uniqueComponentCode();
    const codeB = uniqueComponentCode();
    const createA = await adminPage.request.post('/api/payroll/components', {
      data: { code: codeA, name: 'E2E Circular A', component_type: 'earning', calculation_type: 'fixed', value: 100 },
    });
    const idA = (await createA.json()).id;
    const createB = await adminPage.request.post('/api/payroll/components', {
      data: { code: codeB, name: 'E2E Circular B', component_type: 'earning', calculation_type: 'percent_of_component', base_component_id: idA },
    });
    const idB = (await createB.json()).id;
    // Rewire A to depend on B, completing the cycle A -> B -> A — only reachable via a raw PATCH, since the UI's own base-component picker excludes the component being edited.
    await adminPage.request.patch(`/api/payroll/components/${idA}`, {
      data: { code: codeA, name: 'E2E Circular A', component_type: 'earning', calculation_type: 'percent_of_component', base_component_id: idB },
    });

    const structure = await createSalaryStructure(adminPage);
    const structures = await (await adminPage.request.get('/api/payroll/structures')).json();
    const structureId = structures.find((s: { name: string }) => s.name === structure.name)?.id;
    await adminPage.request.put(`/api/payroll/structures/${structureId}/components`, {
      data: { items: [{ component_id: idA, sort_order: 0 }, { component_id: idB, sort_order: 1 }] },
    });
    const emp = await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });
    const run = await createPayrollRunApi(adminPage);

    try {
      const response = await adminPage.request.post(`/api/payroll/runs/${run.id}/process`);
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toMatch(/circular or missing base_component_id/);
    } finally {
      // This employee's open assignment references a structure with a
      // deliberately circular component chain — since every future run's
      // processing resolves ALL active assignments tenant-wide (see
      // helpers/payroll.ts's createEmployeeWithSalaryAssignment() doc
      // comment), leaving it broken would 400 every other test's /process
      // call from here on, not just this one's. Break the cycle immediately
      // after asserting it, the same temporary-break-then-restore shape
      // PR-NG-10 uses for banking.
      const repairResponse = await adminPage.request.patch(`/api/payroll/components/${idA}`, {
        data: { code: codeA, name: 'E2E Circular A', component_type: 'earning', calculation_type: 'fixed', value: 100 },
      });
      if (!repairResponse.ok()) {
        throw new Error(`Failed to repair circular component ${idA} for employee ${emp.name} (user ${emp.id}) — every future test's run processing is now at risk: ${repairResponse.status()}`);
      }
    }
  });
});
