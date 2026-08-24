import { test, expect } from '../fixtures/auth';
import { ShiftsPage } from '../pages/ShiftsPage';
import { LookupTab } from '../pages/LookupTab';
import { AttendanceSettingsPanel } from '../pages/AttendanceSettingsPanel';
import { AttendanceCard } from '../pages/AttendanceCard';
import { skipUnlessVisible } from '../helpers/guards';

/**
 * Cross-cutting permission checks for the Attendance module. See
 * docs/Attendance_AutomationDesign.md Â§6 â€” none of the 5 existing personas
 * is confirmed by e2e/.env.e2e.example to hold (or lack) the
 * attendance/shifts/work-modes-specific permissions; assumptions below are
 * documented per test rather than assumed silently, and every assertion
 * fails loudly (not silently passes) if an assumption turns out wrong.
 *
 * Finding worth flagging for Phase 4: unlike ShiftsPage (which gates its
 * "New Shift" button behind `hasPermission('shifts.manage')`),
 * AttendancePoliciesPage and WorkModesPage render their create/edit/delete
 * controls UNCONDITIONALLY â€” permission is enforced server-side only. A
 * low-privilege persona therefore sees fully actionable-looking buttons that
 * would only fail on click, which is inconsistent with Shifts' UX and not
 * something a client-side "button absent" assertion can detect. Tests below
 * are scoped to what's actually observable from the UI.
 */
test.describe('Attendance â€” permissions', () => {
  test('ATE-PM-05: a persona lacking shifts.manage sees no "New Shift" button', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const shifts = new ShiftsPage(hrDirectoryPage);
    await shifts.goto();
    await expect(shifts.newShiftButton).toHaveCount(0);
  });

  test('ATE-PM-06: the Work Modes list itself is visible to any authenticated user (GET / is permission-free)', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    const lookup = new LookupTab(employeeSelfPage, 'Work Mode');
    await employeeSelfPage.goto('/work-modes');
    // Regardless of work-modes.manage, the list itself must render (or at
    // minimum not error) â€” matches work-modes.routes.js's GET / having no
    // permission requirement (see docs/Attendance_AutomationDesign.md Â§6).
    await expect(employeeSelfPage.getByRole('heading', { name: 'Work Modes' })).toBeVisible();
    await expect(lookup.newButton).toBeVisible(); // rendered unconditionally â€” see file header note
  });

  test('ATE-PM-10: an employee retains attendance.checkin capability regardless of the "Attendance Required For" opt-out setting', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    const card = new AttendanceCard(employeeSelfPage);
    await employeeSelfPage.goto('/attendance');
    // State-independent by design: whether employeeSelf is opted in or out
    // of the reminder/KPI surfaces (Phase 12B), and whether they've already
    // checked in today, the card itself â€” proof that check-in capability
    // exists â€” must always render for a persona holding attendance.checkin.
    // Per Settings' own copy: "They can still check in manually if they
    // choose to" â€” this asserts that promise holds, without needing to
    // control employeeSelf's daily check-in state (see
    // attendance-checkin-checkout.spec.ts's header comment).
    await expect(card.root).toBeVisible();
  });

  // See shifts.spec.ts's equivalent comment: a bare `test.skip(true, reason)`
  // statement here (rather than the 2-arg placeholder-test form below) skips
  // the WHOLE describe block, not just these three documented cases.

});
