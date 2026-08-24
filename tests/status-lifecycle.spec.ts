import { test, expect } from '../fixtures/auth';
import { readPersonaUser } from '../fixtures/personas';
import { EmployeesPage } from '../pages/EmployeesPage';
import { EmployeeFormDialog } from '../pages/EmployeeFormDialog';
import { ConfirmDialog } from '../pages/components/ConfirmDialog';
import { uniqueEmployee } from '../fixtures/test-data';

async function createPlainEmployee(adminPage: import('@playwright/test').Page) {
  const employees = new EmployeesPage(adminPage);
  const form = new EmployeeFormDialog(adminPage);
  const emp = uniqueEmployee();

  await employees.goto();
  await employees.clickAddEmployee();
  await form.waitForOpen();
  await form.fill({ name: emp.name, email: emp.email, dateOfBirth: emp.dateOfBirth, employeeId: emp.employeeId, joiningDate: emp.joiningDate, role: 'Employee', password: emp.password });
  await form.selectRequiredLookups();
  await form.submit();
  await expect(adminPage.getByText(/Employee added/)).toBeVisible();
  return emp;
}

test.describe('Status Lifecycle', () => {
  test('EM-FN-15 / EM-UI-10: disabling then re-enabling an employee shows a confirm dialog and updates the status chip', { tag: ['@smoke', '@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    const emp = await createPlainEmployee(adminPage);
    await employees.switchToTableView();

    const disableConfirm = new ConfirmDialog(adminPage, new RegExp(`Disable ${emp.name}\\?`));
    await employees.openStatusChange(emp.name, 'active');
    await disableConfirm.expectVisible();
    await disableConfirm.confirm('Disable');
    await expect(adminPage.getByText('Employee disabled')).toBeVisible();
    await employees.expectStatChip(emp.name, 'disabled');

    const enableConfirm = new ConfirmDialog(adminPage, new RegExp(`Enable ${emp.name}\\?`));
    await employees.openStatusChange(emp.name, 'disabled');
    await enableConfirm.expectVisible();
    await enableConfirm.confirm('Enable');
    await expect(adminPage.getByText('Employee enabled')).toBeVisible();
    await employees.expectStatChip(emp.name, 'active');
  });

  test('EM-NG-12: an admin cannot change their own account status', { tag: ['@regression'] }, async ({ adminPage }) => {
    const admin = readPersonaUser('admin');
    test.skip(!admin, 'admin persona not configured — see e2e/.env.e2e.example.');

    const employees = new EmployeesPage(adminPage);
    await employees.goto();
    await employees.switchToTableView();
    await employees.search(admin!.name);

    const ownRow = employees.row(admin!.name);
    const rowVisible = await ownRow.isVisible().catch(() => false);
    test.skip(!rowVisible, `Admin's own row ("${admin!.name}") is not present in the directory grid (e.g. filtered out as super_admin) — self-status-change can't be exercised from this view.`);

    const statusButton = ownRow.getByRole('button', { name: /^(Enable|Disable)$/ });
    const actionVisible = await statusButton.isVisible().catch(() => false);
    if (!actionVisible) {
      // The action being hidden entirely for one's own row is itself a valid
      // way to enforce "cannot change your own status" — nothing further to click.
      return;
    }

    await statusButton.click();
    const confirm = new ConfirmDialog(adminPage, /Enable .*\?|Disable .*\?/);
    await confirm.confirm(/Enable|Disable/);
    await expect(adminPage.getByText('You cannot change your own account status')).toBeVisible();
  });

  test('EM-SC-08: no bulk action exists to disable/exit an account, including one\'s own', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    await employees.goto();
    await employees.switchToTableView();

    // Select-all via the DataGrid header checkbox, then confirm the only
    // toolbar action available for a selection is Export — no bulk
    // enable/disable/delete path exists to route around the single-row guard.
    const headerCheckbox = adminPage.getByRole('checkbox', { name: /select all/i });
    if (await headerCheckbox.isVisible().catch(() => false)) {
      await headerCheckbox.check();
      await expect(adminPage.getByRole('button', { name: /^Disable/ })).toHaveCount(0);
      await expect(adminPage.getByRole('button', { name: /^Enable/ })).toHaveCount(0);
      await expect(employees.exportButton).toBeVisible();
    }
  });

  test('EM-VD-06: an invalid status value outside active/disabled/exited is rejected with 400', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const emp = await createPlainEmployee(adminPage);
    const usersResponse = await adminPage.request.get('/api/users');
    const users = await usersResponse.json();
    const target = users.find((u: { email: string }) => u.email === emp.email);
    expect(target).toBeTruthy();

    const response = await adminPage.request.patch(`/api/users/${target.id}/status`, { data: { status: 'bogus' } });
    expect(response.status()).toBe(400);
  });
});
