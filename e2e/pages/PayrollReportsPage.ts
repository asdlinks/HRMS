import { expect, type Locator, type Page } from '@playwright/test';
import { selectByLabelText } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';

/** Wraps client/src/pages/PayrollReportsPage.tsx. */
export class PayrollReportsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/payroll/reports');
    assertSessionActive(this.page);
  }

  async selectMonth(monthName: string) {
    await selectByLabelText(this.page, 'Month').click();
    await this.page.getByRole('option', { name: monthName, exact: true }).click();
  }

  async selectYear(year: number) {
    await selectByLabelText(this.page, 'Year').click();
    await this.page.getByRole('option', { name: String(year), exact: true }).click();
  }

  async selectDepartment(name: string) {
    await selectByLabelText(this.page, 'Department').click();
    await this.page.getByRole('option', { name, exact: true }).click();
  }

  statCard(label: string): Locator {
    return this.page.getByText(label);
  }

  async expectLoaded() {
    // The page's own subtitle text contains "component breakdown" as a
    // substring too — the heading role disambiguates.
    await expect(this.page.getByRole('heading', { name: 'Component Breakdown' })).toBeVisible();
  }
}
