import { test, expect } from '../fixtures/auth';
import { LeavesPage } from '../pages/LeavesPage';
import { EmployeesPage } from '../pages/EmployeesPage';
import { EmployeeFormDialog } from '../pages/EmployeeFormDialog';
import { Toast } from '../pages/components/Toast';
import { readPersonaUser } from '../fixtures/personas';
import { uniqueWeekdayRange } from '../fixtures/leave-data';
import { uniqueEmployee } from '../fixtures/test-data';
import { createEmployee } from '../helpers/seed';

/**
 * Leave-triggered notification creation (docs/LeaveManagement_TestCases.csv's
 * LV-FN-16/17/18) — previously zero coverage; there is no Notifications-module
 * page object anywhere in this suite (see leave-permissions.spec.ts's LV-PM-05
 * skip), so these read GET /api/notifications directly on the already-
 * authenticated recipient persona's own session rather than adding one, the
 * same "hit the app's own API directly, no new page object" approach
 * kiosk-devices.spec.ts uses elsewhere. Each test clears its own recipient's
 * unread queue first (POST /api/notifications/read) so the assertion can't
 * pass on a stale, unrelated notification left over from an earlier run —
 * every recipient here is a distinct persona per test, so this never races
 * another test's own notification check.
 */
test.describe('Leave — notifications', () => {
  test('LV-FN-16: a manager is notified when a direct report holding leaves.notify_on_apply applies for leave', { tag: ['@regression'] }, async ({ adminPage, managerPage }) => {
    const managerUser = readPersonaUser('manager');
    test.skip(!managerUser, 'manager persona not configured in this environment — readPersonaUser("manager") has no id/name to assign as the new hire\'s manager or to check notifications for.');

    await managerPage.request.post('/api/notifications/read');

    // Inline creation (not helpers/seed.ts's createEmployee — that helper has
    // no way to assign a manager) of a fresh 'Employee'-role hire reporting to
    // the manager persona. role='Employee' carries leaves.notify_on_apply by
    // default (migrations/mssql/007_leaves_notify_permission.sql).
    const employees = new EmployeesPage(adminPage);
    const form = new EmployeeFormDialog(adminPage);
    const emp = uniqueEmployee();
    await employees.goto();
    await employees.clickAddEmployee();
    await form.waitForOpen();
    await form.fill({
      name: emp.name, email: emp.email, dateOfBirth: emp.dateOfBirth, employeeId: emp.employeeId,
      joiningDate: emp.joiningDate, role: 'Employee', password: emp.password, manager: managerUser!.name,
    });
    await form.selectRequiredLookups();
    await form.submit();
    await new Toast(adminPage).expectVisible(/Employee added/);

    const users = await (await adminPage.request.get('/api/users')).json();
    const newUser = users.find((u: { email: string }) => u.email === emp.email);
    expect(newUser?.manager_id).toBe(managerUser!.id);

    const leaves = new LeavesPage(adminPage);
    const { start, end } = uniqueWeekdayRange(40);
    await leaves.goto();
    await leaves.openApplyDrawer();
    await leaves.fill({ leaveType: 'Casual', targetEmployee: emp.name, startDate: start, endDate: end, reason: 'E2E: LV-FN-16 manager notification' });
    await leaves.submit();
    await expect(leaves.toast(/Leave recorded and approved!|Leave application submitted for approval!/)).toBeVisible();

    const notifications = await (await managerPage.request.get('/api/notifications')).json();
    expect(notifications.some((n: { message: string }) => n.message === `New leave request from ${emp.name} (EMPLOYEE)`)).toBe(true);
  });

  test('LV-FN-17: every super_admin is notified when the applicant has no manager_id', { tag: ['@regression'] }, async ({ adminPage }) => {
    await adminPage.request.post('/api/notifications/read');

    const emp = await createEmployee(adminPage); // createEmployee() never assigns a manager -> manager_id stays null
    const users = await (await adminPage.request.get('/api/users')).json();
    const newUser = users.find((u: { email: string }) => u.email === emp.email);
    expect(newUser?.manager_id).toBeFalsy();

    const leaves = new LeavesPage(adminPage);
    const { start, end } = uniqueWeekdayRange(41);
    await leaves.goto();
    await leaves.openApplyDrawer();
    await leaves.fill({ leaveType: 'Casual', targetEmployee: emp.name, startDate: start, endDate: end, reason: 'E2E: LV-FN-17 super-admin fan-out' });
    await leaves.submit();
    await expect(leaves.toast('Leave recorded and approved!')).toBeVisible();

    // admin is itself a super_admin, so its own unread queue is one of the
    // fan-out targets notifyManagerOrAdmins() writes to when manager_id is null.
    const notifications = await (await adminPage.request.get('/api/notifications')).json();
    expect(notifications.some((n: { message: string }) => n.message === `New leave request from ${emp.name} (EMPLOYEE)`)).toBe(true);
  });

  test('LV-FN-18: the leave owner is notified when their leave is approved/rejected via PATCH /leaves/:id', { tag: ['@regression'] }, async ({ adminPage, employeeSelfPage }) => {
    const self = readPersonaUser('employeeSelf');
    test.skip(!self, 'employeeSelf persona not configured in this environment — readPersonaUser("employeeSelf") has no id to apply/notify for.');

    await employeeSelfPage.request.post('/api/notifications/read');

    const { start, end } = uniqueWeekdayRange(42);
    const applyResponse = await employeeSelfPage.request.post('/api/leaves', {
      data: { user_id: self!.id, type: 'Casual', start_date: start, end_date: end, reason: 'E2E: LV-FN-18 status-update notification' },
    });
    expect(applyResponse.ok()).toBeTruthy();
    const { id } = await applyResponse.json();

    const approveResponse = await adminPage.request.patch(`/api/leaves/${id}`, { data: { status: 'Approved' } });
    expect(approveResponse.ok()).toBeTruthy();

    const notifications = await (await employeeSelfPage.request.get('/api/notifications')).json();
    expect(notifications.some((n: { message: string; type: string }) =>
      n.message === 'Your leave request status changed to Approved' && n.type === 'status_update')).toBe(true);
  });
});
