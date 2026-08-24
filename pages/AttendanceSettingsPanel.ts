import { type Locator, type Page } from '@playwright/test';

const ORDINAL_SUFFIX: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd', 4: 'th', 5: 'th' };

/** Wraps the "Attendance Rules" tab inside client/src/pages/SettingsPage.tsx (route: /settings). */
export class AttendanceSettingsPanel {
  readonly page: Page;
  readonly navItem: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navItem = page.getByRole('button', { name: 'Attendance Rules' });
    this.saveButton = page.getByRole('button', { name: /^(Save Rules|Saving…)$/ });
  }

  /**
   * Navigates to Settings and opens the Attendance Rules tab if the nav item
   * is present. Deliberately does NOT assume the nav item exists — it's
   * gated by attendance.settings.manage (see SettingsPage.tsx), so a
   * low-privilege persona would otherwise hit an unhandled click failure
   * here instead of reaching the caller's `skipUnlessVisible(saveButton, …)`
   * guard. Waits (bounded) for the item to actually appear rather than
   * checking `isVisible()` immediately — same fix as LeaveSettingsPanel.goto()
   * and helpers/guards.ts's `skipUnlessVisible`: an instant check races
   * Settings' own permission-gated render and can miss a nav item the
   * persona genuinely has, not just correctly skip one they don't.
   */
  async goto() {
    await this.page.goto('/settings');
    const visible = await this.navItem.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    if (visible) {
      await this.navItem.click();
    }
  }

  weeklyOffCheckbox(weekdayFullName: string): Locator {
    return this.page.getByLabel(weekdayFullName, { exact: true });
  }

  nthSaturdayCheckbox(n: 1 | 2 | 3 | 4 | 5): Locator {
    return this.page.getByLabel(`${n}${ORDINAL_SUFFIX[n]} Saturday`, { exact: true });
  }

  /**
   * The "Attendance Required For" role checklist immediately follows its own
   * heading + helper-text paragraph — scoping this way avoids needing to
   * know this tenant's actual role names (which vary and may come from
   * FALLBACK_ROLE_OPTIONS instead of live roles — see SettingsPage.tsx).
   */
  get requiredForRolesGroup(): Locator {
    return this.page.getByText('Attendance Required For', { exact: true }).locator('xpath=following-sibling::*[2]');
  }

  firstRequiredForRoleCheckbox(): Locator {
    return this.requiredForRolesGroup.getByRole('checkbox').first();
  }

  allRequiredForRoleCheckboxes(): Locator {
    return this.requiredForRolesGroup.getByRole('checkbox');
  }

  async save() {
    await this.saveButton.click();
  }
}
