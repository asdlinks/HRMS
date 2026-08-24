import { expect, type Locator, type Page } from '@playwright/test';
import { assertSessionActive } from '../helpers/sessionGuard';
import { escapeRegex } from '../helpers/locators';

/** Wraps client/src/pages/reports/ReportsFavoritesPage.tsx (route `/reports/favorites`). */
export class ReportsFavoritesPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Favorite Reports' });
    this.emptyState = page.getByText('No favorites yet');
  }

  async goto() {
    await this.page.goto('/reports/favorites');
    assertSessionActive(this.page);
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  reportRow(title: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(escapeRegex(title)) });
  }
}
