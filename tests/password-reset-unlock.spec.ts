import { test, expect } from '../fixtures/auth';
import { LOCKED_ACCOUNT_NAME, readPersonaUser } from '../fixtures/personas';
import { EmployeesPage } from '../pages/EmployeesPage';
import { EmployeeFormDialog } from '../pages/EmployeeFormDialog';
import { uniqueEmployee, PASSWORD_BOUNDARY } from '../fixtures/test-data';

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

test.describe('Password Reset & Unlock', () => {
  test('EM-FN-16: admin resets another employee\'s password', { tag: ['@smoke', '@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    const emp = await createPlainEmployee(adminPage);
    await employees.switchToTableView();

    await employees.openResetPassword(emp.name);
    await expect(employees.resetPasswordDialog).toBeVisible();
    await employees.submitResetPassword('NewValidPass123');

    await expect(adminPage.getByText('Password reset successfully')).toBeVisible();
  });

  for (const { value, shouldPass, label } of PASSWORD_BOUNDARY) {
    test(`EM-VD-07 / EM-BD-04: reset-password ${label} is ${shouldPass ? 'accepted' : 'blocked by the required field'}`, { tag: ['@sanity'] }, async ({ adminPage }) => {
      const employees = new EmployeesPage(adminPage);
      const emp = await createPlainEmployee(adminPage);
      await employees.switchToTableView();

      await employees.openResetPassword(emp.name);
      await expect(employees.resetPasswordDialog).toBeVisible();
      await employees.resetPasswordDialog.getByLabel('New Password').fill(value);
      await employees.resetPasswordDialog.getByRole('button', { name: 'Reset Password' }).click();

      if (shouldPass) {
        await expect(adminPage.getByText('Password reset successfully')).toBeVisible();
      } else {
        // resetPasswordSchema is z.object({ password: z.string().min(6)}) with
        // no custom message — validate.js surfaces zod's default wording.
        await expect(adminPage.getByText(/at least 6 character/i)).toBeVisible();
      }
    });
  }

  test('EM-FN-17: unlocking a locked employee resets their lock state', { tag: ['@regression'] }, async ({ adminPage }) => {
    test.skip(!LOCKED_ACCOUNT_NAME, 'E2E_LOCKED_ACCOUNT_NAME not configured — see e2e/.env.e2e.example.');

    const employees = new EmployeesPage(adminPage);
    await employees.goto();
    await employees.switchToTableView();
    const row = await employees.findRowForAction(LOCKED_ACCOUNT_NAME!);

    const unlockButton = row.getByRole('button', { name: 'Unlock Account' });
    await expect(unlockButton).toBeVisible();
    await unlockButton.click();

    await expect(adminPage.getByText(`${LOCKED_ACCOUNT_NAME}'s account unlocked`)).toBeVisible();
    await employees.scrollActionsIntoView();
    await expect(employees.rowAction(LOCKED_ACCOUNT_NAME!, 'Unlock Account')).toHaveCount(0);
  });

  test('EM-NG-09: users.password.reset is required — a caller without it never sees the Reset Password action', { tag: ['@regression'] }, async ({ usersManageOnlyPage }) => {
    const employees = new EmployeesPage(usersManageOnlyPage);
    await employees.goto();
    await employees.switchToTableView();
    const anyRow = usersManageOnlyPage.getByRole('row').nth(1);
    await expect(anyRow).toBeVisible();
    await employees.scrollActionsIntoView();

    await expect(anyRow.getByRole('button', { name: 'Reset Password' })).toHaveCount(0);
  });

  test('EM-NG-10: users.unlock is required — a caller without it never sees the Unlock action', { tag: ['@regression'] }, async ({ usersManageOnlyPage }) => {
    test.skip(!LOCKED_ACCOUNT_NAME, 'E2E_LOCKED_ACCOUNT_NAME not configured — see e2e/.env.e2e.example.');
    const employees = new EmployeesPage(usersManageOnlyPage);
    await employees.goto();
    await employees.switchToTableView();
    const row = await employees.findRowForAction(LOCKED_ACCOUNT_NAME!);

    await expect(row.getByRole('button', { name: 'Unlock Account' })).toHaveCount(0);
  });

  test('EM-NG-09 (server-side): PATCH /:id/reset-password is independently rejected with 403 for a caller holding only users.manage', { tag: ['@regression'] }, async ({ usersManageOnlyPage }) => {
    // The UI check above only proves the action is never rendered — it never
    // issues the request. This confirms the server itself (not just the
    // client) enforces users.password.reset, per requirePermission() in
    // users.routes.js.
    const self = readPersonaUser('usersManageOnly');
    const usersResponse = await usersManageOnlyPage.request.get('/api/users');
    const users = await usersResponse.json();
    const target = users.find((u: { id: number }) => u.id !== self?.id) ?? users[0];

    const response = await usersManageOnlyPage.request.patch(`/api/users/${target.id}/reset-password`, { data: { password: 'AnotherValidPass123' } });
    expect(response.status()).toBe(403);
  });

  test('EM-NG-10 (server-side): PATCH /:id/unlock is independently rejected with 403 for a caller holding only users.manage', { tag: ['@regression'] }, async ({ usersManageOnlyPage }) => {
    const self = readPersonaUser('usersManageOnly');
    const usersResponse = await usersManageOnlyPage.request.get('/api/users');
    const users = await usersResponse.json();
    const target = users.find((u: { id: number }) => u.id !== self?.id) ?? users[0];

    const response = await usersManageOnlyPage.request.patch(`/api/users/${target.id}/unlock`);
    expect(response.status()).toBe(403);
  });
});
