import { test, expect } from '../fixtures/auth';
import { OrganizationStructurePage } from '../pages/OrganizationStructurePage';
import { BranchTab } from '../pages/BranchTab';
import { LookupTab } from '../pages/LookupTab';
import { DepartmentsPage } from '../pages/DepartmentsPage';
import { EmployeesPage } from '../pages/EmployeesPage';
import { EmployeeFormDialog } from '../pages/EmployeeFormDialog';
import { Toast } from '../pages/components/Toast';
import { uniqueEmployee, uniqueSuffix, NAME_LENGTH_BOUNDARY } from '../fixtures/test-data';

test.describe('Organization Structure — Branches', () => {
  test('EM-FN-22: Branches CRUD with all fields persisted', { tag: ['@smoke', '@regression'] }, async ({ adminPage }) => {
    const org = new OrganizationStructurePage(adminPage);
    const branches = new BranchTab(adminPage);
    const name = `E2E Branch ${uniqueSuffix()}`;

    await org.goto();
    await org.openBranches();
    await branches.openAdd();
    await branches.fill({ name, code: 'E2E', address: '123 Test St', city: 'Testville', state: 'TS', country: 'Testland', active: true });
    await branches.submit();
    await expect(adminPage.getByText('Branch created')).toBeVisible();
    await expect(branches.listItem(name)).toBeVisible();

    await branches.openEdit(name);
    await branches.fill({ city: 'Updated City' });
    await branches.submit();
    await expect(adminPage.getByText('Branch updated')).toBeVisible();

    await branches.deleteItem(name);
    await adminPage.getByRole('button', { name: 'Delete' }).click();
    await expect(adminPage.getByText('Branch deleted')).toBeVisible();
    await branches.expectListItemAbsent(name);
  });

  test('EM-NG-15: deleting a Branch assigned to an employee is blocked', { tag: ['@regression'] }, async ({ adminPage }) => {
    const org = new OrganizationStructurePage(adminPage);
    const branches = new BranchTab(adminPage);
    const employees = new EmployeesPage(adminPage);
    const form = new EmployeeFormDialog(adminPage);
    const branchName = `E2E Referenced Branch ${uniqueSuffix()}`;
    const emp = uniqueEmployee();

    await org.goto();
    await org.openBranches();
    await branches.openAdd();
    await branches.fill({ name: branchName });
    await branches.submit();
    await expect(adminPage.getByText('Branch created')).toBeVisible();

    await employees.goto();
    await employees.clickAddEmployee();
    await form.waitForOpen();
    await form.fill({ name: emp.name, email: emp.email, dateOfBirth: emp.dateOfBirth, employeeId: emp.employeeId, joiningDate: emp.joiningDate, role: 'Employee', password: emp.password, branch: branchName });
    await form.selectRequiredLookups();
    await form.submit();
    await expect(adminPage.getByText(/Employee added/)).toBeVisible();

    await org.goto();
    await org.openBranches();
    await branches.deleteItem(branchName);
    await adminPage.getByRole('button', { name: 'Delete' }).click();

    // Actual backend message (locations.routes.js) — "assigned to one or more
    // employees"/"assignments must be cleared" never appear anywhere server-side.
    await new Toast(adminPage).expectVisible('Cannot delete location with assigned employees');
    await expect(branches.listItem(branchName)).toBeVisible();
  });

  test('EM-NG-14: creating a Branch with a name already used in the tenant is rejected', { tag: ['@regression'] }, async ({ adminPage }) => {
    const org = new OrganizationStructurePage(adminPage);
    const branches = new BranchTab(adminPage);
    const name = `E2E Dup Branch ${uniqueSuffix()}`;

    await org.goto();
    await org.openBranches();
    await branches.openAdd();
    await branches.fill({ name });
    await branches.submit();
    await expect(adminPage.getByText('Branch created')).toBeVisible();

    await branches.openAdd();
    await branches.fill({ name });
    await branches.submit();
    // locations.routes.js throws HttpError(400, 'Location already exists') on
    // a unique violation — "Failed to save branch" is never the actual message.
    await new Toast(adminPage).expectVisible('Location already exists');
  });

  test('EM-VD-09: creating a Branch with an empty Name is blocked client-side', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const org = new OrganizationStructurePage(adminPage);
    const branches = new BranchTab(adminPage);

    await org.goto();
    await org.openBranches();
    await branches.openAdd();
    await branches.submit();

    await expect(branches.dialog).toBeVisible(); // native `required` blocks the submit — dialog never closes
  });
});

