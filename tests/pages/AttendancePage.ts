import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Wraps client/src/pages/AttendancePage.tsx ("Daily Check-In" route: /attendance).
 * Calendar day cells are wrapped in an MUI `Tooltip`; per the same fact
 * documented in EmployeesPage.ts (Tooltip's `describeChild` defaults to
 * false, so it sets `aria-label` on its child unconditionally), each day
 * cell's outer Box carries `aria-label="<statusText>"` (e.g. "2nd Saturday",
 * a holiday name, "Present — Manual") even though it's a plain div with no
 * implicit accessible role — hence the attribute-selector lookup below
 * rather than getByRole/getByLabel.
 */
export class AttendancePage {
  readonly page: Page;
  readonly presentDaysStat: Locator;
  readonly onLeaveStat: Locator;
  readonly absentDaysStat: Locator;
  readonly attendanceRateStat: Locator;
  readonly viewingForGroup: Locator;
  readonly exportButton: Locator;
  readonly onboardingBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.presentDaysStat = page.getByText('Present Days').locator('..');
    this.onLeaveStat = page.getByText('On Leave').locator('..');
    this.absentDaysStat = page.getByText('Absent Days').locator('..');
    this.attendanceRateStat = page.getByText('Attendance Rate').locator('..');
    this.viewingForGroup = page.getByText('Viewing for', { exact: true }).locator('..');
    this.exportButton = page.getByRole('button', { name: /^Export/ });
    this.onboardingBanner = page.getByText(/Welcome to the team/);
  }

  async goto() {
    await this.page.goto('/attendance');
  }

  /**
   * Visible only when the caller holds attendance.view.team. Bounded wait,
   * not an instant check — called right after `goto()`, the same
   * permission-gated-render race `helpers/guards.ts` documents.
   */
  async isViewingForSelectorVisible(): Promise<boolean> {
    return this.viewingForGroup.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  }

  async selectViewingFor(employeeName: string) {
    await this.viewingForGroup.getByRole('combobox').click();
    await this.page.getByRole('option', { name: employeeName, exact: true }).click();
  }

  async selectViewingForSelf() {
    await this.viewingForGroup.getByRole('combobox').click();
    await this.page.getByRole('option', { name: /^Self \(/ }).click();
  }

  /** Picks the first non-self option — use when the tenant's actual team roster isn't known ahead of time. */
  async selectViewingForFirstOption(): Promise<string> {
    await this.viewingForGroup.getByRole('combobox').click();
    const option = this.page.getByRole('option').nth(1); // index 0 is always "Self (…)"
    await expect(option).toBeVisible();
    const text = (await option.textContent()) ?? '';
    await option.click();
    return text;
  }

  /** Locates a calendar day cell by its rendered status/tooltip text (e.g. "2nd Saturday", "Sunday", a holiday name). */
  dayCellByStatus(statusText: string): Locator {
    return this.page.locator(`[aria-label="${statusText}"]`);
  }

  /** Same idea as `dayCellByStatus`, but a substring match — e.g. "Present" matches both "Present" and "Present — Manual". */
  dayCellContainingStatus(statusTextSubstring: string): Locator {
    return this.page.locator(`[aria-label*="${statusTextSubstring}"]`);
  }

  async clickExport() {
    await this.exportButton.click();
  }

  async expectStatVisible() {
    await expect(this.presentDaysStat).toBeVisible();
    await expect(this.onLeaveStat).toBeVisible();
    await expect(this.absentDaysStat).toBeVisible();
    await expect(this.attendanceRateStat).toBeVisible();
  }
}
