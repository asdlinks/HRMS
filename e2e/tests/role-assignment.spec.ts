import { test, expect } from '../fixtures/auth';
import { readPersonaUser } from '../fixtures/personas';
import { EmployeesPage } from '../pages/EmployeesPage';
import { EmployeeFormDialog } from '../pages/EmployeeFormDialog';
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

test.describe('Role Assignment (RBAC)', () => {
  test('EM-FN-18: replacing an employee\'s roles via Manage Roles updates the Roles column', { tag: ['@smoke', '@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    const emp = await createPlainEmployee(adminPage);
    await employees.switchToTableView();

    await employees.openManageRoles(emp.name);
    await expect(employees.manageRolesDialog).toBeVisible();

    const roleCheckboxes = employees.manageRolesDialog.getByRole('checkbox');
    const roleCount = await roleCheckboxes.count();
    test.skip(roleCount < 2, 'Tenant has fewer than 2 roles defined — cannot exercise a multi-role assignment.');

    await roleCheckboxes.nth(0).check();
    await roleCheckboxes.nth(1).check();
    await employees.saveRoles();

    await expect(adminPage.getByText('Roles updated')).toBeVisible();
    await expect(employees.row(emp.name).getByText('No role assigned')).toHaveCount(0);
  });

  test('EM-UI-12: Manage Roles is only visible/loadable with roles.manage', { tag: ['@sanity'] }, async ({ usersManageOnlyPage }) => {
    const employees = new EmployeesPage(usersManageOnlyPage);
    await employees.goto();
    await employees.switchToTableView();
    const anyRow = usersManageOnlyPage.getByRole('row').nth(1);
    await expect(anyRow).toBeVisible();

    await expect(anyRow.getByRole('button', { name: 'Manage Roles' })).toHaveCount(0);
  });

  test('EM-NG-11: PUT /:id/roles is blocked without roles.manage — no Manage Roles action to trigger it from', { tag: ['@regression'] }, async ({ usersManageOnlyPage }) => {
    // Same observable behavior as EM-UI-12 from the UI's perspective: the
    // action is absent, so the request is never issued in the first place.
    const employees = new EmployeesPage(usersManageOnlyPage);
    await employees.goto();
    await employees.switchToTableView();
    await expect(usersManageOnlyPage.getByRole('button', { name: 'Manage Roles' })).toHaveCount(0);
  });

  test('EM-NG-11 / EM-SC-06 (server-side): PUT /:id/roles is independently rejected with 403 for a caller holding only users.manage', { tag: ['@regression'] }, async ({ usersManageOnlyPage }) => {
    // Closes out EM-SC-06's "all five [pii/banking/reset-password/unlock/roles]
    // blocked with 403" claim server-side — the other four are verified the
    // same way in pii-banking.spec.ts (EM-NG-07/08) and
    // password-reset-unlock.spec.ts (EM-NG-09/10); not re-tested here to avoid
    // duplicating those requests.
    const self = readPersonaUser('usersManageOnly');
    const usersResponse = await usersManageOnlyPage.request.get('/api/users');
    const users = await usersResponse.json();
    const target = users.find((u: { id: number }) => u.id !== self?.id) ?? users[0];

    const response = await usersManageOnlyPage.request.put(`/api/users/${target.id}/roles`, { data: { roleIds: [] } });
    expect(response.status()).toBe(403);
  });

  test('EM-VD-11: PUT /:id/roles with missing or non-array roleIds is rejected with 400', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const emp = await createPlainEmployee(adminPage);
    const usersResponse = await adminPage.request.get('/api/users');
    const users = await usersResponse.json();
    const target = users.find((u: { email: string }) => u.email === emp.email);
    expect(target).toBeTruthy();

    const missingResponse = await adminPage.request.put(`/api/users/${target.id}/roles`, { data: {} });
    expect(missingResponse.status()).toBe(400);

    const nonArrayResponse = await adminPage.request.put(`/api/users/${target.id}/roles`, { data: { roleIds: 'not-an-array' } });
    expect(nonArrayResponse.status()).toBe(400);
  });

  test('EM-PM-11: the removed cost-centers.manage/employee-categories.manage permissions are no longer grantable via role management', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const response = await adminPage.request.get('/api/roles/permissions');
    expect(response.status()).toBe(200);
    const permissions: Array<{ code: string }> = await response.json();
    const codes = permissions.map((p) => p.code);

    expect(codes).not.toContain('cost-centers.manage');
    expect(codes).not.toContain('employee-categories.manage');
  });
});
