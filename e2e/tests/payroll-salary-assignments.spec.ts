import { test, expect } from '../fixtures/auth';
import { PayrollAssignmentsPage } from '../pages/PayrollAssignmentsPage';
import { CTC_ANNUAL_BOUNDARY } from '../fixtures/payroll-data';
import { createSalaryStructure, createEmployeeWithSalaryAssignment, createSalaryAssignment, completeBankingPayload } from '../helpers/payroll';
import { createEmployee } from '../helpers/seed';

/**
 * docs/Payroll_SalaryGrades_TestCases.csv — Employee Salary Assignment rows.
 * Automates: PR-FN-07, PR-FN-08, PR-NG-05, PR-NG-06, PR-BD-03, PR-UI-02,
 * PR-UI-03, PR-VD-04, PR-AP-03, PR-PM-03.
 */
test.describe('Payroll — Employee Salary Assignment', () => {
  // Each test here chains several UI/API arrange steps against a real remote
  // dev server with a large, shared, ever-growing tenant dataset — the default
  // 30s Playwright test timeout is comfortably enough for a single-page CRUD
  // check but not for these multi-step flows. test.slow() (3x multiplier) is
  // Playwright's own idiom for exactly this, applied file-wide via beforeEach
  // rather than hand-picking which individual tests are 'heavy enough'.
  test.beforeEach(() => { test.slow(); });

  test('PR-FN-07: assigning a new salary auto-closes the employee\'s prior open assignment', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const assignments = new PayrollAssignmentsPage(adminPage);
    const structureA = await createSalaryStructure(adminPage);
    const structureB = await createSalaryStructure(adminPage);
    const emp = await createEmployeeWithSalaryAssignment(adminPage, { structureName: structureA.name, ctcAnnual: '500000', effectiveFrom: '2025-01-01' });

    await createSalaryAssignment(adminPage, emp.name, { structureName: structureB.name, ctcAnnual: '700000', effectiveFrom: '2025-06-01' });

    await assignments.goto();
    await assignments.search(emp.name);
    await assignments.selectEmployee(emp.name);
    await expect((await assignments.historyChip(structureA.name))).toBe('Past');
    await expect((await assignments.historyChip(structureB.name))).toBe('Current');
  });

  test('PR-FN-08: GET /assignments?userId= returns the full chronological assignment history for that user', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structureA = await createSalaryStructure(adminPage);
    const structureB = await createSalaryStructure(adminPage);
    const emp = await createEmployeeWithSalaryAssignment(adminPage, { structureName: structureA.name, ctcAnnual: '500000', effectiveFrom: '2025-01-01' });
    await createSalaryAssignment(adminPage, emp.name, { structureName: structureB.name, ctcAnnual: '700000', effectiveFrom: '2025-06-01' });

    const history = await (await adminPage.request.get(`/api/payroll/assignments?userId=${emp.id}`)).json();
    expect(history).toHaveLength(2);
    const closed = history.find((h: { structure_name: string }) => h.structure_name === structureA.name);
    expect(closed.effective_to).not.toBeNull();
    const open = history.find((h: { structure_name: string }) => h.structure_name === structureB.name);
    expect(open.effective_to).toBeNull();
  });

  test('PR-NG-05: submitting an assignment without user_id/structure_id/effective_from is rejected with 400', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await adminPage.request.post('/api/payroll/assignments', { data: { ctc_annual: 500000 } });
    expect(response.status()).toBe(400);
  });

  test('PR-NG-06 (confirmed gap): a negative ctc_annual is not caught by Zod, only the DB CHECK constraint', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    const emp = await createEmployee(adminPage);
    const users = await (await adminPage.request.get('/api/users')).json();
    const user = users.find((u: { email: string }) => u.email === emp.email);
    const structures = await (await adminPage.request.get('/api/payroll/structures')).json();
    const structureId = structures.find((s: { name: string }) => s.name === structure.name)?.id;

    const response = await adminPage.request.post('/api/payroll/assignments', {
      data: { user_id: user.id, structure_id: structureId, ctc_annual: -1, effective_from: '2025-01-01' },
    });
    expect(response.status()).not.toBe(400);
    expect(response.ok()).toBeFalsy();
  });

  for (const { value, shouldPass, label } of CTC_ANNUAL_BOUNDARY) {
    test(`PR-BD-03: ctc_annual ${label}`, { tag: ['@sanity'] }, async ({ adminPage }) => {
      const structure = await createSalaryStructure(adminPage);
      const emp = await createEmployee(adminPage);
      const users = await (await adminPage.request.get('/api/users')).json();
      const user = users.find((u: { email: string }) => u.email === emp.email);
      if (shouldPass) {
        // A successful branch here creates a real, permanent open assignment
        // — must set complete banking (all 5 fields assertBankingComplete()
        // requires) or every future payroll run's processing 400s tenant-wide
        // (see helpers/payroll.ts's createEmployeeWithSalaryAssignment() doc comment).
        const bankingResponse = await adminPage.request.patch(`/api/users/${user.id}/banking`, { data: completeBankingPayload(emp.name) });
        expect(bankingResponse.ok()).toBeTruthy();
      }
      const structures = await (await adminPage.request.get('/api/payroll/structures')).json();
      const structureId = structures.find((s: { name: string }) => s.name === structure.name)?.id;

      const response = await adminPage.request.post('/api/payroll/assignments', {
        data: { user_id: user.id, structure_id: structureId, ctc_annual: value, effective_from: '2025-01-01' },
      });
      if (shouldPass) expect(response.ok()).toBeTruthy();
      else expect(response.ok()).toBeFalsy();
    });
  }

  test('PR-UI-02: Add Assignment dialog blocks submission with inline required-field errors when structure/CTC/effective date are missing', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const emp = await createEmployee(adminPage);
    const assignments = new PayrollAssignmentsPage(adminPage);

    await assignments.goto();
    await assignments.search(emp.name);
    await assignments.selectEmployee(emp.name);
    await assignments.openAdd();
    await assignments.fill({ ctcAnnual: '' });
    await assignments.submit();

    // ctc_annual is a TextField with helperText wired to the Zod message —
    // visible. structure_id is a Select with only `error={!!errors.structure_id}`
    // (red styling) and no FormHelperText at all — its "Structure is required"
    // Zod message never actually renders anywhere (confirmed by reading
    // SalaryAssignmentFormDialog.tsx), so the dialog staying open is the only
    // observable proof that field also blocked submission.
    await expect(assignments.errorText('Annual CTC is required')).toBeVisible();
    await expect(assignments.dialog).toBeVisible();
  });

  test('PR-UI-03: the assignment dialog explains that submitting closes the prior open assignment and keeps full history', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const emp = await createEmployee(adminPage);
    const assignments = new PayrollAssignmentsPage(adminPage);

    await assignments.goto();
    await assignments.search(emp.name);
    await assignments.selectEmployee(emp.name);
    await assignments.openAdd();

    await expect(assignments.dialog.getByText(/This closes any currently open assignment and starts a new one from the effective date/)).toBeVisible();
    await assignments.cancel();
  });

  test('PR-VD-04 (confirmed gap): effective_from as a non-date string passes Zod (min-length only) and fails only at the SQL DATE cast', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    const emp = await createEmployee(adminPage);
    const users = await (await adminPage.request.get('/api/users')).json();
    const user = users.find((u: { email: string }) => u.email === emp.email);
    const structures = await (await adminPage.request.get('/api/payroll/structures')).json();
    const structureId = structures.find((s: { name: string }) => s.name === structure.name)?.id;

    const response = await adminPage.request.post('/api/payroll/assignments', {
      data: { user_id: user.id, structure_id: structureId, ctc_annual: 500000, effective_from: 'not-a-date' },
    });
    expect(response.status()).not.toBe(400);
    expect(response.ok()).toBeFalsy();
  });

  test('PR-AP-03: GET /assignments without userId returns all currently-open assignments; with userId returns full history', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structure = await createSalaryStructure(adminPage);
    const emp = await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '500000', effectiveFrom: '2025-01-01' });

    const allOpen = await (await adminPage.request.get('/api/payroll/assignments')).json();
    expect(allOpen.some((a: { user_id: number; effective_to: string | null }) => a.user_id === emp.id && a.effective_to === null)).toBe(true);

    const history = await (await adminPage.request.get(`/api/payroll/assignments?userId=${emp.id}`)).json();
    expect(history).toHaveLength(1);
    expect(history[0].structure_name).toBe(structure.name);
  });

  test('PR-PM-03: payroll.assign is required for both GET and POST on /assignments', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const getResponse = await hrDirectoryPage.request.get('/api/payroll/assignments');
    expect(getResponse.status()).toBe(403);

    const postResponse = await hrDirectoryPage.request.post('/api/payroll/assignments', {
      data: { user_id: 1, structure_id: 1, ctc_annual: 100000, effective_from: '2025-01-01' },
    });
    expect(postResponse.status()).toBe(403);
  });
});