for (const entityLabel of ['Designation', 'Employment Type'] as const) {
  test.describe(`Organization Structure — ${entityLabel}s`, () => {
    test(`EM-FN-2${entityLabel === 'Designation' ? '3' : '4'}: ${entityLabel} CRUD via the generic lookup UI`, { tag: ['@smoke', '@regression'] }, async ({ adminPage }) => {
      const org = new OrganizationStructurePage(adminPage);
      const lookup = new LookupTab(adminPage, entityLabel);
      const name = `E2E ${entityLabel} ${uniqueSuffix()}`;

      await org.goto();
      if (entityLabel === 'Designation') await org.openDesignations(); else await org.openEmploymentTypes();

      await lookup.openAdd();
      await lookup.fill({ name, code: 'E2E', description: 'Created by Playwright', active: true });
      await lookup.submit();
      await expect(adminPage.getByText(`${entityLabel} created`)).toBeVisible();
      await expect(lookup.listItem(name)).toBeVisible();

      await lookup.openEdit(name);
      await lookup.fill({ description: 'Updated by Playwright' });
      await lookup.submit();
      await expect(adminPage.getByText(`${entityLabel} updated`)).toBeVisible();

      await lookup.deleteItem(name);
      await adminPage.getByRole('button', { name: 'Delete' }).click();
      await expect(adminPage.getByText(`${entityLabel} deleted`)).toBeVisible();
      await lookup.expectListItemAbsent(name);
    });

    test(`EM-NG-14: creating a duplicate-named ${entityLabel} is rejected`, { tag: ['@regression'] }, async ({ adminPage }) => {
      const org = new OrganizationStructurePage(adminPage);
      const lookup = new LookupTab(adminPage, entityLabel);
      const name = `E2E Dup ${entityLabel} ${uniqueSuffix()}`;

      await org.goto();
      if (entityLabel === 'Designation') await org.openDesignations(); else await org.openEmploymentTypes();

      await lookup.openAdd();
      await lookup.fill({ name });
      await lookup.submit();
      await expect(adminPage.getByText(`${entityLabel} created`)).toBeVisible();

      await lookup.openAdd();
      await lookup.fill({ name });
      await lookup.submit();
      // orgLookups.routes.js throws HttpError(409, `A ${entityLabel} named "X"
      // already exists`) using its OWN (lowercase) entityLabel constant —
      // "Failed to save {entity}" is never the actual message.
      const backendEntityLabel = entityLabel.toLowerCase();
      await new Toast(adminPage).expectVisible(new RegExp(`A ${backendEntityLabel} named ".*" already exists`));
    });

    test(`EM-VD-08: creating a ${entityLabel} with an empty Name is blocked client-side`, { tag: ['@sanity'] }, async ({ adminPage }) => {
      const org = new OrganizationStructurePage(adminPage);
      const lookup = new LookupTab(adminPage, entityLabel);

      await org.goto();
      if (entityLabel === 'Designation') await org.openDesignations(); else await org.openEmploymentTypes();
      await lookup.openAdd();
      await lookup.submit();

      await expect(lookup.dialog).toBeVisible();
    });

    for (const { value, shouldPass, label } of NAME_LENGTH_BOUNDARY) {
      test(`EM-BD-07: ${entityLabel} name ${label}`, { tag: ['@sanity'] }, async ({ adminPage }) => {
        const org = new OrganizationStructurePage(adminPage);
        const lookup = new LookupTab(adminPage, entityLabel);

        await org.goto();
        if (entityLabel === 'Designation') await org.openDesignations(); else await org.openEmploymentTypes();
        await lookup.openAdd();
        await lookup.fill({ name: value });
        await lookup.submit();

        if (shouldPass) {
          await expect(adminPage.getByText(`${entityLabel} created`)).toBeVisible();
        } else {
          // CSV expects either a clean rejection or silent DB-layer truncation —
          // assert one of the two rather than a single exact outcome.
          const created = await adminPage.getByText(`${entityLabel} created`).isVisible().catch(() => false);
          if (created) {
            await org.goto();
            if (entityLabel === 'Designation') await org.openDesignations(); else await org.openEmploymentTypes();
            await expect(lookup.listItem(value)).toHaveCount(0); // truncated — the full 151-char name won't match
          } else {
            await expect(lookup.dialog).toBeVisible();
          }
        }
      });
    }
  });
}

