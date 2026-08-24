import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Wraps client/src/components/payroll/PayslipView.tsx — a printable Dialog
 * with no DialogTitle, so it's matched by its own "Print / Save as PDF"
 * action instead of a heading.
 */
export class PayslipView {
  readonly page: Page;
  readonly root: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Print / Save as PDF' }) });
  }

  async expectVisible() {
    await expect(this.root).toBeVisible();
  }

  async close() {
    await this.root.getByRole('button', { name: 'Close' }).click();
  }

  netPayText(): Locator {
    return this.root.getByText('Net Pay');
  }

  /** PR-UI-08: confirms the payslip view never renders a bank account number, IFSC code or UPI ID anywhere. */
  async expectNoBankingFields() {
    for (const label of [/account number/i, /\bIFSC\b/i, /\bUPI\b/i]) {
      await expect(this.root.getByText(label)).toHaveCount(0);
    }
  }
}
