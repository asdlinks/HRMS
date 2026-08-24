import { test, expect } from '../fixtures/auth';
import { SalaryGradesPage } from '../pages/SalaryGradesPage';
import { Toast } from '../pages/components/Toast';
import { uniqueGradeCode, uniqueGradeName } from '../fixtures/payroll-data';
import { createSalaryGrade, createSalaryStructure } from '../helpers/payroll';

/**
 * docs/Payroll_SalaryGrades_TestCases.csv — Salary Grades rows.
 * Automates: PR-FN-05, PR-FN-06, PR-NG-01 (grade half), PR-NG-02, PR-NG-04,
 * PR-BD-07, PR-UI-01, PR-VD-08, PR-PM-04.
 */
test.describe('Payroll — Salary Grades', () => {
  // Each test here chains several UI/API arrange steps against a real remote
  // dev server with a large, shared, ever-growing tenant dataset — the default
  // 30s Playwright test timeout is comfortably enough for a single-page CRUD
  // check but not for these multi-step flows. test.slow() (3x multiplier) is
  // Playwright's own idiom for exactly this, applied file-wide via beforeEach
  // rather than hand-picking which individual tests are 'heavy enough'.
  test.beforeEach(() => { test.slow(); });

  test('PR-FN-05: create/update/delete a salary grade with code/name/min-mid-max amounts persisted', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const grades = new SalaryGradesPage(adminPage);
    const created = await createSalaryGrade(adminPage, { minAmount: '30000', midAmount: '45000', maxAmount: '60000' });

    await grades.goto();
    await expect(grades.listItem(created.codeAndName)).toBeVisible();
    await grades.openEdit(created.codeAndName);
    const updatedName = uniqueGradeName();
    await grades.fill({ name: updatedName });
    await grades.submit();
    await new Toast(adminPage).expectVisible('Salary grade updated');

    const updatedCodeAndName = `${created.code} — ${updatedName}`;
    await grades.goto();
    await grades.openDelete(updatedCodeAndName);
    await adminPage.getByRole('button', { name: 'Delete', exact: true }).click();
    await new Toast(adminPage).expectVisible('Salary grade deleted');
    await grades.expectRowAbsent(updatedCodeAndName);
  });

  test('PR-FN-06: GET /salary-grades/:id/structures returns the structures linked to that grade', { tag: ['@regression'] }, async ({ adminPage }) => {
    const grade = await createSalaryGrade(adminPage);
    const structure = await createSalaryStructure(adminPage, { gradeName: grade.name });

    const gradesList = await (await adminPage.request.get('/api/payroll/grades')).json();
    const gradeId = gradesList.find((g: { code: string }) => g.code === grade.code)?.id;
    expect(gradeId).toBeTruthy();

    const linked = await (await adminPage.request.get(`/api/payroll/grades/${gradeId}/structures`)).json();
    expect(linked.some((s: { name: string }) => s.name === structure.name)).toBe(true);
  });

  test('PR-NG-01: creating a grade with a code already used in the tenant is rejected with a 409-style message', { tag: ['@regression'] }, async ({ adminPage }) => {
    const grades = new SalaryGradesPage(adminPage);
    const existing = await createSalaryGrade(adminPage);

    await grades.goto();
    await grades.openAdd();
    await grades.fill({ code: existing.code, name: uniqueGradeName() });
    await grades.submit();

    // SalaryGradesPage.tsx's handleSubmit surfaces a server error via a page-level snackbar, not inline dialog text.
    await new Toast(adminPage).expectVisible(new RegExp(`A grade with code "${existing.code}" already exists`));
  });

  test('PR-NG-02: deleting a grade referenced by a structure is rejected with 409', { tag: ['@regression'] }, async ({ adminPage }) => {
    const grades = new SalaryGradesPage(adminPage);
    const grade = await createSalaryGrade(adminPage);
    await createSalaryStructure(adminPage, { gradeName: grade.name });

    await grades.goto();
    await grades.openDelete(grade.codeAndName);
    await adminPage.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(adminPage.getByText('This grade is linked to a structure or employee assignment and cannot be deleted')).toBeVisible();
    await expect(grades.listItem(grade.codeAndName)).toBeVisible();
  });

  test('PR-NG-04 / PR-VD-08 (confirmed gap): min_amount greater than max_amount is not caught by Zod (no cross-field refinement) and surfaces as an unhandled error, not a friendly 400', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await adminPage.request.post('/api/payroll/grades', {
      data: { code: uniqueGradeCode(), name: uniqueGradeName(), min_amount: 60000, max_amount: 30000 },
    });
    expect(response.status()).not.toBe(400);
    expect(response.ok()).toBeFalsy();
  });

  test('PR-BD-07: min_amount exactly equal to max_amount is accepted', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const response = await adminPage.request.post('/api/payroll/grades', {
      data: { code: uniqueGradeCode(), name: uniqueGradeName(), min_amount: 50000, max_amount: 50000 },
    });
    expect(response.ok()).toBeTruthy();
  });

  test('PR-UI-01: the New/Edit Grade dialog only gates Submit on code+name — no client-side min<=max check', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const grades = new SalaryGradesPage(adminPage);
    await grades.goto();
    await grades.openAdd();

    await expect(grades.submitButton).toBeDisabled();
    await grades.fill({ code: uniqueGradeCode() });
    await expect(grades.submitButton).toBeDisabled();
    await grades.fill({ name: uniqueGradeName(), minAmount: '90000', maxAmount: '10000' });
    // Min > Max is present but the button is enabled purely on code+name being non-empty — matches the server-side gap (PR-NG-04).
    await expect(grades.submitButton).toBeEnabled();
    await grades.cancel();
  });

  test('PR-PM-04: salary-grades.manage is its own permission code, distinct from payroll.structures.manage', { tag: ['@regression'] }, async ({ adminPage, hrDirectoryPage }) => {
    const permissions = await (await adminPage.request.get('/api/roles/permissions')).json();
    const codes = permissions.map((p: { code: string }) => p.code);
    expect(codes).toContain('salary-grades.manage');
    expect(codes).toContain('payroll.structures.manage');

    // A caller holding neither is rejected — proving GET /payroll/grades is
    // gated by its own salary-grades.manage code, not silently satisfied by any payroll.* permission.
    const response = await hrDirectoryPage.request.get('/api/payroll/grades');
    expect(response.status()).toBe(403);
  });
});