test.describe('Organization Structure — Departments', () => {
  test('EM-FN-25 / EM-VD-10: Departments create/delete, no edit route exists in this UI', { tag: ['@regression'] }, async ({ adminPage }) => {
    const departments = new DepartmentsPage(adminPage);
    const name = `E2E Department ${uniqueSuffix()}`;

    await departments.goto();
    await departments.createDepartment(name);
    await expect(departments.listItem(name)).toBeVisible();

    // No edit affordance is exposed anywhere on this page for a department —
    // clicking a department only selects it to browse members, confirming
    // EM-NG-19's "no PATCH route" is matched by "no edit UI" either.
    await departments.listItem(name).click();
    await expect(adminPage.getByRole('dialog')).toHaveCount(0);

    await departments.deleteDepartment(name);
    await adminPage.getByRole('button', { name: 'Delete' }).click();
    await expect(adminPage.getByText('Department deleted')).toBeVisible();
    await departments.expectListItemAbsent(name);
  });

  test('EM-NG-15: deleting a Department assigned to an employee is blocked', { tag: ['@regression'] }, async ({ adminPage }) => {
    const departments = new DepartmentsPage(adminPage);
    const employees = new EmployeesPage(adminPage);
    const form = new EmployeeFormDialog(adminPage);
    const deptName = `E2E Referenced Dept ${uniqueSuffix()}`;
    const emp = uniqueEmployee();

    await departments.goto();
    await departments.createDepartment(deptName);
    await expect(departments.listItem(deptName)).toBeVisible();

    await employees.goto();
    await employees.clickAddEmployee();
    await form.waitForOpen();
    await form.fill({ name: emp.name, email: emp.email, dateOfBirth: emp.dateOfBirth, employeeId: emp.employeeId, joiningDate: emp.joiningDate, role: 'Employee', password: emp.password, department: deptName });
    await form.selectFirstRealOption('Designation');
    await form.submit();
    await expect(adminPage.getByText(/Employee added/)).toBeVisible();

    await departments.goto();
    await departments.deleteDepartment(deptName);
    await adminPage.getByRole('button', { name: 'Delete' }).click();

    // departments.routes.js throws HttpError(400, 'Cannot delete department
    // with assigned employees') — "Failed to delete department" is never sent.
    await new Toast(adminPage).expectVisible('Cannot delete department with assigned employees');
    await expect(departments.listItem(deptName)).toBeVisible();
  });

  test('EM-NG-14: creating a Department with a name already used in the tenant is rejected', { tag: ['@regression'] }, async ({ adminPage }) => {
    const departments = new DepartmentsPage(adminPage);
    const name = `E2E Dup Department ${uniqueSuffix()}`;

    await departments.goto();
    await departments.createDepartment(name);
    await expect(departments.listItem(name)).toBeVisible();

    await departments.createDepartment(name);
    await new Toast(adminPage).expectVisible('Department already exists');
  });

  test('EM-AP-14: PATCH /api/departments/:id has no route (404), confirming no edit endpoint exists', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const response = await adminPage.request.patch('/api/departments/1');
    expect(response.status()).toBe(404);
  });
});

test.describe('Organization Structure — permission gating', () => {
  test('EM-UI-15: each tab\'s New/Edit actions are gated independently; GET/view is always available', { tag: ['@sanity'] }, async ({ hrDirectoryPage }) => {
    const org = new OrganizationStructurePage(hrDirectoryPage);
    await org.goto();

    await expect(org.branchesTab).toBeVisible();
    await expect(org.designationsTab).toBeVisible();
    await expect(org.employmentTypesTab).toBeVisible();
    // hrDirectory holds no locations.manage/designations.manage/employment-types.manage.
    await org.expectTabActionsHidden();

    await org.openDesignations();
    await org.expectTabActionsHidden();
    await org.openEmploymentTypes();
    await org.expectTabActionsHidden();
  });

  test('EM-PM-10: departments.manage gates the entire Departments page, not just create/delete', { tag: ['@sanity'] }, async ({ hrDirectoryPage }) => {
    // Unlike Branches/Designations/Employment Types (view open to all, .manage
    // gates only mutation), /department is wrapped in a route-level
    // ProtectedRoute requiring departments.manage — hrDirectory (view.directory
    // only) never sees the page at all and is redirected to /dashboard.
    const departments = new DepartmentsPage(hrDirectoryPage);
    await departments.goto();

    await expect(hrDirectoryPage).toHaveURL(/\/dashboard$/);
  });
});

test.describe('Organization Structure — raw API contract checks', () => {
  test('EM-NG-16: PATCH/DELETE on a nonexistent Designation/Employment Type/Branch id returns 404', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const nonexistentId = 999999999;
    for (const basePath of ['/api/designations', '/api/employment-types', '/api/locations']) {
      const patchResponse = await adminPage.request.patch(`${basePath}/${nonexistentId}`, { data: { name: 'Does not exist' } });
      expect(patchResponse.status()).toBe(404);

      const deleteResponse = await adminPage.request.delete(`${basePath}/${nonexistentId}`);
      expect(deleteResponse.status()).toBe(404);
    }
  });

  test('EM-NG-20: the removed Cost Centers / Employee Categories endpoints are no longer mounted', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const costCentersResponse = await adminPage.request.get('/api/cost-centers');
    expect(costCentersResponse.status()).toBe(404);

    const employeeCategoriesResponse = await adminPage.request.get('/api/employee-categories');
    expect(employeeCategoriesResponse.status()).toBe(404);
  });
});
