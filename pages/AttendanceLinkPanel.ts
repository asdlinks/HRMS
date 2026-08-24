import { type Locator, type Page } from '@playwright/test';
import { Toast } from './components/Toast';
import { assertSessionActive } from '../helpers/sessionGuard';

/**
 * Wraps only the "Attendance Link" field inside SettingsPage.tsx's "General
 * Config" tab (route: /settings) — the Leave Allocations section of this
 * same tab is owned by the already-frozen LeaveSettingsPanel.ts, which this
 * class deliberately does not touch or extend. Both panels share the same
 * "Save Configuration" button, which submits BOTH keys together
 * (client/src/pages/SettingsPage.tsx's handleSaveGeneral) — a test using
 * this panel harmlessly resubmits whatever Leave Allocations rows are
 * currently loaded, unchanged.
 */
export class AttendanceLinkPanel {
  readonly page: Page;
  readonly navItem: Locator;
  readonly attendanceLinkField: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navItem = page.getByRole('button', { name: 'General Config' });
    this.attendanceLinkField = page.getByLabel('Attendance Link');
    this.saveButton = page.getByRole('button', { name: /^(Save Configuration|Saving…)$/ });
  }

  /** Same bounded-wait-then-click-if-present shape as LeaveSettingsPanel.goto() (both wrap the same permission-gated tab). */
  async goto() {
    await this.page.goto('/settings');
    const visible = await this.navItem.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    if (visible) await this.navItem.click();
    assertSessionActive(this.page);
  }

  async fill(value: string) {
    await this.attendanceLinkField.fill(value);
  }

  async save() {
    await this.saveButton.click();
  }

  async expectSaved() {
    await new Toast(this.page).expectVisible('Settings saved successfully!');
  }
}
