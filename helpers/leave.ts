/**
 * Module-specific "arrange" helpers for the Leave Management suite
 * (docs/LeaveManagement_TestCases.csv). Reuses the existing, unmodified
 * EmployeesPage/EmployeeFormDialog page objects and uniqueEmployee() factory
 * — this file only adds what's genuinely Leave-specific: a probation-window-
 * aware employee creation helper and a temporary-leave-type-with-restore
 * helper, both of which have no equivalent elsewhere in the framework.
 */
import { type Page } from '@playwright/test';
import { EmployeesPage } from '../pages/EmployeesPage';
import { EmployeeFormDialog } from '../pages/EmployeeFormDialog';
import { uniqueEmployee } from '../fixtures/test-data';
import { toIso } from '../fixtures/leave-data';
import { LeaveSettingsPanel } from '../pages/LeaveSettingsPanel';
import { Toast } from '../pages/components/Toast';

/**
 * Renders an ISO date the same way LeavesPage.tsx's Dates column and
 * LeaveCancellationPage.tsx's MenuItems do (`toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'})`)
 * — used to predict grid/option text for row- and option-matching locators.
 * Assumes the Node test runner and the browser under test share a timezone
 * that never shifts a UTC-midnight DATE value to the previous calendar day
 * (true for any UTC+ offset, including this tenant's — see the same
 * assumption documented for Attendance's date-boundary tests).
 */
export function formatDisplayDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Inverts the app's own probation-end computation
 * (`probationEndDate = joining_date; probationEndDate.setMonth(getMonth() + probationMonths)`
 * — see LeavesPage.tsx's `isProbationActive()` and the equivalent server
 * check) so that `joining_date + probationMonths` lands EXACTLY on
 * `targetEndDate`. JS's `setMonth` silently rolls over into the following
 * month when the source day-of-month doesn't exist in the target month
 * (e.g. Jan 31 + 1 month => Mar 3, skipping Feb) — a naive subtraction isn't
 * guaranteed to invert that cleanly, so this constructs a candidate and
 * verifies it round-trips through the identical forward arithmetic,
 * nudging the day down if it doesn't (bounded retries; only ever needed
 * near month-end edge cases).
 */
function joiningDateForProbationEndingOn(targetEnd: Date, probationMonths: number): Date {
  let day = targetEnd.getDate();
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = new Date(targetEnd.getFullYear(), targetEnd.getMonth() - probationMonths, day);
    const roundTrip = new Date(candidate);
    roundTrip.setMonth(roundTrip.getMonth() + probationMonths);
    if (
      roundTrip.getFullYear() === targetEnd.getFullYear() &&
      roundTrip.getMonth() === targetEnd.getMonth() &&
      roundTrip.getDate() === targetEnd.getDate()
    ) {
      return candidate;
    }
    day -= 1;
  }
  throw new Error('Could not construct a joining date that round-trips to the target probation end date — see joiningDateForProbationEndingOn().');
}

/**
 * `isProbationActive()` compares `new Date() < probationEndDate` — an
 * EXCLUSIVE boundary at probationEndDate's midnight instant. So the true
 * "last day probation is still active" is the calendar day BEFORE
 * probationEndDate, and the "first day it's over" is the calendar day OF
 * probationEndDate itself. Pass `probationStillActive: true` to construct an
 * employee whose probation is active as of right now (LV-NG-03/04's setup);
 * pass `false` to construct one whose probation just ended as of today
 * (LV-BD-06's "first day after" case).
 */
export async function createEmployeeWithProbationState(
  page: Page,
  probationStillActive: boolean,
  probationMonths = 1,
): Promise<ReturnType<typeof uniqueEmployee>> {
  const today = new Date();
  const targetEnd = new Date(today);
  if (probationStillActive) targetEnd.setDate(targetEnd.getDate() + 1); // ends tomorrow => still active today
  // else: ends today => no longer active as of today (any time after midnight)

  const joiningDate = joiningDateForProbationEndingOn(targetEnd, probationMonths);
  const emp = uniqueEmployee({ joiningDate: toIso(joiningDate) });

  const employees = new EmployeesPage(page);
  const form = new EmployeeFormDialog(page);
  await employees.goto();
  await employees.clickAddEmployee();
  await form.waitForOpen();
  await form.fill({
    name: emp.name, email: emp.email, dateOfBirth: emp.dateOfBirth, employeeId: emp.employeeId,
    joiningDate: emp.joiningDate, role: 'Employee', password: emp.password, probationPeriod: String(probationMonths),
  });
  await form.selectRequiredLookups();
  await form.submit();
  await new Toast(page).expectVisible(/Employee added/);
  return emp;
}

/** Index of the allocation row whose Type field equals `typeName` exactly, or -1 if none matches. */
export async function findLeaveAllocationRowIndex(settings: LeaveSettingsPanel, typeName: string): Promise<number> {
  const count = await settings.rowCount();
  for (let i = 0; i < count; i++) {
    if ((await settings.typeField(i).inputValue()) === typeName) return i;
  }
  return -1;
}

/**
 * Temporarily adds a Leave Allocation type via Settings > General Config
 * (needed so a probation-restricted "Earned"/"...paid..." type exists to
 * select in the Apply drawer — the tenant's real configured types are
 * unknown ahead of time), running `use` while it exists, then removing it
 * again — mirrors AttendanceSettingsPanel-based tests' read-mutate-restore
 * pattern for this same shared, tenant-wide `settings` row.
 */
export async function withTemporaryLeaveType<T>(
  page: Page,
  typeName: string,
  days: string,
  use: () => Promise<T>,
): Promise<T> {
  const settings = new LeaveSettingsPanel(page);
  await settings.goto();
  await settings.addRow(typeName, days);
  await settings.save();
  await settings.expectSaved();
  try {
    return await use();
  } finally {
    await settings.goto();
    const index = await findLeaveAllocationRowIndex(settings, typeName);
    if (index >= 0) await settings.removeCategory(index);
    await settings.save();
    await settings.expectSaved();
  }
}
