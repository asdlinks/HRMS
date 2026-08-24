import { expect, type Locator, type Page } from '@playwright/test';
import { itemByName, soleButtonIn } from '../helpers/locators';

/** Wraps client/src/pages/DepartmentsPage.tsx (route /department). */
export class DepartmentsPage {
  readonly page: Page;
  readonly newDepartmentButton: Locator;
  readonly dialog: Locator;
  readonly departmentNameInput: Locator;
  readonly createButton: Locator;
  readonly deptSearchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newDepartmentButton = page.getByRole('button', { name: 'New Department' });
    this.dialog = page.getByRole('dialog').filter({ hasText: 'Create New Department' });
    this.departmentNameInput = this.dialog.getByLabel('Department Name');
    this.createButton = this.dialog.getByRole('button', { name: 'Create Team' });
    this.deptSearchInput = page.getByPlaceholder('Search departments…');
  }

  async goto() {
    await this.page.goto('/department');
  }

  listItem(name: string): Locator {
    return itemByName(this.page, name);
  }

  async createDepartment(name: string) {
    await this.newDepartmentButton.click();
    await this.departmentNameInput.fill(name);
    await this.createButton.click();
  }

  async deleteDepartment(name: string) {
    await soleButtonIn(this.listItem(name)).click();
  }

  async expectListItemAbsent(name: string) {
    await expect(this.listItem(name)).toHaveCount(0);
  }
}
