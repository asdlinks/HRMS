import { test, expect } from '../fixtures/auth';
import { LeaveSettingsPanel } from '../pages/LeaveSettingsPanel';
import { LeavesPage } from '../pages/LeavesPage';
import { uniqueLeaveTypeName } from '../fixtures/leave-data';
import { skipUnlessVisible } from '../helpers/guards';
import { findLeaveAllocationRowIndex } from '../helpers/leave';

/** `.serial()` — mutates the same shared settings.leave_allocations blob as leave-probation.spec.ts/leave-balance.spec.ts; see their header comments. */
test.describe.serial('Leave Settings (Admin > General Config > Leave Allocations)', () => {
  test('LV-FN-15: admin adds a new Leave Allocation category and it persists after reload', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const settings = new LeaveSettingsPanel(adminPage);
    const typeName = uniqueLeaveTypeName();
    await settings.goto();
    await skipUnlessVisible(settings.addCategoryButton, 'admin persona does not hold general.settings.manage in this tenant.');

    await settings.addRow(typeName, '7');
    await settings.save();
    await settings.expectSaved();

    await settings.goto();
    expect(await findLeaveAllocationRowIndex(settings, typeName)).toBeGreaterThanOrEqual(0);

    // Clean up — remove the row we just added so this test is repeatable without accumulating rows.
    await settings.removeCategory(await findLeaveAllocationRowIndex(settings, typeName));
    await settings.save();
    await settings.expectSaved();
  });

  test('LV-UI-12: adding then removing a Leave Allocation row persists the removal after reload', { tag: ['@regression'] }, async ({ adminPage }) => {
    const settings = new LeaveSettingsPanel(adminPage);
    const typeName = uniqueLeaveTypeName('E2E Removable');
    await settings.goto();
    await skipUnlessVisible(settings.addCategoryButton, 'admin persona does not hold general.settings.manage in this tenant.');

    await settings.addRow(typeName, '4');
    await settings.save();
    await settings.expectSaved();

    await settings.goto();
    await settings.removeCategory(await findLeaveAllocationRowIndex(settings, typeName));
    await settings.save();
    await settings.expectSaved();

    await settings.goto();
    expect(await findLeaveAllocationRowIndex(settings, typeName)).toBe(-1);
  });

  test('LV-PM-07: a persona lacking general.settings.manage cannot reach the General Config tab to edit leave allocations', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const settings = new LeaveSettingsPanel(hrDirectoryPage);
    await hrDirectoryPage.goto('/settings');
    await expect(settings.navItem).toHaveCount(0);
  });

  test('LV-SC-03: leave_allocations is readable by any authenticated user regardless of permission (GET /settings has no guard, confirmed gap)', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const leaves = new LeavesPage(hrDirectoryPage);
    await leaves.goto();
    // hrDirectory holds neither leaves.*/general.settings.* — yet the balance
    // cards (sourced from the same GET /settings call SettingsPage itself
    // uses) still render with the tenant's real configured allocation types.
    const anyBalanceCard = leaves.balanceCard().first();
    await expect(anyBalanceCard).toBeVisible();
  });
});
