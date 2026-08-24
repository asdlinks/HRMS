/**
 * Shared "arrange" helpers for the Payroll & Salary Grades suite — mirrors
 * helpers/seed.ts's/helpers/leave.ts's shape (goto -> open dialog -> fill ->
 * submit -> assert toast -> return created identity) rather than inventing a
 * new one. Every module-specific arrange helper with no equivalent elsewhere
 * lives here, per FRAMEWORK_GUIDELINES.md's helpers/ folder convention.
 */
import { type Page } from '@playwright/test';
import { PayrollComponentsPage, type ComponentFormFields } from '../pages/PayrollComponentsPage';
import { PayrollStructuresPage, type StructureFormFields } from '../pages/PayrollStructuresPage';
import { SalaryGradesPage, type GradeFormFields } from '../pages/SalaryGradesPage';
import { PayrollAssignmentsPage, type AssignmentFormFields } from '../pages/PayrollAssignmentsPage';
import { PayrollOvertimePage, type OvertimeFormFields } from '../pages/PayrollOvertimePage';
import { uniqueComponentCode, uniqueComponentName, uniqueStructureName, uniqueGradeCode, uniqueGradeName, uniquePayrollPeriod, uniqueOvertimeDate, uniqueBankAccountNumber } from '../fixtures/payroll-data';
import { createEmployee } from './seed';
import { Toast } from '../pages/components/Toast';

/** Creates a Fixed-amount Earning component by default; pass fields to override. */
export async function createSalaryComponent(page: Page, overrides: ComponentFormFields = {}) {
  const components = new PayrollComponentsPage(page);
  const code = overrides.code ?? uniqueComponentCode();
  const name = overrides.name ?? uniqueComponentName();

  await components.goto();
  await components.openAdd();
  await components.fill({ componentType: 'Earning', calculationType: 'Fixed amount', value: '1000', ...overrides, code, name });
  await components.submit();
  await new Toast(page).expectVisible('Component created');
  return { code, name };
}

export async function createSalaryStructure(page: Page, overrides: StructureFormFields = {}) {
  const structures = new PayrollStructuresPage(page);
  const name = overrides.name ?? uniqueStructureName();

  await structures.goto();
  await structures.openAdd();
  await structures.fill({ ...overrides, name });
  await structures.submit();
  await new Toast(page).expectVisible('Structure created');
  return { name };
}

export async function createSalaryGrade(page: Page, overrides: GradeFormFields = {}) {
  const grades = new SalaryGradesPage(page);
  const code = overrides.code ?? uniqueGradeCode();
  const name = overrides.name ?? uniqueGradeName();

  await grades.goto();
  await grades.openAdd();
  await grades.fill({ ...overrides, code, name });
  await grades.submit();
  await new Toast(page).expectVisible('Salary grade created');
  return { code, name, codeAndName: `${code} — ${name}` };
}

/**
 * assertBankingComplete() (payrollCalculation.service.js) requires ALL five
 * of these fields non-empty — bank_branch and bank_ifsc_code are easy to
 * forget since the UI's own EmployeeFormDialog banking form doesn't treat
 * them as required, but the payroll run processor does. Centralized here
 * rather than repeated at every call site that needs a real, complete
 * banking payload (createEmployeeWithSalaryAssignment, PR-BD-03's
 * shouldPass branch, PR-NG-10's restore, employeeSelf's own payslip setup).
 */
export function completeBankingPayload(holderName: string) {
  return {
    bank_account_holder_name: holderName,
    bank_name: 'E2E Test Bank',
    bank_branch: 'E2E Test Branch',
    bank_account_number: uniqueBankAccountNumber(),
    bank_ifsc_code: 'TEST0000001',
  };
}

/** Low-level: assumes `employeeName` already exists. Prefer createEmployeeWithSalaryAssignment() for a positive-path test that might ever get processed by a payroll run — see that function's doc comment for why. */
export async function createSalaryAssignment(page: Page, employeeName: string, fields: AssignmentFormFields) {
  const assignments = new PayrollAssignmentsPage(page);

  await assignments.goto();
  await assignments.search(employeeName);
  await assignments.selectEmployee(employeeName);
  await assignments.openAdd();
  await assignments.fill(fields);
  await assignments.submit();
  await new Toast(page).expectVisible('Salary assignment created');
}

