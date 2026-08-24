import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Wraps client/src/components/VoiceConfirmationModal.tsx — mounted by
 * client/src/layout/AppShell.tsx for every "modifying" voice intent
 * (APPROVE_LEAVE/REJECT_LEAVE/CANCEL_LEAVE/ADD_HOLIDAY/ADD_LOCATION/CHANGE_CATEGORY),
 * on top of whatever page the caller is currently viewing — not a routable
 * page of its own, hence `pages/components/` per FRAMEWORK_GUIDELINES.md.
 * Reached via `helpers/voice.ts`'s `dispatchVoiceIntentEvent()`, since this
 * suite cannot drive real speech input (see voice-commands-not-automatable.spec.ts).
 */
export class VoiceConfirmationModal {
  readonly page: Page;
  readonly dialog: Locator;
  readonly errorAlert: Locator;
  readonly cancelButton: Locator;
  readonly confirmButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dialog = page.getByRole('dialog').filter({ hasText: 'Confirm Voice Action' });
    this.errorAlert = this.dialog.getByRole('alert');
    this.cancelButton = this.dialog.getByRole('button', { name: 'Cancel' });
    this.confirmButton = this.dialog.getByRole('button', { name: /Confirm|Executing/ });
  }

  async waitForOpen(): Promise<void> {
    await expect(this.dialog).toBeVisible();
  }

  async expectClosed(): Promise<void> {
    await expect(this.dialog).not.toBeVisible();
  }

  /**
   * `getActionDescription()` (VoiceConfirmationModal.tsx) renders as a plain
   * Typography with no distinguishing role/label of its own — asserting on
   * the dialog's full accessible text containing the expected description is
   * more robust than trying to isolate that one Typography node from its
   * "You asked to:" sibling.
   */
  async expectDescription(text: string | RegExp): Promise<void> {
    await expect(this.dialog).toContainText(text);
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }
}
