import { expect, type Page } from '@playwright/test';
import { assertSessionActive } from '../helpers/sessionGuard';

/** Wraps client/src/pages/PayrollDashboardPage.tsx. */
export class PayrollDashboardPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/payroll');
    assertSessionActive(this.page);
  }

  async expectOrgView() {
    await expect(this.page.getByText('Organization-wide payroll overview.')).toBeVisible();
    await expect(this.page.getByText('Net Payroll Cost — Last 6 Months')).toBeVisible();
  }

  async expectSelfView() {
    await expect(this.page.getByText('Your payroll at a glance.')).toBeVisible();
    await expect(this.page.getByText('My Recent Payslips')).toBeVisible();
  }
}
