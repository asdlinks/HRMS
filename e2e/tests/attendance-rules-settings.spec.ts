import { test, expect } from '../fixtures/auth';
import { AttendanceSettingsPanel } from '../pages/AttendanceSettingsPanel';
import { skipUnlessVisible } from '../helpers/guards';

/**
 * The `attendance_rules` setting is tenant-wide and shared with every other
 * spec that reads it (AppShell popup, dashboards, the calendar's off-day
 * shading) â€” see docs/Attendance_AutomationDesign.md Â§9. Every mutating test
 * below reads the original state first and restores it in a `finally` block
 * to keep the mutation window as short as possible, but true isolation from
 * other spec files running concurrently (fullyParallel: true) is not
 * guaranteed by this file alone â€” flagged as a Phase 4 follow-up
 * (recommend tagging this file to run outside the default parallel matrix).
 */
test.describe.serial('Attendance Rules Settings', () => {
  test('ATE-PS-20: update weekly off days, off-Saturdays, and Attendance Required For, then verify persistence', { tag: ['@regression'] }, async ({ adminPage }) => {
    const settings = new AttendanceSettingsPanel(adminPage);
    await settings.goto();
    await skipUnlessVisible(settings.saveButton, 'admin persona does not hold attendance.settings.manage in this tenant.');

    const wasSaturdayOff = await settings.weeklyOffCheckbox('Saturday').isChecked();
    const wasFirstRoleRequired = await settings.firstRequiredForRoleCheckbox().isChecked();

    try {
      await settings.weeklyOffCheckbox('Saturday').setChecked(!wasSaturdayOff);
      await settings.firstRequiredForRoleCheckbox().setChecked(!wasFirstRoleRequired);
      await settings.save();
      await expect(adminPage.getByText(/Attendance rules saved/)).toBeVisible();

      await settings.goto();
      expect(await settings.weeklyOffCheckbox('Saturday').isChecked()).toBe(!wasSaturdayOff);
      expect(await settings.firstRequiredForRoleCheckbox().isChecked()).toBe(!wasFirstRoleRequired);
    } finally {
      await settings.goto();
      await settings.weeklyOffCheckbox('Saturday').setChecked(wasSaturdayOff);
      await settings.firstRequiredForRoleCheckbox().setChecked(wasFirstRoleRequired);
      await settings.save();
      await expect(adminPage.getByText(/Attendance rules saved/)).toBeVisible();
    }
  });

  test('ATE-BD-08: selecting all 7 weekly off days is accepted without a client-side error', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const settings = new AttendanceSettingsPanel(adminPage);
    await settings.goto();
    await skipUnlessVisible(settings.saveButton, 'admin persona does not hold attendance.settings.manage in this tenant.');

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const originalStates = await Promise.all(weekdays.map((d) => settings.weeklyOffCheckbox(d).isChecked()));

    try {
      for (const day of weekdays) await settings.weeklyOffCheckbox(day).setChecked(true);
      await settings.save();
      await expect(adminPage.getByText(/Attendance rules saved/)).toBeVisible();
    } finally {
      await settings.goto();
      for (let i = 0; i < weekdays.length; i++) await settings.weeklyOffCheckbox(weekdays[i]).setChecked(originalStates[i]);
      await settings.save();
      await expect(adminPage.getByText(/Attendance rules saved/)).toBeVisible();
    }
  });

  test('ATE-VD-09: saving with every "Attendance Required For" role unchecked round-trips as fully empty', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const settings = new AttendanceSettingsPanel(adminPage);
    await settings.goto();
    await skipUnlessVisible(settings.saveButton, 'admin persona does not hold attendance.settings.manage in this tenant.');

    const checkboxes = settings.allRequiredForRoleCheckboxes();
    const count = await checkboxes.count();
    const originalStates = await Promise.all(Array.from({ length: count }, (_, i) => checkboxes.nth(i).isChecked()));

    try {
      for (let i = 0; i < count; i++) await checkboxes.nth(i).setChecked(false);
      await settings.save();
      await expect(adminPage.getByText(/Attendance rules saved/)).toBeVisible();

      // Documents actual behavior â€” an empty required_for_roles list round-trips
      // as "nobody required" rather than being rejected or falling back to the
      // default (everyone-except-super_admin) rule.
      await settings.goto();
      for (let i = 0; i < count; i++) expect(await checkboxes.nth(i).isChecked()).toBe(false);
    } finally {
      await settings.goto();
      const restoreBoxes = settings.allRequiredForRoleCheckboxes();
      for (let i = 0; i < count; i++) await restoreBoxes.nth(i).setChecked(originalStates[i]);
      await settings.save();
      await expect(adminPage.getByText(/Attendance rules saved/)).toBeVisible();
    }
  });

  // See shifts.spec.ts's equivalent comment: a bare `test.skip(true, reason)`
  // statement here skips the WHOLE describe block, not just this case.
});
