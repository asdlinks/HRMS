import { type Locator, type Page } from '@playwright/test';

/** Wraps client/src/platform-admin/pages/SystemHealthPage.tsx. */
export class PlatformAdminSystemHealthPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/platform-admin/system-health');
  }

  statCard(label: string): Locator {
    return this.page.locator('.MuiCard-root').filter({ hasText: label });
  }

  /** The StatCard's own value line (Typography variant="h4"), scoped to the
   * card matching `label` — reads the actual rendered text, not just the
   * card's presence, so a UI test can compare it against the API response
   * (after applying the page's own formatBytes/formatUptime formatting). */
  async statValue(label: string): Promise<string> {
    return (await this.statCard(label).locator('.MuiTypography-h4').innerText()).trim();
  }
}
