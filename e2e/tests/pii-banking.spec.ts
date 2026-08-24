import { test, expect } from '../fixtures/auth';
import { readPersonaUser } from '../fixtures/personas';
import { EmployeesPage } from '../pages/EmployeesPage';
import { EmployeeFormDialog, type BankingFields } from '../pages/EmployeeFormDialog';
import { uniqueEmployee, uniqueAadhaar, uniquePan, INVALID_BANKING_SAMPLE, BANKING_LENGTH_BOUNDARY } from '../fixtures/test-data';

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

test.describe('PII & Banking', () => {
  test('EM-FN-13: Aadhaar/PAN update saves independently via its own "Save Identity Information" button', { tag: ['@smoke', '@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    const form = new EmployeeFormDialog(adminPage);
    const emp = await createPlainEmployee(adminPage);

    await employees.switchToTableView();
    await employees.openEdit(emp.name);
    await form.waitForOpen();
    test.skip(!(await form.isIdentitySectionVisible()), 'Admin persona does not hold users.pii.manage — Identity section not rendered.');

    await form.fillIdentity({ aadhaar: uniqueAadhaar(), pan: uniquePan() });
    await form.saveIdentitySection();

    await expect(form.errorText('Identity information saved')).toBeVisible();
  });

  test('EM-FN-14: banking update saves independently via its own "Save Banking Information" button', { tag: ['@smoke', '@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    const form = new EmployeeFormDialog(adminPage);
    const emp = await createPlainEmployee(adminPage);

    await employees.switchToTableView();
    await employees.openEdit(emp.name);
    await form.waitForOpen();
    test.skip(!(await form.isBankingSectionVisible()), 'Admin persona does not hold payroll.assign — Banking section not rendered.');

    await form.fillBanking({ accountHolderName: emp.name, bankName: 'Test Bank', accountNumber: '444455556666', ifsc: 'TEST0005678' });
    await form.saveBankingSection();

    await expect(form.errorText('Banking information saved')).toBeVisible();
  });

  test('EM-NG-13: assigning an Aadhaar/PAN already used by another employee is rejected with a 409-style message', { tag: ['@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    const form = new EmployeeFormDialog(adminPage);
    const sharedAadhaar = uniqueAadhaar(); // deliberately reused below — that collision is the point of this test
    const first = await createPlainEmployee(adminPage);
    await employees.switchToTableView();
    await employees.openEdit(first.name);
    await form.waitForOpen();
    test.skip(!(await form.isIdentitySectionVisible()), 'Admin persona does not hold users.pii.manage — Identity section not rendered.');
    await form.fillIdentity({ aadhaar: sharedAadhaar });
    await form.saveIdentitySection();
    await expect(form.errorText('Identity information saved')).toBeVisible();
    await form.cancel();

    const second = await createPlainEmployee(adminPage);
    await employees.openEdit(second.name);
    await form.waitForOpen();
    await form.fillIdentity({ aadhaar: sharedAadhaar });
    await form.saveIdentitySection();

    await expect(form.errorText(/already assigned to another employee/)).toBeVisible();
  });

  test('EM-VD-04: edit-mode Identity section blocks Save while Aadhaar/PAN fail their regex', { tag: ['@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    const form = new EmployeeFormDialog(adminPage);
    const emp = await createPlainEmployee(adminPage);

    await employees.switchToTableView();
    await employees.openEdit(emp.name);
    await form.waitForOpen();
    test.skip(!(await form.isIdentitySectionVisible()), 'Admin persona does not hold users.pii.manage — Identity section not rendered.');

    await form.fillIdentity({ aadhaar: '123', pan: 'invalid' });
    await expect(form.errorText('Aadhaar must be 12 digits')).toBeVisible();
    await expect(form.saveIdentityButton).toBeDisabled();
  });

  test('EM-VD-05: banking fields have no server-side format validation (confirmed gap)', { tag: ['@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    const form = new EmployeeFormDialog(adminPage);
    const emp = await createPlainEmployee(adminPage);

    await employees.switchToTableView();
    await employees.openEdit(emp.name);
    await form.waitForOpen();
    test.skip(!(await form.isBankingSectionVisible()), 'Admin persona does not hold payroll.assign — Banking section not rendered.');

    await form.fillBanking(INVALID_BANKING_SAMPLE);
    await form.saveBankingSection();

    // Documents the gap: an obviously invalid account number/IFSC/UPI is accepted as-is.
    await expect(form.errorText('Banking information saved')).toBeVisible();
  });

  test('EM-NG-07 / EM-NG-08 / EM-SC-06: users.manage alone does not unlock Identity/Banking sections', { tag: ['@regression'] }, async ({ usersManageOnlyPage }) => {
    const employees = new EmployeesPage(usersManageOnlyPage);
    const form = new EmployeeFormDialog(usersManageOnlyPage);

    await employees.goto();
    await employees.switchToTableView();
    const anyRow = usersManageOnlyPage.getByRole('row').nth(1);
    await expect(anyRow).toBeVisible();
    const name = (await anyRow.getByRole('gridcell').first().textContent()) ?? '';
    await employees.openEdit(name.trim());
    await form.waitForOpen();

    await expect(await form.isIdentitySectionVisible()).toBe(false);
    await expect(await form.isBankingSectionVisible()).toBe(false);
  });

  test('EM-NG-07 (server-side): PATCH /:id/pii is independently rejected with 403 for a caller holding only users.manage', { tag: ['@regression'] }, async ({ usersManageOnlyPage }) => {
    // The UI check above only proves the Identity section never renders for
    // this persona — it never issues the request. This confirms the server
    // itself (not just the client) enforces users.pii.manage, per
    // requirePermission() in users.routes.js.
    const self = readPersonaUser('usersManageOnly');
    const usersResponse = await usersManageOnlyPage.request.get('/api/users');
    const users = await usersResponse.json();
    const target = users.find((u: { id: number }) => u.id !== self?.id) ?? users[0];

    const response = await usersManageOnlyPage.request.patch(`/api/users/${target.id}/pii`, { data: { aadhaar_number: uniqueAadhaar() } });
    expect(response.status()).toBe(403);
  });

  test('EM-NG-08 (server-side): PATCH /:id/banking is independently rejected with 403 for a caller holding only users.manage', { tag: ['@regression'] }, async ({ usersManageOnlyPage }) => {
    const self = readPersonaUser('usersManageOnly');
    const usersResponse = await usersManageOnlyPage.request.get('/api/users');
    const users = await usersResponse.json();
    const target = users.find((u: { id: number }) => u.id !== self?.id) ?? users[0];

    const response = await usersManageOnlyPage.request.patch(`/api/users/${target.id}/banking`, { data: { bank_account_number: '111122223333' } });
    expect(response.status()).toBe(403);
  });

  test('EM-FN-11: banking fields are merged into GET /:id for a caller holding payroll.assign', { tag: ['@regression'] }, async ({ adminPage }) => {
    const emp = await createPlainEmployee(adminPage);
    const usersResponse = await adminPage.request.get('/api/users');
    const users = await usersResponse.json();
    const target = users.find((u: { email: string }) => u.email === emp.email);
    expect(target).toBeTruthy();

    const setResponse = await adminPage.request.patch(`/api/users/${target.id}/banking`, {
      data: { bank_account_holder_name: emp.name, bank_name: 'Test Bank', bank_account_number: '999988887777' },
    });
    expect(setResponse.status()).toBe(200);

    const getResponse = await adminPage.request.get(`/api/users/${target.id}`);
    const detail = await getResponse.json();
    expect(detail.bank_account_number).toBe('999988887777');
    expect(detail.bank_name).toBe('Test Bank');
  });

  test('EM-UI-16: the employee record is still created even when the chained inline PII save fails, with a partial-failure snackbar', { tag: ['@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    const form = new EmployeeFormDialog(adminPage);
    const sharedAadhaar = uniqueAadhaar();
    const first = uniqueEmployee();

    await employees.goto();
    await employees.clickAddEmployee();
    await form.waitForOpen();
    test.skip(!(await form.isIdentitySectionVisible()), 'Admin persona does not hold users.pii.manage — inline Identity not rendered.');

    await form.fill({ name: first.name, email: first.email, dateOfBirth: first.dateOfBirth, employeeId: first.employeeId, joiningDate: first.joiningDate, role: 'Employee', password: first.password });
    await form.selectRequiredLookups();
    await form.fillIdentity({ aadhaar: sharedAadhaar });
    await form.submit();
    await expect(adminPage.getByText(/Employee added/)).toBeVisible();

    const second = uniqueEmployee();
    await employees.clickAddEmployee();
    await form.waitForOpen();
    await form.fill({ name: second.name, email: second.email, dateOfBirth: second.dateOfBirth, employeeId: second.employeeId, joiningDate: second.joiningDate, role: 'Employee', password: second.password });
    await form.selectRequiredLookups();
    await form.fillIdentity({ aadhaar: sharedAadhaar }); // collides with `first`'s — the chained PATCH /pii will 409
    await form.submit();

    await expect(adminPage.getByText('Employee added, but failed to save identity information. Add it from Edit.')).toBeVisible();
    await employees.switchToTableView();
    await employees.search(second.name);
    await expect(employees.row(second.name)).toBeVisible(); // the employee record itself was still created
  });

  for (const { field, atLimit, overLimit, label } of BANKING_LENGTH_BOUNDARY) {
    test(`EM-BD-08: banking ${label} at its NVARCHAR limit is accepted; one character over is accepted-with-truncation or rejected`, { tag: ['@sanity'] }, async ({ adminPage }) => {
      const employees = new EmployeesPage(adminPage);
      const form = new EmployeeFormDialog(adminPage);
      const emp = await createPlainEmployee(adminPage);

      await employees.switchToTableView();
      await employees.openEdit(emp.name);
      await form.waitForOpen();
      test.skip(!(await form.isBankingSectionVisible()), 'Admin persona does not hold payroll.assign — Banking section not rendered.');

      await form.fillBanking({ [field]: atLimit } as BankingFields);
      await form.saveBankingSection();
      await expect(form.errorText('Banking information saved')).toBeVisible();

      await form.fillBanking({ [field]: overLimit } as BankingFields);
      await form.saveBankingSection();
      // DB may silently truncate (still reports "saved") or reject with a
      // DB-layer error — EM-BD-08 accepts either outcome, not one exact result.
      const saved = await form.errorText('Banking information saved').waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
      if (!saved) {
        await expect(form.errorText(/error|failed/i)).toBeVisible();
      }
    });
  }
});
