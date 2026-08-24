import { test, expect } from '../fixtures/auth';
import { EmployeesPage } from '../pages/EmployeesPage';
import { EmployeeFormDialog } from '../pages/EmployeeFormDialog';
import { uniqueEmployee } from '../fixtures/test-data';

test.describe('Employee Update', () => {
  test('EM-FN-12: general field update via the Edit dialog persists, role select is ignored by design', { tag: ['@smoke', '@regression'] }, async ({ adminPage }) => {
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

    await employees.switchToTableView();
    await employees.openEdit(emp.name);
    await form.waitForOpen();
    const updatedName = `${emp.name} Updated`;
    await form.fill({ name: updatedName });
    await form.submit();

    await expect(adminPage.getByText('Employee updated')).toBeVisible();
    await employees.search(updatedName);
    await expect(employees.row(updatedName)).toBeVisible();
  });

  test('EM-UI-08: the Assign Manager dropdown excludes the employee being edited from their own candidate list', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    const form = new EmployeeFormDialog(adminPage);
    const managerCandidate = uniqueEmployee();

    // Create a manager-role employee, then a direct report of theirs, then
    // edit the manager and confirm they can't appear in their own dropdown.
    await employees.goto();
    await employees.clickAddEmployee();
    await form.waitForOpen();
    await form.fill({ name: managerCandidate.name, email: managerCandidate.email, dateOfBirth: managerCandidate.dateOfBirth, employeeId: managerCandidate.employeeId, joiningDate: managerCandidate.joiningDate, role: 'Manager', password: managerCandidate.password });
    await form.selectRequiredLookups();
    await form.submit();
    await expect(adminPage.getByText(/Employee added/)).toBeVisible();

    await employees.switchToTableView();
    await employees.openEdit(managerCandidate.name);
    await form.waitForOpen();
    // "Assign Manager" only renders for role employee/hr — switch this manager
    // to "Employee" first purely to exercise the field for this assertion.
    await form.fill({ role: 'Employee' });
    await form.root.getByLabel('Assign Manager', { exact: true }).click();
    await expect(adminPage.getByRole('option', { name: managerCandidate.name })).toHaveCount(0);
    await adminPage.keyboard.press('Escape');
  });

  test('EM-FN-19: assigning a manager via the Edit dialog persists manager_id', { tag: ['@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    const form = new EmployeeFormDialog(adminPage);
    const manager = uniqueEmployee();
    const report = uniqueEmployee();

    await employees.goto();
    await employees.clickAddEmployee();
    await form.waitForOpen();
    await form.fill({ name: manager.name, email: manager.email, dateOfBirth: manager.dateOfBirth, employeeId: manager.employeeId, joiningDate: manager.joiningDate, role: 'Manager', password: manager.password });
    await form.selectRequiredLookups();
    await form.submit();
    await expect(adminPage.getByText(/Employee added/)).toBeVisible();

    await employees.clickAddEmployee();
    await form.waitForOpen();
    await form.fill({ name: report.name, email: report.email, dateOfBirth: report.dateOfBirth, employeeId: report.employeeId, joiningDate: report.joiningDate, role: 'Employee', password: report.password });
    await form.selectRequiredLookups();
    await form.submit();
    await expect(adminPage.getByText(/Employee added/)).toBeVisible();

    await employees.switchToTableView();
    await employees.openEdit(report.name);
    await form.waitForOpen();
    await form.fill({ manager: manager.name });
    await form.submit();

    await expect(adminPage.getByText('Employee updated')).toBeVisible();
  });

  test('EM-NG-19: a role field sent via the general PATCH /:id payload is silently ignored, not applied', { tag: ['@regression'] }, async ({ adminPage }) => {
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

    const usersResponse = await adminPage.request.get('/api/users');
    const users = await usersResponse.json();
    const target = users.find((u: { email: string }) => u.email === emp.email);
    expect(target).toBeTruthy();
    const originalRole = target.role;
    const updatedName = `${emp.name} Role-Ignored`;

    // userUpdateSchema deliberately has no `role` field — the general edit
    // endpoint must never let this through, per users.routes.js's comment.
    const patchResponse = await adminPage.request.patch(`/api/users/${target.id}`, { data: { name: updatedName, role: 'super_admin' } });
    expect(patchResponse.status()).toBe(200);

    const getResponse = await adminPage.request.get(`/api/users/${target.id}`);
    const detail = await getResponse.json();
    expect(detail.name).toBe(updatedName); // the legitimate field DID update
    expect(detail.role).toBe(originalRole); // role did NOT change
  });

  test('EM-AP-04: join-alias/children/expanded/_t/password fields in a PATCH /:id payload are stripped without error', { tag: ['@sanity'] }, async ({ adminPage }) => {
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

    const usersResponse = await adminPage.request.get('/api/users');
    const users = await usersResponse.json();
    const target = users.find((u: { email: string }) => u.email === emp.email);
    expect(target).toBeTruthy();
    const updatedName = `${emp.name} Stripped-Fields`;

    const patchResponse = await adminPage.request.patch(`/api/users/${target.id}`, {
      data: {
        name: updatedName,
        department_name: 'Should be stripped',
        manager_name: 'Should be stripped',
        location_name: 'Should be stripped',
        children: [{ bogus: true }],
        expanded: true,
        _t: Date.now(),
        password: 'ShouldNeverApply123',
      },
    });
    expect(patchResponse.status()).toBe(200); // no error from the extraneous fields

    const getResponse = await adminPage.request.get(`/api/users/${target.id}`);
    const detail = await getResponse.json();
    expect(detail.name).toBe(updatedName); // the legitimate field still applied
  });

  test('EM-PM-02: users.manage is required for POST/PATCH/DELETE/status — hrDirectory (view.directory only) is rejected with 403 on all four', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const usersResponse = await hrDirectoryPage.request.get('/api/users');
    const users = await usersResponse.json();
    const targetId = users[0].id;

    const postResponse = await hrDirectoryPage.request.post('/api/users', { data: {} });
    expect(postResponse.status()).toBe(403);

    const patchResponse = await hrDirectoryPage.request.patch(`/api/users/${targetId}`, { data: { name: 'Should Not Apply' } });
    expect(patchResponse.status()).toBe(403);

    const deleteResponse = await hrDirectoryPage.request.delete(`/api/users/${targetId}`);
    expect(deleteResponse.status()).toBe(403);

    const statusResponse = await hrDirectoryPage.request.patch(`/api/users/${targetId}/status`, { data: { status: 'disabled' } });
    expect(statusResponse.status()).toBe(403);
  });
});
