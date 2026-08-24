import { expect, type Locator, type Page } from '@playwright/test';
import { ConfirmDialog } from './components/ConfirmDialog';
import { escapeRegex, selectByLabelText } from '../helpers/locators';

/** Wraps client/src/pages/LeaveCancellationPage.tsx (route: /cancellation). */
export class LeaveCancellationPage {
  readonly page: Page;
  readonly reasonField: Locator;
  readonly submitButton: Locator;
  readonly inlineAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.reasonField = page.getByLabel('Reason for Cancellation');
    this.submitButton = page.getByRole('button', { name: /^(Cancel Leave|Cancelling…)$/ });
    // The page also renders a permanent warning Alert ("You can only cancel
    // leaves that haven't started yet.") which also carries role="alert" —
    // excluding its fixed text isolates the dynamic result message instead.
    this.inlineAlert = page.getByRole('alert').filter({ hasNotText: "haven't started yet" });
  }

  async goto() {
    await this.page.goto('/cancellation');
  }

  /** Plain MUI Select with no `name` prop — same missing-labelId gap as ShiftsPage's Selects; targeted via the visible label's sibling combobox. */
  private get selectField(): Locator {
    return selectByLabelText(this.page, 'Select Leave to Cancel');
  }

  /** `optionTextPrefix` matches the MenuItem's `"{TYPE} ({start} to {end})"` prefix, before the trailing `" — {status}"`. */
  async selectLeaveToCancel(optionTextPrefix: string) {
    await this.selectField.click();
    await this.page.getByRole('option', { name: new RegExp(`^${escapeRegex(optionTextPrefix)}`) }).click();
  }

  async optionCount(): Promise<number> {
    await this.selectField.click();
    // Bounded settle-wait before counting — see LeavesPage.flexiHolidayOptionCount
    // for why an instant .count() right after the click races the async render.
    await this.page.getByRole('option').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    const count = await this.page.getByRole('option').count();
    await this.page.keyboard.press('Escape');
    return count;
  }

  async fillReason(reason: string) {
    await this.reasonField.fill(reason);
  }

  async submit() {
    await this.submitButton.click();
  }

  async confirmCancellation() {
    const confirm = new ConfirmDialog(this.page, /Cancel this leave request\?/);
    await confirm.confirm('Cancel Leave');
  }

  /** Full flow: select, fill reason, submit, confirm. */
  async cancelLeave(optionTextPrefix: string, reason: string) {
    await this.selectLeaveToCancel(optionTextPrefix);
    await this.fillReason(reason);
    await this.submit();
    await this.confirmCancellation();
  }

  async expectSuccessMessage() {
    await expect(this.inlineAlert).toContainText('Leave cancelled successfully!');
  }
}
