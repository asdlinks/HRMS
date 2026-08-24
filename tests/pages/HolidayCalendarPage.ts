import { expect, type Locator, type Page } from '@playwright/test';
import { escapeRegex, selectByLabelText } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';
import { ConfirmDialog } from './components/ConfirmDialog';

export interface HolidayFormFields {
  name?: string;
  date?: string;
  /** Single-select only — this page's Add form has no multi-location/Flexi option (HL-UI-02). Omit or '' for "Common (All Locations)". */
  location?: string;
}

/**
 * Wraps client/src/pages/HolidayCalendarPage.tsx (route /holidays) — the
 * employee-facing calendar, grouped by month, with an admin-only Add/Delete
 * surface. Distinct from HolidayConfigPanel.ts (the Settings > Holiday
 * Config tab), which has its own multi-location checkboxes + Regular/Flexi
 * toggle that this page's single-select Add form deliberately lacks.
 */
export class HolidayCalendarPage {
  readonly page: Page;
  readonly addButton: Locator;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addButton = page.getByRole('button', { name: 'Add Holiday' });
    this.dialog = page.getByRole('dialog').filter({ hasText: 'Add New Holiday' });
  }

  async goto() {
    await this.page.goto('/holidays');
    assertSessionActive(this.page);
  }

  /**
   * The header's Location filter is a bare MUI `<Select label="Location">`
   * sibling of its own `<InputLabel>`, with no `labelId`/`name` wired up —
   * the exact pattern `selectByLabelText()`'s doc comment (helpers/locators.ts)
   * and EmployeeFormDialog.ts's FIELD_NAMES comment both describe;
   * `getByLabel('Location')` cannot resolve it. Only called while the Add
   * dialog is closed (its own same-labeled "Location" field only exists in
   * the DOM once opened), so this page-wide lookup never collides with it.
   */
  async filterByLocation(locationName: string | 'All Locations') {
    await selectByLabelText(this.page, 'Location').click();
    await this.page.getByRole('option', { name: locationName, exact: true }).click();
  }

  async openAdd() {
    await this.addButton.click();
    await expect(this.dialog).toBeVisible();
  }

  async fill(fields: HolidayFormFields) {
    if (fields.name !== undefined) await this.dialog.getByLabel('Holiday Name').fill(fields.name);
    if (fields.date !== undefined) await this.dialog.getByLabel('Date').fill(fields.date);
    if (fields.location !== undefined) {
      // Same bare-Select-with-InputLabel pattern as the header filter above — see filterByLocation()'s doc comment.
      await selectByLabelText(this.dialog, 'Location').click();
      const label = fields.location === '' ? 'Common (All Locations)' : fields.location;
      await this.page.getByRole('option', { name: label, exact: true }).click();
    }
  }

  get saveButton(): Locator {
    return this.dialog.getByRole('button', { name: 'Save Holiday' });
  }

  async submit() {
    await this.saveButton.click();
  }

  async cancel() {
    await this.dialog.getByRole('button', { name: 'Cancel' }).click();
  }

  /** HL-UI-02 — no multi-select/Flexi Holiday option exists on this dialog, unlike SettingsPage's Holiday Config tab. */
  async isFlexiToggleVisible(): Promise<boolean> {
    return this.dialog.getByText('Holiday Type').waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false);
  }

  /** A month-grouped holiday card, identified by its visible name text (see itemByName's collision-guard rationale — a plain card, not a `role="button"`, so built locally rather than reusing that helper). */
  holidayCard(name: string): Locator {
    return this.page.locator('.MuiCard-root').filter({ hasText: new RegExp(escapeRegex(name)) });
  }

  async openDelete(name: string) {
    await this.holidayCard(name).getByRole('button').click();
  }

  confirmDeleteDialog(name: string): ConfirmDialog {
    return new ConfirmDialog(this.page, new RegExp(`Remove "${escapeRegex(name)}"\\?`));
  }

  async expectCardAbsent(name: string) {
    await expect(this.holidayCard(name)).toHaveCount(0);
  }

  statCard(label: string): Locator {
    return this.page.locator('.MuiCard-root').filter({ hasText: label });
  }
}
