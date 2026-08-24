import { expect, type Locator, type Page } from '@playwright/test';

export type WorkModeKind = 'WFH' | 'ClientVisit' | 'FieldWork';

const WORK_MODE_DIALOG_TITLE: Record<WorkModeKind, string> = {
  WFH: 'Work From Home',
  ClientVisit: 'Client Visit',
  FieldWork: 'Field Work',
};

const WORK_MODE_BUTTON_NAME: Record<WorkModeKind, string> = {
  WFH: 'Work From Home',
  ClientVisit: 'Client Visit',
  FieldWork: 'Field Work',
};

/**
 * Wraps client/src/components/attendance/TodayAttendanceCard.tsx.
 * The work-mode and check-out dialogs are MUI `Dialog`s, which portal to
 * `document.body` — they are NOT descendants of the card's DOM node. Scoping
 * every always-visible action button to `root` (the card) is what lets
 * "Check Out" (opens the dialog) and the dialog's own "Check Out" (submits)
 * coexist without a strict-mode locator collision once the dialog is open.
 */
export class AttendanceCard {
  readonly page: Page;
  readonly root: Locator;
  readonly manualCheckInButton: Locator;
  readonly breakButton: Locator;
  readonly resumeButton: Locator;
  readonly checkOutButton: Locator;
  readonly kioskOnlyAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.locator('.MuiCard-root').filter({ hasText: "Today's Attendance" });
    this.manualCheckInButton = this.root.getByRole('button', { name: 'Check In (Office)' });
    this.breakButton = this.root.getByRole('button', { name: 'Take a Break' });
    this.resumeButton = this.root.getByRole('button', { name: 'Resume Work' });
    this.checkOutButton = this.root.getByRole('button', { name: 'Check Out' });
    this.kioskOnlyAlert = this.root.getByText(/Face Recognition/);
  }

  workModeButton(mode: WorkModeKind): Locator {
    return this.root.getByRole('button', { name: WORK_MODE_BUTTON_NAME[mode] });
  }

  async checkInManual() {
    await this.manualCheckInButton.click();
  }

  private workModeDialog(mode: WorkModeKind): Locator {
    return this.page.getByRole('dialog').filter({ hasText: WORK_MODE_DIALOG_TITLE[mode] });
  }

  /** Opens the work-mode dialog and fills the fields relevant to that mode, but does not submit. */
  async openWorkModeDialog(mode: WorkModeKind, fields: { clientName?: string; notes?: string; shareLocation?: boolean } = {}) {
    await this.workModeButton(mode).click();
    const dialog = this.workModeDialog(mode);
    await expect(dialog).toBeVisible();
    if (fields.clientName !== undefined) await dialog.getByLabel('Client name').fill(fields.clientName);
    if (fields.notes !== undefined) await dialog.getByLabel('Notes (optional)').fill(fields.notes);
    if (fields.shareLocation) await dialog.getByRole('button', { name: 'Share my current location' }).click();
  }

  workModeSubmitButton(mode: WorkModeKind): Locator {
    return this.workModeDialog(mode).getByRole('button', { name: 'Check In' });
  }

  async submitWorkMode(mode: WorkModeKind) {
    await this.workModeSubmitButton(mode).click();
  }

  async cancelWorkModeDialog(mode: WorkModeKind) {
    await this.workModeDialog(mode).getByRole('button', { name: 'Cancel' }).click();
  }

  async startBreak() {
    await this.breakButton.click();
  }

  async resumeFromBreak() {
    await this.resumeButton.click();
  }

  private get checkOutDialog(): Locator {
    return this.page.getByRole('dialog').filter({ hasText: 'Check out for today?' });
  }

  async openCheckOutDialog() {
    await this.checkOutButton.click();
    await expect(this.checkOutDialog).toBeVisible();
  }

  async fillWorkSummary(text: string) {
    await this.checkOutDialog.getByLabel(/What did you work on today/).fill(text);
  }

  async isWorkSummaryFieldVisible(): Promise<boolean> {
    return this.checkOutDialog.getByLabel(/What did you work on today/).isVisible().catch(() => false);
  }

  async submitCheckOut() {
    await this.checkOutDialog.getByRole('button', { name: 'Check Out' }).click();
  }

  /** Opens the check-out dialog and submits it in one step, with an optional work summary. */
  async checkOut(workSummary?: string) {
    await this.openCheckOutDialog();
    if (workSummary !== undefined) await this.fillWorkSummary(workSummary);
    await this.submitCheckOut();
  }

  methodChip(label: string): Locator {
    return this.root.getByText(label, { exact: true });
  }

  /**
   * The "Timeline" section's own event labels, in DOM order — AttendanceTimeline.tsx
   * renders `buildTimelineEvents()`'s already-time-sorted array top to bottom
   * as `<Typography sx={{fontWeight:700}}>{label}</Typography>`, so reading
   * them back in DOM order is exactly "chronological order" (AT-UI-04).
   * Scoped past the "Timeline" heading, not just `root`, since "Checked in"/
   * "Checked out" text could otherwise also match a toast/snackbar still
   * visible from the same test.
   */
  private get timelineSection(): Locator {
    return this.root.getByText('Timeline', { exact: true }).locator('xpath=following-sibling::*[1]');
  }

  async timelineEventLabels(): Promise<string[]> {
    // Each event's label renders as MUI Typography variant="body2" (a <p>);
    // its timestamp sibling is variant="caption" (a <span>) — the tag itself
    // is enough to select only the labels, in DOM (chronological) order.
    return this.timelineSection.locator('p').allTextContents();
  }

  /**
   * The Check Out button is present for the entire "checked in, not yet
   * checked out" window regardless of break state (it's merely `disabled`
   * while on break, not removed — see TodayAttendanceCard.tsx) — so it alone
   * is sufficient here. It deliberately does NOT combine with `resumeButton`
   * via `.or()`: while on break, BOTH are simultaneously present in the DOM,
   * and `expect(locatorA.or(locatorB)).toBeVisible()` throws a strict-mode
   * violation the moment more than one match exists.
   */
  async expectCheckedIn() {
    await expect(this.checkOutButton).toBeVisible();
  }

  private async isNotRecordedViewVisible(): Promise<boolean> {
    const results = await Promise.all([
      this.manualCheckInButton.isVisible().catch(() => false),
      this.workModeButton('WFH').isVisible().catch(() => false),
      this.workModeButton('ClientVisit').isVisible().catch(() => false),
      this.workModeButton('FieldWork').isVisible().catch(() => false),
      this.kioskOnlyAlert.isVisible().catch(() => false),
    ]);
    return results.some(Boolean);
  }

  /**
   * Attendance is one-check-in-per-user-per-day (UQ_attendance_..._user_date).
   * Tests against the shared `employeeSelf` persona must check this before
   * attempting a real check-in — see e2e/tests/attendance-checkin-checkout.spec.ts.
   * Defined as "the not-recorded view isn't showing" (rather than checking
   * for check-out/break controls) so it's correctly `true` both mid-day
   * (checked in, not yet out) AND once the day is fully complete — after a
   * real checkout, every button (Check Out, Break, Resume) disappears too,
   * which a check keyed on those buttons alone would misread as "not yet
   * checked in".
   */
  async isAlreadyCheckedInToday(): Promise<boolean> {
    await this.root.waitFor();
    return !(await this.isNotRecordedViewVisible());
  }

  async expectNotRecorded() {
    await expect.poll(() => this.isNotRecordedViewVisible()).toBe(true);
  }

  async expectOnBreak(onBreak: boolean) {
    if (onBreak) {
      await expect(this.resumeButton).toBeVisible();
      await expect(this.root.getByText('On Break')).toBeVisible();
    } else {
      await expect(this.breakButton).toBeVisible();
    }
  }
}
