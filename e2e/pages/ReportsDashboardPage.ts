import { expect, type Locator, type Page } from '@playwright/test';
import { assertSessionActive } from '../helpers/sessionGuard';

/** Wraps client/src/pages/reports/ReportsDashboard.tsx — the Analytics Center's landing page (route `/reports`). */
export class ReportsDashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  /** ReportsNav.tsx's single `<List>` — every nav link's own name (Dashboard/Employees/Payroll/...)
   * also exists as a TopNav banner link elsewhere on the page, so every nav-link lookup below
   * must be scoped to this list rather than a bare page-wide getByRole('link', {name}). */
  readonly navList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Executive Dashboard' });
    this.navList = page.getByRole('list');
  }

  async goto() {
    await this.page.goto('/reports');
    assertSessionActive(this.page);
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  statCard(label: string): Locator {
    return this.page.getByText(label, { exact: true });
  }

  workspaceLink(label: string): Locator {
    return this.page.getByText(label, { exact: true });
  }

  async openWorkspace(label: string) {
    await this.workspaceLink(label).click();
  }

  get navDashboardLink(): Locator {
    return this.navList.getByRole('link', { name: 'Dashboard', exact: true });
  }

  get navFavoritesLink(): Locator {
    return this.navList.getByRole('link', { name: /Favorites/ });
  }

  get navSavedLink(): Locator {
    return this.navList.getByRole('link', { name: 'Saved Reports', exact: true });
  }

  navCategoryLink(label: string): Locator {
    return this.navList.getByRole('link', { name: label, exact: true });
  }
}
