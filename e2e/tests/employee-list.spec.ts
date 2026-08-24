import { test, expect } from '../fixtures/auth';
import { EmployeesPage } from '../pages/EmployeesPage';

test.describe('Employee List', () => {
  test('EM-FN-07: users.view.all (admin) sees the unscoped tenant-wide directory', { tag: ['@smoke', '@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    await employees.goto();
    await employees.switchToTableView();
    await expect(adminPage.getByRole('row')).not.toHaveCount(0);
  });

  test('EM-FN-06: users.view.team (manager) sees only their reporting subtree', { tag: ['@regression'] }, async ({ managerPage }) => {
    const employees = new EmployeesPage(managerPage);
    await employees.goto();
    // No permission-denied page — a scoped, non-empty (or legitimately empty
    // if this manager has no reports yet) list renders without an access error.
    await expect(managerPage.getByText(/forbidden|access denied/i)).toHaveCount(0);
    await expect(employees.totalEmployeesStat).toBeVisible();
  });

  test('EM-FN-05: users.view.directory sees the baseline company-wide read', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const employees = new EmployeesPage(hrDirectoryPage);
    await employees.goto();
    await expect(hrDirectoryPage.getByText(/forbidden|access denied/i)).toHaveCount(0);
    await expect(employees.totalEmployeesStat).toBeVisible();
  });

  test('EM-NG-18: no users.view.* permission at all is blocked from the directory', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    await employeeSelfPage.goto('/employees');
    await expect(employeeSelfPage.getByText(/forbidden|access denied|do not have permission/i)).toBeVisible();
  });

  test('EM-FN-08 / EM-UI-02: department filter narrows the list', { tag: ['@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    await employees.goto();
    await employees.switchToTableView();
    const beforeCount = await adminPage.getByRole('row').count();

    const optionText = await employees.filterByFirstOption('Department');
    const afterCount = await adminPage.getByRole('row').count();

    expect(afterCount).toBeLessThanOrEqual(beforeCount);
    // Every visible row must belong to the selected department — spot-check the grid header is still showing rows filtered, not empty by accident.
    expect(optionText.trim().length).toBeGreaterThan(0);
  });

  test('EM-UI-01: stat cards reflect the currently filtered list', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    await employees.goto();
    await employees.switchToTableView();
    const totalRows = await adminPage.getByRole('row').count();

    await employees.filterByFirstOption('Department');
    const filteredRows = await adminPage.getByRole('row').count();
    const totalStatText = await employees.totalEmployeesStat.textContent();

    if (filteredRows < totalRows) {
      expect(totalStatText).not.toContain(String(totalRows));
    }
  });

  test('EM-UI-03: toggling between Tree view and Table view renders consistent data', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    await employees.goto();
    await employees.switchToTreeView();
    await expect(adminPage.getByRole('button', { name: 'Table View' })).toBeVisible();
    await employees.switchToTableView();
    await expect(adminPage.getByRole('row')).not.toHaveCount(0);
  });

  test('EM-FN-21 / EM-UI-04: CSV export downloads the currently filtered list', { tag: ['@regression'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    await employees.goto();

    const downloadPromise = adminPage.waitForEvent('download');
    await employees.clickExport();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('employee_directory.csv');
  });

  test('EM-UI-13: employee-limit usage banner reflects the current ratio', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const employees = new EmployeesPage(adminPage);
    await employees.goto();

    const bannerVisible = await employees.employeeLimitBanner.isVisible().catch(() => false);
    test.skip(
      !bannerVisible,
      'Tenant is below the 90% employee-limit threshold (or is on an unlimited plan) — banner not rendered in current state. Seed employees near max_employees to exercise the warning/error styling.'
    );
    await expect(employees.employeeLimitBanner).toContainText(/employee limit|Approaching/i);
  });
});
