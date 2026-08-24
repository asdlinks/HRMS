import { type Locator, type Page } from '@playwright/test';

/** Wraps client/src/platform-admin/pages/PlatformSettingsPage.tsx — the
 * Subscription Plans catalog (list + create/edit dialog). No delete UI
 * exists (matches the server's own no-DELETE-route design). */
export class PlatformSettingsPage {
  readonly page: Page;

  readonly newPlanButton: Locator;
  readonly dialog: Locator;
  readonly dialogTitle: Locator;
  readonly nameInput: Locator;
  readonly maxEmployeesInput: Locator;
  readonly storageLimitInput: Locator;
  readonly supportLevelInput: Locator;
  readonly trialDaysInput: Locator;
  readonly monthlyPriceInput: Locator;
  readonly annualPriceInput: Locator;
  readonly activeSwitch: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newPlanButton = page.getByRole('button', { name: 'New Plan' });
    this.dialog = page.getByRole('dialog');
    this.dialogTitle = this.dialog.locator('.MuiDialogTitle-root');
    this.nameInput = this.dialog.getByLabel('Plan Name');
    this.maxEmployeesInput = this.dialog.getByLabel('Max Employees');
    this.storageLimitInput = this.dialog.getByLabel('Storage Limit (MB)');
    this.supportLevelInput = this.dialog.getByLabel('Support Level');
    this.trialDaysInput = this.dialog.getByLabel('Trial Duration (days)');
    this.monthlyPriceInput = this.dialog.getByLabel('Monthly Price (future)');
    this.annualPriceInput = this.dialog.getByLabel('Annual Price (future)');
    this.activeSwitch = this.dialog.getByLabel('Active (assignable to companies)');
    // "Create" (new) vs "Save Changes" (editing) — PlatformSettingsPage.tsx's
    // own conditional label; both are the dialog's one submit button.
    this.saveButton = this.dialog.getByRole('button', { name: /^(Create|Save Changes)$/ });
    this.cancelButton = this.dialog.getByRole('button', { name: 'Cancel' });
  }

  async goto() {
    await this.page.goto('/platform-admin/settings');
  }

  /** The list row for a given plan name — ListItemButton's accessible name
   * includes both the primary (name) and secondary (stats) text, so this
   * matches on the name being present rather than an exact string. */
  planRow(name: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(escapeRegExp(name)) });
  }

  moduleCheckbox(label: string): Locator {
    return this.dialog.getByRole('checkbox', { name: label });
  }

  inactiveChip(name: string): Locator {
    return this.planRow(name).getByText('Inactive', { exact: true });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
