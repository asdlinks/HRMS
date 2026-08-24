import { expect, type Locator, type Page } from '@playwright/test';
import { rowByCellText, selectMaxDataGridPageSize } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';

/**
 * Wraps client/src/pages/PayrollRunDetailPage.tsx. Every run this suite
 * creates for a "safe distant future" period (see
 * fixtures/payroll-data.ts's uniquePayrollPeriod() doc comment) computes
 * lines for EVERY currently-active-assignment employee tenant-wide, not
 * just the one this test created — `computeRunLines()` has no per-run
 * employee scoping (see helpers/payroll.ts's
 * createEmployeeWithSalaryAssignment() doc comment). That pool only grows,
 * so the lines grid needs the same page-size guard as any other DataGrid here.
 */
export class PayrollRunDetailPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(runId: number | string) {
    await this.page.goto(`/payroll/runs/${runId}`);
    assertSessionActive(this.page);
    await selectMaxDataGridPageSize(this.page);
  }

  get backButton(): Locator {
    return this.page.getByRole('button', { name: 'Back to Runs' });
  }

  get processButton(): Locator {
    return this.page.getByRole('button', { name: /^(Process|Re-process)$/ });
  }

  get approveButton(): Locator {
    return this.page.getByRole('button', { name: 'Approve' });
  }

  get payButton(): Locator {
    return this.page.getByRole('button', { name: 'Mark Paid' });
  }

  get exportButton(): Locator {
    return this.page.getByRole('button', { name: /^(Export for Bank Processing|Exporting…)$/ });
  }

  get cancelButton(): Locator {
    return this.page.getByRole('button', { name: 'Cancel', exact: true });
  }

  async process() {
    await this.processButton.click();
  }

  async export() {
    await this.exportButton.click();
  }

  lineRow(employeeName: string): Locator {
    return rowByCellText(this.page, employeeName, { exact: true });
  }

  /**
   * Confirmed live (Payroll Framework Stabilization pass): PR-UI-08 failed
   * with a `TimeoutError: locator.click: Timeout 15000ms exceeded` here —
   * same shared-tenant DataGrid-growth pattern as
   * EmployeesPage.clickAddEmployee(), same local timeout override.
   */
  async openLine(employeeName: string) {
    await this.lineRow(employeeName).click({ timeout: 30_000 });
  }

  async employeeCountText(): Promise<string> {
    const el = this.page.getByText(/\d+ employees? in this run/);
    await expect(el).toBeVisible();
    return (await el.textContent()) ?? '';
  }
}
