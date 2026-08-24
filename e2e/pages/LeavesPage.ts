import { expect, type Locator, type Page } from '@playwright/test';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Toast } from './components/Toast';
import { escapeRegex, rowByCellText } from '../helpers/locators';

export type LeaveStatusFilter = 'All' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface ApplyLeaveFields {
  targetEmployee?: string;
  /** Matched by option-label PREFIX (before the dynamic " (N left)"/" — Unavailable in Probation" suffix). */
  leaveType?: string;
  /** Matched by option-label PREFIX (before " (date)"). Only relevant when leaveType === 'Flexi Holiday'. */
  flexiHoliday?: string;
  halfDay?: boolean;
  startDate?: string;
  endDate?: string;
  reason?: string;
}

/**
 * Wraps client/src/pages/LeavesPage.tsx (route: /leaves) — the apply drawer,
 * balance cards, status-filter chips, and the Recent Requests DataGrid with
 * its row-scoped Approve/Reject actions.
 */
export class LeavesPage {
  readonly page: Page;
  readonly applyButton: Locator;
  readonly drawer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.applyButton = page.getByRole('button', { name: 'Apply for Leave' });
    this.drawer = page.locator('.MuiDrawer-root').filter({ hasText: 'Record Leave' });
  }

  async goto() {
    await this.page.goto('/leaves');
  }

  async openApplyDrawer() {
    await this.applyButton.click();
    await expect(this.drawer).toBeVisible();
  }

  /**
   * The X close IconButton carries no accessible name (no Tooltip/aria-label)
   * — it's the sole button inside the drawer's header row (the row that
   * also contains the "Record Leave" heading, distinct from the inner
   * icon+title Stack which itself has no button).
   */
  async closeApplyDrawer() {
    // "Record Leave" text -> its icon+text Stack -> that Stack's parent, the header row Stack which also holds the close button.
    const headerRow = this.drawer.getByText('Record Leave').locator('..').locator('..');
    await headerRow.getByRole('button').click();
  }

  get targetEmployeeField(): Locator {
    return this.drawer.getByLabel('Target Employee');
  }

  /**
   * False for a persona lacking leaves.apply.any — the field isn't merely
   * disabled, it's never rendered at all. Bounded wait, not an instant
   * check — same fix as EmployeeFormDialog's isIdentitySectionVisible: an
   * instant `isVisible()` right after the drawer opens can race the
   * permission-gated render and report "absent" for a persona who actually
   * has the field, a moment before it appears.
   */
  async isTargetEmployeeFieldVisible(): Promise<boolean> {
    return this.targetEmployeeField.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  }

  async selectTargetEmployee(name: string) {
    await this.targetEmployeeField.click();
    await this.page.getByRole('option', { name, exact: false }).click();
  }

  get leaveTypeField(): Locator {
    return this.drawer.getByLabel('Leave Type', { exact: true });
  }

  /**
   * Selecting the leave TYPE before selecting a Target Employee matters for
   * probation tests: `isProbationActive()` (and therefore whether an
   * Earned/Paid-ish option renders `disabled`) is computed from
   * `formData.user_id`, which starts blank — so the option is selectable
   * while no target is chosen yet, and stays selected once a probationary
   * target is chosen afterward (selecting the target only ever writes
   * `user_id`, never touches `type`). Selecting type AFTER a probationary
   * target would hit a disabled, unclickable option instead. See
   * e2e/tests/leave-probation.spec.ts.
   */
  async selectLeaveType(typePrefix: string) {
    await this.leaveTypeField.click();
    await this.page.getByRole('option', { name: new RegExp(`^${escapeRegex(typePrefix)}`) }).click();
  }

  get flexiHolidayField(): Locator {
    return this.drawer.getByLabel('Select Flexi Holiday');
  }

  async selectFlexiHoliday(namePrefix: string) {
    await this.flexiHolidayField.click();
    await this.page.getByRole('option', { name: new RegExp(`^${escapeRegex(namePrefix)}`) }).click();
  }

  async flexiHolidayOptionCount(): Promise<number> {
    await this.flexiHolidayField.click();
    // The option list renders asynchronously after the click; give it a
    // bounded chance to settle before counting, rather than reading .count()
    // the instant the dropdown opens. A genuinely empty list still correctly
    // resolves to 0 once the wait below times out.
    await this.page.getByRole('option').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    const count = await this.page.getByRole('option').count();
    await this.page.keyboard.press('Escape');
    return count;
  }

  get fullDayToggle(): Locator {
    return this.drawer.getByRole('button', { name: 'Full Day' });
  }

  get halfDayToggle(): Locator {
    return this.drawer.getByRole('button', { name: 'Half Day' });
  }

  /**
   * Label reads "Date" once Half Day is toggled on, "Start Date" otherwise —
   * both rendered as "<label> *" (MUI's `required` prop appends the marker
   * to the accessible name), hence the trailing `\s*\*?` rather than an
   * exact `$` anchor.
   */
  get startDateField(): Locator {
    return this.drawer.getByLabel(/^(Start Date|Date)\s*\*?$/);
  }

  get endDateField(): Locator {
    return this.drawer.getByLabel('End Date');
  }

  get reasonField(): Locator {
    return this.drawer.getByLabel('Reason');
  }

  get submitButton(): Locator {
    return this.drawer.getByRole('button', { name: /^(Submit for Approval|Record Leave|Select Flexi Holiday|Processing…)$/ });
  }

  async fill(fields: ApplyLeaveFields) {
    if (fields.leaveType !== undefined) await this.selectLeaveType(fields.leaveType);
    if (fields.targetEmployee !== undefined) await this.selectTargetEmployee(fields.targetEmployee);
    if (fields.flexiHoliday !== undefined) await this.selectFlexiHoliday(fields.flexiHoliday);
    if (fields.halfDay) await this.halfDayToggle.click();
    if (fields.startDate !== undefined) await this.startDateField.fill(fields.startDate);
    if (fields.endDate !== undefined) await this.endDateField.fill(fields.endDate);
    if (fields.reason !== undefined) await this.reasonField.fill(fields.reason);
  }

  async submit() {
    await this.submitButton.click();
  }

  /** Balance cards are the only Cards on this page containing "days remaining" — scoping on that avoids colliding with the DataGrid's own Leave Type column text. Omit `rawTypeName` to match any balance card. */
  balanceCard(rawTypeName?: string): Locator {
    const cards = this.page.locator('.MuiCard-root').filter({ hasText: 'days remaining' });
    return rawTypeName !== undefined ? cards.filter({ hasText: rawTypeName }) : cards;
  }

  statusChip(status: LeaveStatusFilter): Locator {
    return this.page.getByText(new RegExp(`^${status} \\(\\d+\\)$`));
  }

  async filterByStatus(status: LeaveStatusFilter) {
    await this.statusChip(status).click();
  }

  /** Scoped to the Recent Requests grid via the Employee column — only present for canSeeEmployeeColumn holders (team/all view). */
  rowByEmployee(employeeName: string): Locator {
    return rowByCellText(this.page, employeeName);
  }

  /** Matches the grid's rendered "{start} → {end}" Dates cell — use when no unique Employee-column anchor exists (e.g. a shared persona's own leave). */
  rowByDateRangeText(dateRangeText: string): Locator {
    return rowByCellText(this.page, dateRangeText);
  }

  /**
   * The row's own Approve button persists in the DOM behind the confirm
   * dialog (the DataGrid doesn't unmount it) — reusing the shared
   * ConfirmDialog component (scoped via role="dialog") to click the actual
   * confirm button avoids a same-name collision with that still-present row button.
   */
  async approve(row: Locator) {
    await row.getByRole('button', { name: 'Approve' }).click();
    const confirm = new ConfirmDialog(this.page, /Approve this leave request\?/);
    await confirm.confirm('Approve');
  }

  async reject(row: Locator) {
    await row.getByRole('button', { name: 'Reject' }).click();
    const confirm = new ConfirmDialog(this.page, /Reject this leave request\?/);
    await confirm.confirm('Reject');
  }

  async isActionsColumnVisible(): Promise<boolean> {
    return this.page
      .getByRole('columnheader', { name: 'Actions' })
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true, () => false);
  }

  toast(message: string | RegExp): Locator {
    return new Toast(this.page).locator(message);
  }
}
