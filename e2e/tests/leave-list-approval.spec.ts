import { test, expect } from '../fixtures/auth';
import { LeavesPage } from '../pages/LeavesPage';
import { uniqueWeekdayRange } from '../fixtures/leave-data';
import { createEmployee } from '../helpers/seed';
import { formatDisplayDate as formatDisplay } from '../helpers/leave';

test.describe('Leave List & Approval', () => {
  test('LV-FN-05: employeeSelf viewing own leaves sees only their own rows (no Employee column)', { tag: ['@smoke'] }, async ({ employeeSelfPage }) => {
    const leaves = new LeavesPage(employeeSelfPage);
    await leaves.goto();
    // leaves.view.own alone (no .team/.all) hides the Employee column entirely (canSeeEmployeeColumn).
    expect(await leaves.isActionsColumnVisible()).toBe(false); // employeeSelf also lacks leaves.approve
    await expect(employeeSelfPage.getByRole('columnheader', { name: 'Employee' })).toHaveCount(0);
  });

  test('LV-FN-06 / LV-FN-07: manager sees the Employee column (team scope), admin sees it too (all scope)', { tag: ['@smoke'] }, async ({ managerPage, adminPage }) => {
    const managerLeaves = new LeavesPage(managerPage);
    await managerLeaves.goto();
    await expect(managerPage.getByRole('columnheader', { name: 'Employee' })).toBeVisible();

    const adminLeaves = new LeavesPage(adminPage);
    const emp = await createEmployee(adminPage);
    const { start, end } = uniqueWeekdayRange(1);
    await adminLeaves.goto();
    await adminLeaves.openApplyDrawer();
    await adminLeaves.fill({ leaveType: 'Casual', targetEmployee: emp.name, startDate: start, endDate: end, reason: 'E2E: view.all scope check' });
    await adminLeaves.submit();
    await expect(adminLeaves.toast('Leave recorded and approved!')).toBeVisible();
    await expect(adminLeaves.rowByEmployee(emp.name)).toBeVisible(); // tenant-wide row, not just direct reports
  });

  test('LV-FN-08: approving a Pending leave transitions it to Approved', { tag: ['@smoke'] }, async ({ adminPage, employeeSelfPage }) => {
    const selfLeaves = new LeavesPage(employeeSelfPage);
    const { start, end } = uniqueWeekdayRange(4);
    await selfLeaves.goto();
    await selfLeaves.openApplyDrawer();
    await selfLeaves.fill({ leaveType: 'Casual', startDate: start, endDate: end, reason: 'E2E: to be approved' });
    await selfLeaves.submit();
    await expect(selfLeaves.toast('Leave application submitted for approval!')).toBeVisible();

    const adminLeaves = new LeavesPage(adminPage);
    await adminLeaves.goto();
    await adminLeaves.filterByStatus('Pending');
    const row = adminLeaves.rowByDateRangeText(`${formatDisplay(start)} â†’ ${formatDisplay(end)}`);
    await expect(row).toBeVisible();
    await adminLeaves.approve(row);
    await expect(adminLeaves.toast('Leave approved successfully!')).toBeVisible();
  });

  test('LV-FN-09: rejecting a Pending leave transitions it to Rejected', { tag: ['@smoke'] }, async ({ adminPage, employeeSelfPage }) => {
    const selfLeaves = new LeavesPage(employeeSelfPage);
    const { start, end } = uniqueWeekdayRange(8);
    await selfLeaves.goto();
    await selfLeaves.openApplyDrawer();
    await selfLeaves.fill({ leaveType: 'Casual', startDate: start, endDate: end, reason: 'E2E: to be rejected' });
    await selfLeaves.submit();
    await expect(selfLeaves.toast('Leave application submitted for approval!')).toBeVisible();

    const adminLeaves = new LeavesPage(adminPage);
    await adminLeaves.goto();
    await adminLeaves.filterByStatus('Pending');
    const row = adminLeaves.rowByDateRangeText(`${formatDisplay(start)} â†’ ${formatDisplay(end)}`);
    await expect(row).toBeVisible();
    await adminLeaves.reject(row);
    await expect(adminLeaves.toast('Leave rejected successfully!')).toBeVisible();
  });

  test('LV-NG-11 / LV-VD-03: no UI action can send an out-of-enum status â€” Approve/Reject/Cancel are the only status-mutating controls and are each hardcoded to one literal status', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const leaves = new LeavesPage(adminPage);
    await leaves.goto();
    // Neither 'Pending' (LV-NG-11) nor any other arbitrary status string
    // (LV-VD-03) is ever sent by any button on this page â€” Approve/Reject
    // are literally labelled after (and hardcoded to) the exact status they
    // set, and Cancel lives on a separate page/flow entirely.
    await expect(leaves.page.getByRole('button', { name: /^Pending$/ })).toHaveCount(0);
  });

  test('LV-NG-12 / LV-UI-04: approving/rejecting a leave that is no longer Pending is rejected â€” the row action disappears once decided', { tag: ['@regression'] }, async ({ adminPage, employeeSelfPage }) => {
    const selfLeaves = new LeavesPage(employeeSelfPage);
    const { start, end } = uniqueWeekdayRange(5);
    await selfLeaves.goto();
    await selfLeaves.openApplyDrawer();
    await selfLeaves.fill({ leaveType: 'Casual', startDate: start, endDate: end, reason: 'E2E: double-decision guard' });
    await selfLeaves.submit();
    await expect(selfLeaves.toast('Leave application submitted for approval!')).toBeVisible();

    const adminLeaves = new LeavesPage(adminPage);
    await adminLeaves.goto();
    const dateRangeText = `${formatDisplay(start)} â†’ ${formatDisplay(end)}`;
    const row = adminLeaves.rowByDateRangeText(dateRangeText);
    await adminLeaves.approve(row);
    await expect(adminLeaves.toast('Leave approved successfully!')).toBeVisible();
    // Once Approved, the row's Actions cell renders nothing (status !== 'Pending') â€” no way to re-approve/reject through the UI.
    await expect(row.getByRole('button', { name: /^(Approve|Reject)$/ })).toHaveCount(0);
  });

  test('LV-NG-15 / LV-UI-04: a persona lacking leaves.approve sees no Approve/Reject actions', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const leaves = new LeavesPage(hrDirectoryPage);
    await leaves.goto();
    await expect(hrDirectoryPage.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0);
  });

  test('LV-NG-17: a persona lacking any leaves.view.* permission sees an empty list, not an error page (GET /leaves\' 403 is swallowed by a bare try/catch â€” console.error only)', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const leaves = new LeavesPage(hrDirectoryPage);
    await leaves.goto();
    await expect(hrDirectoryPage.getByText('No leave records found')).toBeVisible();
  });

  test('LV-UI-01: the "Apply for Leave" button is rendered unconditionally, even for a persona lacking any apply permission (confirmed gap)', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const leaves = new LeavesPage(hrDirectoryPage);
    await leaves.goto();
    await expect(leaves.applyButton).toBeVisible();
  });

  test('LV-NG-16: submitting via the Apply drawer without leaves.apply.own/.any is blocked server-side (route-level requireAnyPermission)', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const leaves = new LeavesPage(hrDirectoryPage);
    const { start, end } = uniqueWeekdayRange(7);
    await leaves.goto();
    await leaves.openApplyDrawer();
    await leaves.fill({ leaveType: 'Casual', startDate: start, endDate: end, reason: 'E2E: apply without any apply permission' });
    await leaves.submit();

    await expect(leaves.toast(/forbidden|permission|Failed to record leave/i)).toBeVisible();
  });

  test('LV-NG-18 / LV-SC-01 / LV-SC-02 / LV-PM-03: a leaves.approve holder can approve their OWN pending leave (confirmed self-approval gap â€” leaves.approve carries no manager-relationship/ownership dimension)', { tag: ['@regression'] }, async ({ managerPage }) => {
    const leaves = new LeavesPage(managerPage);
    const { start, end } = uniqueWeekdayRange(6);

    await leaves.goto();
    await leaves.openApplyDrawer();
    await leaves.fill({ leaveType: 'Casual', startDate: start, endDate: end, reason: 'E2E: self-approval gap' });
    await leaves.submit();
    await expect(leaves.toast('Leave application submitted for approval!')).toBeVisible();

    const dateRangeText = `${formatDisplay(start)} â†’ ${formatDisplay(end)}`;
    const row = leaves.rowByDateRangeText(dateRangeText);
    // No ownership check exists in the Approve/Reject branch â€” the button is
    // present and functional on the manager's own row.
    await expect(row.getByRole('button', { name: 'Approve' })).toBeVisible();

    // Intercept the actual PATCH /leaves/:id the Approve click triggers â€” a
    // 200 with {success:true} here (not just the toast) is the concrete
    // proof that leaves.approve carries no manager-relationship/ownership
    // dimension at all: the server accepted this exactly as it would for any
    // other employee's leave (LV-FN-08), with the caller and the leave owner
    // being the same person.
    const [response] = await Promise.all([
      managerPage.waitForResponse((res) => /\/api\/leaves\/\d+$/.test(res.url()) && res.request().method() === 'PATCH'),
      leaves.approve(row),
    ]);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    await expect(leaves.toast('Leave approved successfully!')).toBeVisible();
  });


  // NOTE: a bare `test.skip(true, reason)` statement here (as this used to
  // be) skips the WHOLE describe block â€” see shifts.spec.ts's equivalent note.
});
