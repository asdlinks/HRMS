import { expect, type Locator, type Page } from '@playwright/test';
import { itemByName, selectByLabelText, soleButtonIn } from '../helpers/locators';

export type ShiftType = 'General' | 'Flexible' | 'Night' | 'Rotational' | 'Split';
export type BreakType = 'No break' | 'Unpaid duration' | 'Paid duration' | 'Fixed window';

export interface ShiftFormFields {
  name?: string;
  shiftType?: ShiftType;
  startTime?: string;
  endTime?: string;
  isOvernight?: boolean;
  expectedWorkMinutes?: string;
  gracePeriodMinutes?: string;
  earlyExitThresholdMinutes?: string;
  breakType?: BreakType;
  breakDurationMinutes?: string;
  otEnabled?: boolean;
  otTriggerAfterMinutes?: string;
  otRequiresApproval?: boolean;
  isActive?: boolean;
}

/**
 * Wraps client/src/pages/ShiftsPage.tsx. The Shift Type / Break Type Selects
 * are plain useState-controlled MUI Selects with no `name` prop (unlike
 * EmployeeFormDialog's react-hook-form Selects) — same missing-labelId gap
 * documented in EmployeesPage.ts's filter bar, so they're targeted via the
 * visible InputLabel text's sibling combobox rather than getByLabel/the
 * mui-component-select-<name> id trick.
 */
export class ShiftsPage {
  readonly page: Page;
  readonly newShiftButton: Locator;
  readonly dialog: Locator;
  readonly employeeAutocomplete: Locator;
  readonly effectiveFromInput: Locator;
  readonly assignButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newShiftButton = page.getByRole('button', { name: 'New Shift' });
    this.dialog = page.getByRole('dialog').filter({ hasText: /New Shift|Edit Shift/ });
    this.employeeAutocomplete = page.getByLabel('Employee');
    this.effectiveFromInput = page.getByLabel('Effective From');
    this.assignButton = page.getByRole('button', { name: /^(Assign|Assigning…)$/ });
  }

  async goto() {
    await this.page.goto('/shifts');
  }

  /** The shift's list row — matches on its concatenated primary+secondary text. */
  listItem(name: string): Locator {
    return itemByName(this.page, name);
  }

  async openAdd() {
    await this.newShiftButton.click();
  }

  async openEdit(name: string) {
    await this.listItem(name).click();
  }

  async deleteShift(name: string) {
    await soleButtonIn(this.listItem(name)).click();
  }

  private selectField(label: string): Locator {
    return selectByLabelText(this.dialog, label);
  }

  async selectShiftType(type: ShiftType) {
    await this.selectField('Shift Type').click();
    await this.page.getByRole('option', { name: type, exact: true }).click();
  }

  async selectBreakType(type: BreakType) {
    await this.selectField('Break Type').click();
    await this.page.getByRole('option', { name: type, exact: true }).click();
  }

  async fill(fields: ShiftFormFields) {
    if (fields.name !== undefined) await this.dialog.getByLabel('Shift Name').fill(fields.name);
    if (fields.shiftType !== undefined) await this.selectShiftType(fields.shiftType);
    if (fields.startTime !== undefined) await this.dialog.getByLabel('Start Time', { exact: true }).fill(fields.startTime);
    // exact: true — otherwise this also substring-matches the Night-shift-only
    // "End time is on the next calendar day" checkbox label, a strict-mode
    // violation confirmed live once Night/Split shift types (whose field set
    // includes that checkbox) were actually reachable in a test run.
    if (fields.endTime !== undefined) await this.dialog.getByLabel('End Time', { exact: true }).fill(fields.endTime);
    if (fields.isOvernight !== undefined) await this.dialog.getByLabel(/End time is on the next calendar day/).setChecked(fields.isOvernight);
    if (fields.expectedWorkMinutes !== undefined) await this.dialog.getByLabel('Expected Work (minutes)').fill(fields.expectedWorkMinutes);
    if (fields.gracePeriodMinutes !== undefined) await this.dialog.getByLabel('Grace Period (minutes)').fill(fields.gracePeriodMinutes);
    if (fields.earlyExitThresholdMinutes !== undefined) await this.dialog.getByLabel('Early Exit Threshold (min)').fill(fields.earlyExitThresholdMinutes);
    if (fields.breakType !== undefined) await this.selectBreakType(fields.breakType);
    if (fields.breakDurationMinutes !== undefined) await this.dialog.getByLabel('Break Duration (minutes)').fill(fields.breakDurationMinutes);
    if (fields.otEnabled !== undefined) await this.dialog.getByLabel(/Enable overtime for this shift/).setChecked(fields.otEnabled);
    if (fields.otTriggerAfterMinutes !== undefined) await this.dialog.getByLabel(/OT Trigger After/).fill(fields.otTriggerAfterMinutes);
    if (fields.otRequiresApproval !== undefined) await this.dialog.getByLabel(/Overtime requires manager approval/).setChecked(fields.otRequiresApproval);
    if (fields.isActive !== undefined) await this.dialog.getByLabel('Active').setChecked(fields.isActive);
  }

  splitWindow(index: number): { start: Locator; end: Locator } {
    const rows = this.dialog.getByLabel('Start');
    return { start: rows.nth(index), end: this.dialog.getByLabel('End').nth(index) };
  }

  get submitButton(): Locator {
    return this.dialog.getByRole('button', { name: /^(Create Shift|Save Changes)$/ });
  }

  async submit() {
    await this.submitButton.click();
  }

  async cancel() {
    await this.dialog.getByRole('button', { name: 'Cancel' }).click();
  }

  errorText(message: string | RegExp): Locator {
    return this.page.getByText(message);
  }

  async selectAssignEmployee(employeeName: string) {
    await this.employeeAutocomplete.click();
    await this.employeeAutocomplete.fill(employeeName);
    await this.page.getByRole('option', { name: employeeName }).click();
  }

  async selectAssignShift(shiftName: string) {
    await selectByLabelText(this.page, 'Shift').click();
    await this.page.getByRole('option', { name: shiftName, exact: true }).click();
  }

  async setEffectiveFrom(dateIso: string) {
    await this.effectiveFromInput.fill(dateIso);
  }

  async assign() {
    await this.assignButton.click();
  }

  /**
   * Scoped to the "History — {employee}" section, not the whole page — the
   * shift's own list item (ListItemText primary={s.name}) renders the same
   * shift name text elsewhere on this same page, so an unscoped
   * `page.getByText(shiftName)` would match both and throw a strict-mode
   * violation.
   */
  private get assignmentHistorySection(): Locator {
    return this.page.getByText(/^History — /).locator('xpath=following-sibling::*[1]');
  }

  assignmentHistoryRow(shiftName: string): Locator {
    return this.assignmentHistorySection.getByText(shiftName, { exact: true }).locator('..');
  }

  async expectListItemAbsent(name: string) {
    await expect(this.listItem(name)).toHaveCount(0);
  }
}
