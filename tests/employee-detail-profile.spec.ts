import { test, expect } from '../fixtures/auth';
import { readPersonaUser } from '../fixtures/personas';
import { EmployeesPage } from '../pages/EmployeesPage';
import { EmployeeFormDialog } from '../pages/EmployeeFormDialog';
import { EmployeeProfilePage } from '../pages/EmployeeProfilePage';
import { uniqueEmployee, uniqueAadhaar, uniquePan } from '../fixtures/test-data';

/**
 * Creates a fresh employee (optionally with PII) as admin and returns their
 * row name for lookup, plus the Aadhaar/PAN actually assigned (undefined if
 * withPii is false). Generated fresh per call rather than a shared constant —
 * two tests in this file both create a withPii=true employee in the same
 * run, and Aadhaar/PAN carry a global uniqueness constraint (EM-DB-02/03), so
 * a fixed literal collided with itself on the second call, confirmed live via
 * a 409 "already assigned to another employee".
 */
async function createEmployeeAsAdmin(adminPage: import('@playwright/test').Page, withPii: boolean) {
  const employees = new EmployeesPage(adminPage);
  const form = new EmployeeFormDialog(adminPage);
  const emp = uniqueEmployee();
  const aadhaar = withPii ? uniqueAadhaar() : undefined;
  const pan = withPii ? uniquePan() : undefined;

  await employees.goto();
  await employees.clickAddEmployee();
  await form.waitForOpen();
  await form.fill({ name: emp.name, email: emp.email, dateOfBirth: emp.dateOfBirth, employeeId: emp.employeeId, joiningDate: emp.joiningDate, role: 'Employee', password: emp.password });
  await form.selectRequiredLookups();
  if (withPii && (await form.isIdentitySectionVisible())) {
    await form.fillIdentity({ aadhaar, pan });
  }
  await form.submit();
  await expect(adminPage.getByText(/Employee added/)).toBeVisible();
  return { ...emp, aadhaar, pan };
}

async function findProfileIdByName(adminPage: import('@playwright/test').Page, name: string): Promise<string> {
  const employees = new EmployeesPage(adminPage);
  await employees.switchToTableView();
  const row = await employees.findRowForAction(name);
  await row.getByRole('button', { name: 'View Profile' }).click();
  await adminPage.waitForURL(/\/profile\/\d+/);
  return adminPage.url().split('/profile/')[1];
}

test.describe('Employee Detail / Profile', () => {
  test('EM-FN-09: viewing own profile requires no special permission', { tag: ['@smoke', '@regression'] }, async ({ employeeSelfPage }) => {
    const self = readPersonaUser('employeeSelf');
    test.skip(!self, 'employeeSelf persona not configured — see e2e/.env.e2e.example.');

    const profile = new EmployeeProfilePage(employeeSelfPage);
    await profile.goto(self!.id);

    await expect(employeeSelfPage.getByText('Employee Profile')).toBeVisible();
    await expect(profile.notFoundState).toHaveCount(0);
  });

  test('EM-FN-10 / EM-UI-14 / EM-SC-01: users.pii.manage merges unmasked Aadhaar/PAN into another employee\'s profile', { tag: ['@regression'] }, async ({ adminPage }) => {
    const emp = await createEmployeeAsAdmin(adminPage, true);
    const profile = new EmployeeProfilePage(adminPage);

    const id = await findProfileIdByName(adminPage, emp.name);
    await profile.goto(id);

    await expect(profile.aadhaarRow()).toBeVisible();
    await expect(profile.panRow()).toBeVisible();
    // EM-SC-01: displayed in full — no partial masking like "****9098" anywhere.
    await expect(adminPage.getByText(emp.aadhaar!)).toBeVisible();
    await expect(adminPage.getByText(emp.pan!)).toBeVisible();
  });

  test('EM-UI-14: banking fields are never rendered on the profile page, regardless of permission', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const emp = await createEmployeeAsAdmin(adminPage, false);
    const id = await findProfileIdByName(adminPage, emp.name);
    const profile = new EmployeeProfilePage(adminPage);
    await profile.goto(id);

    await expect(adminPage.getByText(/Bank Name|Account Number|IFSC/i)).toHaveCount(0);
  });

  test('EM-SC-07: Aadhaar/PAN are entirely absent (not blank) for a viewer without users.pii.manage', { tag: ['@regression'] }, async ({ adminPage, hrDirectoryPage }) => {
    const emp = await createEmployeeAsAdmin(adminPage, true);
    const id = await findProfileIdByName(adminPage, emp.name);

    const profileAsDirectory = new EmployeeProfilePage(hrDirectoryPage);
    await profileAsDirectory.goto(id);
    // hrDirectory holds only users.view.directory — no users.pii.manage.
    await profileAsDirectory.expectAadhaarPanHidden();
  });

  test('EM-NG-17: navigating to another employee\'s profile without any view permission and not self shows no data', { tag: ['@regression'] }, async ({ adminPage, employeeSelfPage }) => {
    const emp = await createEmployeeAsAdmin(adminPage, false);
    const id = await findProfileIdByName(adminPage, emp.name);

    const profile = new EmployeeProfilePage(employeeSelfPage);
    await profile.goto(id);
    await profile.expectNotFound();
  });
});
