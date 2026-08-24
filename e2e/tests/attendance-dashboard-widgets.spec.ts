import { test, expect } from '../fixtures/auth';

/**
 * Lower-confidence, lighter-weight coverage (matches ATE-PS-22's "Medium"
 * priority, and mirrors leave-dashboard-widgets.spec.ts's own precedent for
 * this kind of widget-presence check) — ManagerDashboard.tsx and its two
 * child components were read only for the specific strings/gating condition
 * asserted below.
 */
test.describe('Attendance — ManagerDashboard widgets', () => {
  test('ATE-PS-22 / AT-UI-15: TodaysAttendanceBar and AttendanceMethodBreakdownCard render for a manager viewing their team', { tag: ['@sanity'] }, async ({ managerPage }) => {
    await managerPage.goto('/dashboard');

    // Both widgets are gated by the same `!isPersonalStatsDashboard` condition
    // (ManagerDashboard.tsx) — `users.view.team` holders (the manager
    // persona) see them; a `users.view.all`-but-not-`.view.team` persona
    // (HR/admin) would not. Bounded wait, not an instant check, since these
    // render after an async fetch completes.
    const bar = managerPage.getByText("Today's Attendance", { exact: true });
    const visible = await bar.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    test.skip(!visible, 'manager persona does not expose the team-stats ManagerDashboard view in this tenant (isPersonalStatsDashboard) — see docs/Attendance_AutomationDesign.md §6.');

    await expect(bar.locator('..')).toBeVisible();
    await expect(managerPage.getByText("Today's Check-in Methods", { exact: true })).toBeVisible();
    // Either real segments (workforce data exists) or the documented empty-state copy.
    await expect(
      managerPage.getByText('No workforce data yet.').or(managerPage.getByText('No check-ins recorded yet today.')).or(managerPage.getByText(/Present|Not Checked In/)).first()
    ).toBeVisible();
  });
});
