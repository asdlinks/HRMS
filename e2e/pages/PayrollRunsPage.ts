import { type Locator, type Page } from '@playwright/test';
import { rowByCellText, selectByLabelText, selectMaxDataGridPageSize } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Wraps client/src/pages/PayrollRunsPage.tsx. */
export class PayrollRunsPage {
  readonly page: Page;
  readonly newRunButton: Locator;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newRunButton = page.getByRole('button', { name: 'New Payroll Run' });
    this.dialog = page.getByRole('dialog').filter({ hasText: 'New Payroll Run' });
  }

  async goto() {
    await this.page.goto('/payroll/runs');
    assertSessionActive(this.page);
    await selectMaxDataGridPageSize(this.page);
  }

  row(periodLabel: string): Locator {
    return rowByCellText(this.page, periodLabel, { exact: true });
  }

  static periodLabel(year: number, month: number): string {
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }

  async openAdd() {
    await this.newRunButton.click();
  }

  /** The dialog's Year <select> only ever offers [now-1, now, now+1] (PR-UI-04) — pick a value outside that range and this silently no-ops. */
  async selectMonth(monthName: string) {
    await selectByLabelText(this.dialog, 'Month').click();
    await this.page.getByRole('option', { name: monthName, exact: true }).click();
  }

  async selectYear(year: number) {
    await selectByLabelText(this.dialog, 'Year').click();
    await this.page.getByRole('option', { name: String(year), exact: true }).click();
  }

  async availableYearOptions(): Promise<string[]> {
    await selectByLabelText(this.dialog, 'Year').click();
    const options = this.page.getByRole('option');
    await options.first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    const texts = await options.allTextContents();
    await this.page.keyboard.press('Escape');
    return texts;
  }

  get createButton(): Locator {
    return this.dialog.getByRole('button', { name: /^(Create Run|Creating…)$/ });
  }

  async submit() {
    await this.createButton.click();
  }

  async cancel() {
    await this.dialog.getByRole('button', { name: 'Cancel' }).click();
  }

  async openRow(periodLabel: string) {
    await this.row(periodLabel).click();
  }
}
