import { type Locator, type Page } from '@playwright/test';

/**
 * Wraps client/src/components/companyDocuments/VersionHistoryDialog.tsx —
 * opened from CompanyDocumentsPage.tsx's AdminDocumentsView via the
 * "Version history" row action. Single module-owned dialog — lives in
 * e2e/pages/, not pages/components/.
 */
export class VersionHistoryDialog {
  readonly page: Page;
  readonly root: Locator;
  readonly closeButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('dialog').filter({ hasText: 'Version History' });
    this.closeButton = this.root.getByRole('button', { name: 'Close' });
  }

  async waitForOpen() {
    await this.root.waitFor({ state: 'visible' });
  }

  async expectClosed() {
    await this.root.waitFor({ state: 'hidden' });
  }

  /** Each version renders as `v{n} — {original_file_name}` (VersionHistoryDialog.tsx's ListItemText primary). */
  versionRow(versionNumber: number): Locator {
    return this.root.locator('li').filter({ hasText: new RegExp(`^v${versionNumber} —`) });
  }

  downloadButton(versionNumber: number): Locator {
    return this.versionRow(versionNumber).getByRole('button', { name: 'Download this version' });
  }

  async versionCount(): Promise<number> {
    return this.root.locator('li').count();
  }

  async close() {
    await this.closeButton.click();
  }
}
