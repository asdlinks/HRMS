import { expect, type Locator, type Page } from '@playwright/test';

/** Wraps client/src/pages/OrganizationStructurePage.tsx (route /organization) — the 3-tab shell. */
export class OrganizationStructurePage {
  readonly page: Page;
  readonly branchesTab: Locator;
  readonly designationsTab: Locator;
  readonly employmentTypesTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.branchesTab = page.getByRole('tab', { name: 'Branches' });
    this.designationsTab = page.getByRole('tab', { name: 'Designations' });
    this.employmentTypesTab = page.getByRole('tab', { name: 'Employment Types' });
  }

  async goto() {
    await this.page.goto('/organization');
  }

  async openBranches() {
    await this.branchesTab.click();
  }

  async openDesignations() {
    await this.designationsTab.click();
  }

  async openEmploymentTypes() {
    await this.employmentTypesTab.click();
  }

  async expectTabActionsHidden() {
    await expect(this.page.getByRole('button', { name: /^New /})).toHaveCount(0);
  }
}
