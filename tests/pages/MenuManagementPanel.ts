import { type Locator, type Page } from '@playwright/test';
import { assertSessionActive } from '../helpers/sessionGuard';

/** Wraps the "Menu Management" tab inside client/src/pages/SettingsPage.tsx (route: /settings). */
export class MenuManagementPanel {
  readonly page: Page;
  readonly navItem: Locator;
  readonly saveButton: Locator;
  /**
   * handleSaveMenu() calls the local flash(), not the shared Snackbar/Toast —
   * the same persistent inline `<Alert severity="success">` primitive as
   * RolesPermissionsPanel.savedAlert (FRAMEWORK_TECH_DEBT.md L3).
   */
  readonly savedAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navItem = page.getByRole('button', { name: 'Menu Management' });
    this.saveButton = page.getByRole('button', { name: /^(Save Menu|Saving…)$/ });
    this.savedAlert = page.getByRole('alert').filter({ hasText: 'Menu updated! Reload the app to see nav changes.' });
  }

  /**
   * Deliberately does NOT assume the nav item exists — gated by
   * menu.manage (SettingsPage.tsx), so a persona lacking it would otherwise
   * hit an unhandled click failure instead of reaching the caller's
   * skipUnlessVisible() guard. Same bounded-wait shape as
   * RolesPermissionsPanel.goto()/LeaveSettingsPanel.goto().
   */
  async goto() {
    await this.page.goto('/settings');
    assertSessionActive(this.page);
    const visible = await this.navItem.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    if (visible) {
      await this.navItem.click();
    }
  }

  /**
   * One item row, scoped via its own `path` caption text — the one stable,
   * never-edited value each row renders (`name` is a live-editable
   * TextField, so it can't anchor the lookup once a test has renamed it).
   * `ancestor::*[1]` is the Typography's immediate parent, the row's own
   * `<Stack direction="row">` — same structural-XPath justification as
   * LeaveSettingsPanel.row()'s `ancestor::*[3]` idiom (no accessible
   * role/label wraps a whole row as one queryable unit).
   */
  row(path: string): Locator {
    return this.page.getByText(path, { exact: true }).locator('xpath=ancestor::*[1]');
  }

  nameField(path: string): Locator {
    return this.row(path).getByLabel('Name', { exact: true });
  }

  visibleSwitch(path: string): Locator {
    return this.row(path).getByLabel('Visible', { exact: true });
  }

  featureEnabledSwitch(path: string): Locator {
    return this.row(path).getByLabel('Feature Enabled', { exact: true });
  }

  /** The row's two unnamed IconButtons (ChevronUp/ChevronDown) — no Tooltip/aria-label exists on either, same "only buttons in this row" idiom as helpers/locators.ts's soleButtonIn. */
  moveUpButton(path: string): Locator {
    return this.row(path).getByRole('button').nth(0);
  }

  moveDownButton(path: string): Locator {
    return this.row(path).getByRole('button').nth(1);
  }

  async save() {
    await this.saveButton.click();
  }
}
