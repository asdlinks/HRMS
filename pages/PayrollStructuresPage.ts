import { expect, type Locator, type Page } from '@playwright/test';
import { itemByName, selectByLabelText } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';

export interface StructureFormFields {
  name?: string;
  description?: string;
  gradeName?: string;
}

/**
 * Wraps client/src/pages/PayrollStructuresPage.tsx's master/detail layout +
 * components/payroll/PayrollStructureFormDialog.tsx.
 */
export class PayrollStructuresPage {
  readonly page: Page;
  readonly newStructureButton: Locator;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newStructureButton = page.getByRole('button', { name: 'New Structure' });
    this.dialog = page.getByRole('dialog').filter({ hasText: /New Salary Structure|Edit Salary Structure/ });
  }

  /**
   * PayrollStructuresPage.tsx auto-selects `structures[0]` on load and fires
   * its own `fetchDetail()` for it. `fetchDetail()` unconditionally
   * overwrites the shared `attached` state with whatever response lands
   * last — it never checks the response still matches the currently
   * selected structure. If a caller immediately selects a different
   * structure (as every test here does), that auto-select's fetchDetail can
   * resolve *after* the caller's own selection's fetchDetail, silently
   * clobbering the intended structure's component state with an unrelated
   * one's (confirmed live — this is a real app-level race, not a
   * test-timing issue, but out of scope to fix from this framework-only
   * pass). Waiting here for the auto-selected structure's own load to
   * finish, before any caller acts, keeps the two fetches from ever
   * overlapping.
   */
  async goto() {
    await this.page.goto('/payroll/structures');
    assertSessionActive(this.page);
    const hasAnyStructure = await this.saveComponentsButton.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    if (hasAnyStructure) await expect(this.saveComponentsButton).toBeEnabled();
  }

  listItem(name: string): Locator {
    return itemByName(this.page, name);
  }

  async selectStructure(name: string) {
    await this.listItem(name).click();
    await expect(this.saveComponentsButton).toBeEnabled();
  }

  /** See EmployeesPage.clickAddEmployee()'s doc comment — same shared-tenant dataset-growth pattern, same local timeout override. */
  async openAdd() {
    await this.newStructureButton.click({ timeout: 30_000 });
  }

  /** The selected structure's own "Edit name" chip — opens the rename dialog for whichever structure is currently selected. */
  async openEditSelected() {
    await this.page.getByRole('button', { name: 'Edit name' }).click();
  }

  async openDelete(name: string) {
    await this.listItem(name).getByRole('button').click();
  }

  async fill(fields: StructureFormFields) {
    if (fields.name !== undefined) await this.dialog.getByLabel('Structure Name').fill(fields.name);
    if (fields.description !== undefined) await this.dialog.getByLabel('Description').fill(fields.description);
    if (fields.gradeName !== undefined) {
      await selectByLabelText(this.dialog, 'Salary Grade (optional)').click();
      await this.page.getByRole('option', { name: fields.gradeName, exact: true }).click();
    }
  }

  get submitButton(): Locator {
    return this.dialog.getByRole('button', { name: /^(Create Structure|Save Changes|Saving…)$/ });
  }

  async submit() {
    await this.submitButton.click();
  }

  async cancel() {
    await this.dialog.getByRole('button', { name: 'Cancel' }).click();
  }

  errorText(message: string | RegExp): Locator {
    return this.dialog.getByText(message);
  }

  /**
   * A component checklist row, targeted via the exact structural relationship
   * confirmed by reading PayrollStructuresPage.tsx's renderComponentRow:
   * the component name <Typography> is a direct child of a <Box>, which is a
   * direct child of the row's own <Stack> (`ancestor::*[2]`) — same
   * documented-XPath-fallback convention as LeaveSettingsPanel.ts's
   * `ancestor::*[3]`, used here because neither the Stack nor the Box carries
   * any accessible role or name of its own.
   */
  componentRow(componentName: string): Locator {
    return this.page.getByText(componentName, { exact: true }).locator('xpath=ancestor::*[2]');
  }

  async toggleComponent(componentName: string) {
    await this.componentRow(componentName).getByRole('checkbox').click();
  }

  async isComponentChecked(componentName: string): Promise<boolean> {
    return this.componentRow(componentName).getByRole('checkbox').isChecked();
  }

  async setOverride(componentName: string, value: string) {
    await this.componentRow(componentName).getByLabel('Override').fill(value);
  }

  get saveComponentsButton(): Locator {
    return this.page.getByRole('button', { name: /^(Save Components|Saving…)$/ });
  }

  async saveComponents() {
    await this.saveComponentsButton.click();
  }

  attachedCountText(): Locator {
    return this.page.getByText(/\d+ components attached/);
  }

  async expectRowAbsent(name: string) {
    await expect(this.listItem(name)).toHaveCount(0);
  }
}
