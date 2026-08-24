import { expect, type Locator, type Page } from '@playwright/test';

/** Wraps client/src/pages/EmployeeProfilePage.tsx (route /profile/:userId). */
export class EmployeeProfilePage {
  readonly page: Page;
  readonly backButton: Locator;
  readonly sendEmailButton: Locator;
  readonly overviewTab: Locator;
  readonly attendanceTab: Locator;
  readonly leaveHistoryTab: Locator;
  readonly notFoundState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.backButton = page.getByRole('button', { name: 'Back' });
    this.sendEmailButton = page.getByRole('link', { name: 'Send Email' });
    this.overviewTab = page.getByRole('tab', { name: 'Overview' });
    this.attendanceTab = page.getByRole('tab', { name: 'Attendance' });
    this.leaveHistoryTab = page.getByRole('tab', { name: 'Leave History' });
    this.notFoundState = page.getByText('User not found');
  }

  async goto(userId: number | string) {
    await this.page.goto(`/profile/${userId}`);
  }

  infoRow(label: string): Locator {
    return this.page.getByText(label, { exact: true }).locator('..').getByText(/./).last();
  }

  async expectInfoValue(label: string, value: string) {
    const row = this.page.getByText(label, { exact: true }).locator('..');
    await expect(row).toContainText(value);
  }

  aadhaarRow(): Locator {
    return this.page.getByText('Aadhaar Number', { exact: true });
  }

  panRow(): Locator {
    return this.page.getByText('PAN Number', { exact: true });
  }

  async expectAadhaarPanHidden() {
    await expect(this.aadhaarRow()).toHaveCount(0);
    await expect(this.panRow()).toHaveCount(0);
  }

  async expectNotFound() {
    await expect(this.notFoundState).toBeVisible();
  }
}
