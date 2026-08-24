import { test, expect } from '../fixtures/auth';
import { EmployeesPage } from '../pages/EmployeesPage';
import { EmployeeFormDialog } from '../pages/EmployeeFormDialog';
import { ConfirmDialog } from '../pages/components/ConfirmDialog';
import { uniqueEmployee } from '../fixtures/test-data';

test.describe('Employee Deletion', () => {
  test('EM-FN-20 / EM-UI-09: deleting an employee warns about permanence, then removes them from the directory', { tag: ['@smoke', '@regression'] }, async ({ adminPage }) => {
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
    const confirm = new ConfirmDialog(adminPage, 'Permanently delete this employee?');
    await employees.openDelete(emp.name);
    await confirm.expectVisible();
    await expect(confirm.root).toContainText(/leave\/attendance history/i);
    await expect(confirm.root).toContainText(/Consider Disable instead/i);
    await confirm.confirm('Delete Permanently');

    await expect(adminPage.getByText('Employee deleted')).toBeVisible();
    await employees.expectRowAbsent(emp.name);
  });
});
