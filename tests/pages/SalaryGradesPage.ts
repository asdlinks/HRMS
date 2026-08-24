import { expect, type Locator, type Page } from '@playwright/test';
import { itemByName, selectByLabelText } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';

export interface GradeFormFields {
  code?: string;
  name?: string;
  description?: string;
  minAmount?: string;
  midAmount?: string;
  maxAmount?: string;
  defaultStructureName?: string;
  isActive?: boolean;
}

/** Wraps client/src/pages/SalaryGradesPage.tsx — a plain (non react-hook-form) MUI List + Dialog. */
export class SalaryGradesPage {
  readonly page: Page;
  readonly newGradeButton: Locator;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newGradeButton = page.getByRole('button', { name: 'New Grade' });
    this.dialog = page.getByRole('dialog').filter({ hasText: /New Salary Grade|Edit Salary Grade/ });
  }

  async goto() {
    await this.page.goto('/payroll/grades');
    assertSessionActive(this.page);
  }

  /** `${code} — ${name}` is the list item's full visible primary text. */
  listItem(codeAndName: string): Locator {
    return itemByName(this.page, codeAndName);
  }

  async openAdd() {
    await this.newGradeButton.click();
  }

  async openEdit(codeAndName: string) {
    await this.listItem(codeAndName).click();
  }

  async openDelete(codeAndName: string) {
    await this.listItem(codeAndName).getByRole('button').click();
  }

  async fill(fields: GradeFormFields) {
    if (fields.code !== undefined) await this.dialog.getByLabel('Code').fill(fields.code);
    if (fields.name !== undefined) await this.dialog.getByLabel('Name').fill(fields.name);
    if (fields.description !== undefined) await this.dialog.getByLabel('Description').fill(fields.description);
    if (fields.minAmount !== undefined) await this.dialog.getByLabel('Min').fill(fields.minAmount);
    if (fields.midAmount !== undefined) await this.dialog.getByLabel('Mid').fill(fields.midAmount);
    if (fields.maxAmount !== undefined) await this.dialog.getByLabel('Max').fill(fields.maxAmount);
    if (fields.defaultStructureName !== undefined) {
      await selectByLabelText(this.dialog, 'Default Structure').click();
      await this.page.getByRole('option', { name: fields.defaultStructureName, exact: true }).click();
    }
    if (fields.isActive !== undefined) await this.dialog.getByLabel('Active').setChecked(fields.isActive);
  }

  /** Mirrors PR-UI-01's confirmed submit-enable gate: `disabled={!form.code || !form.name}` — no min<=max check. */
  get submitButton(): Locator {
    return this.dialog.getByRole('button', { name: /^(Create Grade|Save Changes)$/ });
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

  async expectRowAbsent(codeAndName: string) {
    await expect(this.listItem(codeAndName)).toHaveCount(0);
  }
}
