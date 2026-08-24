/**
 * Shared "arrange" helpers for the Attendance suite. The Employee suite grew
 * a nearly-identical `createPlainEmployee()`/`createEmployeeAsAdmin()`
 * function copy-pasted across 4+ spec files (password-reset-unlock.spec.ts,
 * pii-banking.spec.ts, role-assignment.spec.ts, status-lifecycle.spec.ts) —
 * see docs/Attendance_AutomationDesign.md §11. This file exists so Attendance
 * specs don't repeat that anti-pattern: every spec that needs a seeded
 * employee/shift/work mode/policy imports from here instead of redefining
 * its own local copy.
 */
import { type Page } from '@playwright/test';
import { EmployeesPage } from '../pages/EmployeesPage';
import { EmployeeFormDialog } from '../pages/EmployeeFormDialog';
import { uniqueEmployee } from '../fixtures/test-data';
import { ShiftsPage, type ShiftFormFields } from '../pages/ShiftsPage';
import { LookupTab } from '../pages/LookupTab';
import { AttendancePoliciesPage, type PolicyFormFields } from '../pages/AttendancePoliciesPage';
import { uniqueShiftName, uniquePolicyName, uniqueWorkMode } from '../fixtures/attendance-data';
import { Toast } from '../pages/components/Toast';

export async function createEmployee(page: Page, overrides: Partial<{ name: string; email: string; employeeId: string; dateOfBirth: string; joiningDate: string }> = {}) {
  const employees = new EmployeesPage(page);
  const form = new EmployeeFormDialog(page);
  const emp = uniqueEmployee(overrides);

  await employees.goto();
  await employees.clickAddEmployee();
  await form.waitForOpen();
  await form.fill({ name: emp.name, email: emp.email, dateOfBirth: emp.dateOfBirth, employeeId: emp.employeeId, joiningDate: emp.joiningDate, role: 'Employee', password: emp.password });
  await form.selectRequiredLookups();
  await form.submit();
  await new Toast(page).expectVisible(/Employee added/);
  return emp;
}

/** Creates a General-type shift by default; pass `shiftType`/other fields to override. */
export async function createShift(page: Page, fields: ShiftFormFields & { name?: string } = {}): Promise<string> {
  const shifts = new ShiftsPage(page);
  const name = fields.name ?? uniqueShiftName();

  await shifts.goto();
  await shifts.openAdd();
  await shifts.fill({ shiftType: 'General', ...fields, name });
  await shifts.submit();
  await new Toast(page).expectVisible('Shift created');
  return name;
}

export async function createWorkMode(page: Page, overrides: Partial<{ code: string; name: string; description: string }> = {}) {
  const lookup = new LookupTab(page, 'Work Mode');
  const wm = uniqueWorkMode(overrides);

  await page.goto('/work-modes');
  await lookup.openAdd();
  await lookup.fill({ code: wm.code, name: wm.name, description: wm.description });
  await lookup.submit();
  await new Toast(page).expectVisible('Work mode created');
  return wm;
}

/** Creates a Hybrid policy allowing Manual check-in by default; pass `methods`/other fields to override. */
export async function createAttendancePolicy(page: Page, fields: PolicyFormFields & { name?: string } = {}): Promise<string> {
  const policies = new AttendancePoliciesPage(page);
  const name = fields.name ?? uniquePolicyName();

  await policies.goto();
  await policies.openAdd();
  await policies.fill({ policyType: 'Hybrid', methods: ['Manual (self check-in)'], ...fields, name });
  await policies.submit();
  await new Toast(page).expectVisible('Policy created');
  return name;
}
