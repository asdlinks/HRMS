import { expect, type Locator, type Page } from '@playwright/test';
import { Toast } from './components/Toast';
import { selectByLabelText } from '../helpers/locators';

export interface HolidayConfigFormFields {
  name?: string;
  date?: string;
  /** Omit for "Common (All Locations)" (the checkbox default); pass specific location names to check them individually — mirrors the real UI's independent checkboxes, not a single-select. */
  locations?: string[];
  isFlexi?: boolean;
}

/**
 * Wraps the "Holiday Config" tab inside SettingsPage.tsx (route: /settings)
 * — the admin-only surface with multi-location checkboxes and a
 * Regular/Flexi toggle that client/src/pages/HolidayCalendarPage.tsx's
 * single-select Add form deliberately lacks (HL-UI-02). Same
 * navItem/goto()-bounded-wait shape as LeaveSettingsPanel.ts/
 * AttendanceSettingsPanel.ts.
 */
export class HolidayConfigPanel {
  readonly page: Page;
  readonly navItem: Locator;
  readonly nameField: Locator;
  readonly dateField: Locator;
  readonly allLocationsCheckbox: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navItem = page.getByRole('button', { name: 'Holiday Config' });
    this.nameField = page.getByLabel('Holiday Name');
    this.dateField = page.getByLabel('Date', { exact: true });
    this.allLocationsCheckbox = page.getByLabel('Common (All Locations)');
    this.submitButton = page.getByRole('button', { name: 'Add Holiday' });
  }

  /**
   * Same bounded-wait-then-click shape as LeaveSettingsPanel.goto() — the nav
   * item is permission-gated (canManageHolidays). Additionally waits for the
   * tab's own async fetchHolidaysAndLocations() (fired on mount) to render
   * the Add-form fields before returning — confirmed live under this suite's
   * default parallel worker count that a bare click-then-return races that
   * fetch. SettingsPage.tsx's own initial mount fires a much larger
   * Promise.all than HolidayCalendarPage.tsx's (holidays, flexi_holidays,
   * locations, menu items, roles, permissions, departments, designations,
   * employment types, ...) — confirmed live to occasionally take close to
   * 30s to settle on this shared dev tenant once 3 parallel workers are all
   * loading similarly heavy pages at once.
   */
  async goto() {
    await this.page.goto('/settings');
    const visible = await this.navItem.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    if (visible) {
      await this.navItem.click();
      await this.nameField.waitFor({ state: 'visible', timeout: 30_000 });
    }
  }

  locationCheckbox(locationName: string): Locator {
    return this.page.getByLabel(locationName, { exact: true });
  }

  /**
   * The Year filter is a bare MUI `<Select label="Year">` sibling of its own
   * `<InputLabel>`, no `labelId`/`name` wired up — same pattern as
   * HolidayCalendarPage.ts's Location filter (see that file's doc comment);
   * `getByLabel('Year')` cannot resolve it.
   */
  async selectYear(year: number) {
    await selectByLabelText(this.page, 'Year').click();
    await this.page.getByRole('option', { name: String(year), exact: true }).click();
  }

  get regularToggleButton(): Locator {
    return this.page.getByRole('button', { name: 'Regular' });
  }

  get flexiToggleButton(): Locator {
    return this.page.getByRole('button', { name: 'Flexi' });
  }

  async fill(fields: HolidayConfigFormFields) {
    if (fields.name !== undefined) await this.nameField.fill(fields.name);
    if (fields.date !== undefined) await this.dateField.fill(fields.date);
    if (fields.locations !== undefined) {
      for (const name of fields.locations) await this.locationCheckbox(name).check();
    }
    if (fields.isFlexi !== undefined) await (fields.isFlexi ? this.flexiToggleButton : this.regularToggleButton).click();
  }

  async submit() {
    await this.submitButton.click();
  }

  async expectSaved() {
    await new Toast(this.page).expectVisible('Holiday added successfully!');
  }

  /**
   * A holiday row's own name Typography has no accessible role, and both the
   * "Regular Holidays" and "Flexi Holidays" HolidayList components render
   * structurally identical rows (SettingsPage.tsx's shared HolidayList) —
   * same documented ancestor-climb idiom as LeaveSettingsPanel.ts's `row()`,
   * since disposable per-test names are always unique so cross-list
   * ambiguity never actually arises. `exact: true` avoids one holiday name
   * matching as a substring of another when both are `uniqueHolidayName()`
   * calls in the same test.
   */
  row(name: string): Locator {
    return this.page.getByText(name, { exact: true }).locator('xpath=ancestor::*[2]');
  }

  async deleteRow(name: string) {
    await this.row(name).getByRole('button').click();
  }

  async expectRowAbsent(name: string) {
    await expect(this.row(name)).toHaveCount(0);
  }
}
