import { expect, type Locator, type Page } from '@playwright/test';
import { assertSessionActive } from '../helpers/sessionGuard';
import { escapeRegex } from '../helpers/locators';

/** Wraps client/src/pages/reports/ReportsSavedPage.tsx (route `/reports/saved`). */
export class ReportsSavedPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Saved Reports' });
    this.emptyState = page.getByText('No saved filters yet');
  }

  async goto() {
    await this.page.goto('/reports/saved');
    assertSessionActive(this.page);
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  /** `name` is the saved filter's own name (e.g. from uniqueSavedFilterName()) — the row's accessible name concatenates it with the report title and saved date, so a plain substring match is safe without an anchor (see itemByName's doc comment for why a bare unanchored match can be unsafe with digit-suffixed names; saved-filter names here aren't looked up by a numeric-suffix scheme that collides the same way). */
  savedRow(name: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(escapeRegex(name)) });
  }

  deleteButtonFor(name: string): Locator {
    return this.savedRow(name).getByRole('button');
  }
}
