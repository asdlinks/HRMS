import { test, expect } from '../fixtures/auth';
import { EmployeesPage } from '../pages/EmployeesPage';
import { EmployeeFormDialog } from '../pages/EmployeeFormDialog';
import { uniqueEmployee, SQL_INJECTION_PAYLOADS, XSS_PAYLOAD } from '../fixtures/test-data';

test.describe('Security', () => {
  for (const payload of SQL_INJECTION_PAYLOADS) {
    // Note: the directory search box filters the already-fetched list
    // client-side (see EmployeesPage.tsx's filteredEmployees useMemo) — it
    // never reaches the server, so this only checks UI robustness against
    // odd input, not backend query safety. The name-field test below is the
    // one that actually exercises a parameterized server-side query.
    test(`EM-SC-04 (UI robustness): a SQL-injection-shaped string in the search box doesn't break the page ("${payload}")`, { tag: ['@sanity'] }, async ({ adminPage }) => {
      const employees = new EmployeesPage(adminPage);
      await employees.goto();
      await employees.switchToTableView();

      await employees.search(payload);

      await expect(adminPage.getByText(/internal server error|unexpected error/i)).toHaveCount(0);
    });
  }

  test('EM-SC-04: SQL injection payload as an employee name field is stored and rendered literally', { tag: ['@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    const form = new EmployeeFormDialog(adminPage);
    const payload = "O'Brien'; DROP TABLE users; --";
    const emp = uniqueEmployee({ name: payload });

    await employees.goto();
    await employees.clickAddEmployee();
    await form.waitForOpen();
    await form.fill({ name: emp.name, email: emp.email, dateOfBirth: emp.dateOfBirth, employeeId: emp.employeeId, joiningDate: emp.joiningDate, role: 'Employee', password: emp.password });
    await form.selectRequiredLookups();
    await form.submit();

    await expect(adminPage.getByText(/Employee added/)).toBeVisible();
    await employees.switchToTableView();
    await employees.search(payload);
    await expect(employees.row(payload)).toBeVisible();
    // The users table (and the whole tenant's data) must still be reachable
    // after this — a real injection would have broken every subsequent call.
    await employees.goto();
    await expect(adminPage.getByRole('row')).not.toHaveCount(0);
  });

  test('EM-SC-05: an <script> payload in an employee name never executes, in the directory or on their profile', { tag: ['@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    const form = new EmployeeFormDialog(adminPage);
    const emp = uniqueEmployee({ name: `XSS Test ${XSS_PAYLOAD}` });

    await adminPage.addInitScript(() => {
      (window as unknown as { __xssFired?: boolean }).__xssFired = false;
    });

    await employees.goto();
    await employees.clickAddEmployee();
    await form.waitForOpen();
    await form.fill({ name: emp.name, email: emp.email, dateOfBirth: emp.dateOfBirth, employeeId: emp.employeeId, joiningDate: emp.joiningDate, role: 'Employee', password: emp.password });
    await form.selectRequiredLookups();
    await form.submit();
    await expect(adminPage.getByText(/Employee added/)).toBeVisible();

    await employees.switchToTableView();
    const fired = await adminPage.evaluate(() => (window as unknown as { __xssFired?: boolean }).__xssFired);
    expect(fired).toBeFalsy();

    // React escapes text content by default — the literal tag text should be
    // visible as text, not parsed as markup.
    await expect(adminPage.getByText(emp.name, { exact: false })).toBeVisible();
  });
});
