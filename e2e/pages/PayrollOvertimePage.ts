import { type Locator, type Page } from '@playwright/test';
import { rowByCellText, selectByLabelText, selectMaxDataGridPageSize } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';

export interface OvertimeFormFields {
  employeeName?: string;
  workDate?: string;
  hours?: string;
  reason?: string;
}

/** Wraps client/src/pages/PayrollOvertimePage.tsx + components/payroll/OvertimeEntryFormDialog.tsx. */
export class PayrollOvertimePage {
  readonly page: Page;
  readonly submitOvertimeButton: Locator;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.submitOvertimeButton = page.getByRole('button', { name: 'Submit Overtime' });
    this.dialog = page.getByRole('dialog').filter({ hasText: 'Submit Overtime' });
  }

  async goto() {
    await this.page.goto('/payroll/overtime');
    assertSessionActive(this.page);
    await selectMaxDataGridPageSize(this.page);
  }

  /** Rows are not uniquely keyed by employee name alone (an employee can have several entries) — scope further with `.filter({ hasText: workDate })` when needed. */
  rowsFor(employeeName: string): Locator {
    return rowByCellText(this.page, employeeName, { exact: true });
  }

  async openAdd() {
    await this.submitOvertimeButton.click();
  }

  async fill(fields: OvertimeFormFields) {
    if (fields.employeeName !== undefined) {
      // required FormControl — MUI appends " *" to the accessible label name.
      await selectByLabelText(this.dialog, 'Employee', false).click();
      await this.page.getByRole('option', { name: new RegExp(fields.employeeName) }).click();
    }
    if (fields.workDate !== undefined) await this.dialog.getByLabel('Date').fill(fields.workDate);
    if (fields.hours !== undefined) await this.dialog.getByLabel('Hours').fill(fields.hours);
    if (fields.reason !== undefined) await this.dialog.getByLabel('Reason').fill(fields.reason);
  }

  get submitButton(): Locator {
    return this.dialog.getByRole('button', { name: /^(Submit|Saving…)$/ });
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

  /** Approve/Reject icon buttons get their accessible name from Tooltip's `title` (MUI sets aria-label unconditionally — see e2e/README.md's Design notes). */
  async approve(row: Locator) {
    await row.getByRole('button', { name: 'Approve' }).click();
  }

  async reject(row: Locator) {
    await row.getByRole('button', { name: 'Reject' }).click();
  }

  hasReviewActions(row: Locator): Locator {
    return row.getByRole('button', { name: /^(Approve|Reject)$/ });
  }
}
