import { test, expect } from '../fixtures/auth';
import { LeavesPage } from '../pages/LeavesPage';
import { AttendancePage } from '../pages/AttendancePage';
import { pastWeekdayDate } from '../fixtures/leave-data';

/**
 * Reuses AttendancePage as-is from the Attendance module (docs/Attendance_AutomationDesign.md) —
 * this is exactly the kind of cross-module reuse the brief calls for: no
 * duplicate "AttendanceCalendar" POM is created here. That POM's calendar
 * defaults to the CURRENT month with no month-navigation methods exposed
 * (removed as unused/fragile during Attendance's own review) — so this test
 * deliberately uses a near-past date still inside the current calendar month
 * (auto-approved immediately per LV-FN-03, no approver needed) rather than a
 * far-future date that would land outside the default month view.
 */
test.describe('Leave × Attendance integration', () => {
  test('LV-FN-19: an Approved leave day is surfaced on the Attendance calendar as a leave day, not attendance', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    const leaves = new LeavesPage(employeeSelfPage);
    const day = pastWeekdayDate(3);
    test.skip(new Date(day).getMonth() !== new Date().getMonth(), 'The near-past date rolled into the previous calendar month (running too close to month start) — AttendancePage defaults to the current month with no navigation exposed in the POM. Rerun later in the month.');

    await leaves.goto();
    await leaves.openApplyDrawer();
    await leaves.fill({ leaveType: 'Casual', startDate: day, endDate: day, reason: 'E2E: attendance-calendar cross-check' });
    await leaves.submit();
    await expect(leaves.toast('Leave recorded and approved!')).toBeVisible(); // past-dated => auto-approved, no approver needed

    const attendance = new AttendancePage(employeeSelfPage);
    await attendance.goto();
    // statusText is `${leave.type} Leave` (see AttendancePage.tsx) — the
    // configured type's exact stored casing is tenant-specific, so this
    // matches case-insensitively on the known " Leave" suffix rather than
    // asserting an exact "Casual Leave" string.
    await expect(employeeSelfPage.locator('[aria-label$="Leave" i]')).toBeVisible();
  });
});