/**
 * Creates a fresh employee, completes their banking information, then gives
 * them a salary assignment — in that order, so the resulting open assignment
 * is never, even momentarily, "active AND missing banking" from a concurrent
 * test's point of view.
 *
 * Why this matters: `payrollCalculation.service.js`'s `computeRunLines()`
 * resolves the employees a run processes via `listActiveAsOf(tenantId,
 * cycleEnd)` — an *entire-tenant* query with no per-run employee scoping —
 * then calls `assertBankingComplete()` across every one of them before
 * computing anything. Since assignments are open-ended (no expiry) and this
 * framework has no delete mechanism for them, an assignment created without
 * banking would permanently sit in that tenant-wide pool and 400 every
 * *other* test's (and, on this shared dev tenant, every real user's) attempt
 * to process ANY payroll run, for any period, from then on — not a scoped
 * flakiness risk but a standing regression. Every assignment this suite
 * creates for a test that isn't specifically exercising that negative path
 * (PR-NG-10, which clears and restores banking itself, immediately, in a
 * try/finally) goes through this helper for exactly that reason.
 */
export async function createEmployeeWithSalaryAssignment(page: Page, fields: AssignmentFormFields) {
  const emp = await createEmployee(page);
  // GET /api/users returns the tenant's entire, ever-growing directory
  // unfiltered — confirmed live to occasionally exceed the framework's
  // default 15s actionTimeout as that directory grows. A generous override
  // here, rather than raising the global default, keeps the slow case local
  // to the one call site that actually needs it.
  const users = await (await page.request.get('/api/users', { timeout: 30000 })).json();
  const user = users.find((u: { email: string }) => u.email === emp.email);
  const banking = completeBankingPayload(emp.name);
  const bankingResponse = await page.request.patch(`/api/users/${user.id}/banking`, { data: banking });
  // Never silently continue past this call — the whole point of this helper
  // is guaranteeing the assignment this creates is never one of the
  // "active AND missing banking" rows described above. An unnoticed failure
  // here (confirmed to happen live, silently, before this check existed) is
  // exactly how that regression gets created.
  if (!bankingResponse.ok()) {
    throw new Error(`Failed to set banking for ${emp.name} (user ${user.id}): ${bankingResponse.status()} ${await bankingResponse.text()}`);
  }
  await createSalaryAssignment(page, emp.name, fields);
  return { ...emp, id: user.id, bankAccountNumber: banking.bank_account_number };
}

/** Submits overtime for `fields.employeeName` at a collision-free-by-construction work_date unless one is supplied — see fixtures/payroll-data.ts's uniqueOvertimeDate() doc comment. */
export async function createOvertimeEntry(page: Page, fields: OvertimeFormFields) {
  const overtime = new PayrollOvertimePage(page);
  const workDate = fields.workDate ?? uniqueOvertimeDate();

  await overtime.goto();
  await overtime.openAdd();
  await overtime.fill({ ...fields, workDate });
  await overtime.submit();
  await new Toast(page).expectVisible('Overtime submitted');
  return { workDate };
}

/**
 * Creates a payroll run directly via the API, bypassing the UI's
 * real-calendar-bound Month/Year <select> (only [now-1, now, now+1] — see
 * PR-UI-04), at a period that can never collide with real payroll data or a
 * concurrent worker's own call — see fixtures/payroll-data.ts's
 * uniquePayrollPeriod() doc comment for why this is safe and necessary.
 */
export async function createPayrollRunApi(page: Page): Promise<{ id: number; year: number; month: number }> {
  const { year, month } = uniquePayrollPeriod();
  const response = await page.request.post('/api/payroll/runs', { data: { period_year: year, period_month: month } });
  if (!response.ok()) {
    throw new Error(`Failed to create payroll run via API for ${month}/${year}: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  return { id: body.id, year, month };
}

/**
 * Temporary-add-then-restore mutation of the shared, tenant-wide
 * `payroll_settings` blob — the exact pattern helpers/leave.ts's
 * withTemporaryLeaveType() establishes for `settings.leave_allocations` (see
 * FRAMEWORK_GUIDELINES.md's Cleanup strategy), applied here to the payroll
 * equivalent rather than inventing a second shape for the same problem.
 * Callers MUST run inside a `test.describe.serial()` block, same requirement
 * as the leave helper, to avoid a save-restore race against another test in
 * the same file — see FRAMEWORK_TECH_DEBT.md's H5 for the known, accepted
 * cross-*file* race this does not (and cannot, from inside Playwright) close.
 */
export async function withTemporaryPayrollSettings<T>(
  page: Page,
  overrides: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const before = await (await page.request.get('/api/settings')).json();
  const original = before.payroll_settings || {};
  try {
    await page.request.post('/api/settings/bulk', { data: { payroll_settings: { ...original, ...overrides } } });
    return await fn();
  } finally {
    await page.request.post('/api/settings/bulk', { data: { payroll_settings: original } });
  }
}
