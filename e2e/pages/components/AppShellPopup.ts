import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Wraps the missed-checkin popup rendered by client/src/layout/AppShell.tsx.
 * It is a plain `Box`, not an MUI `Dialog` — no `role="dialog"` exists, so it
 * can't be located via getByRole('dialog'). The close (X) IconButton also
 * carries no accessible name. Both the card and its full-screen backdrop are
 * located structurally from the one piece of stable text the popup renders.
 */
export class AppShellPopup {
  readonly page: Page;
  readonly bodyText: Locator;
  readonly card: Locator;
  readonly backdrop: Locator;
  readonly closeButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.bodyText = page.getByText(/Tap here to start your day/);
    this.card = this.bodyText.locator('..');
    this.backdrop = this.card.locator('..');
    this.closeButton = this.card.getByRole('button');
  }

  async expectVisible() {
    await expect(this.bodyText).toBeVisible();
  }

  async expectHidden() {
    await expect(this.bodyText).toHaveCount(0);
  }

  greetingHeading(firstName: string): Locator {
    return this.card.getByRole('heading', { name: `Hello, ${firstName}!` });
  }

  /** Dismisses without navigating. */
  async dismissViaClose() {
    await this.closeButton.click();
  }

  /**
   * Clicking the backdrop dismisses AND navigates to /attendance. The card
   * is centered inside the backdrop and stops propagation, so a plain
   * `.click()` on the backdrop element would actually land on the card —
   * clicking a corner offset guarantees the real backdrop area is hit.
   */
  async dismissViaBackdropClick() {
    await this.backdrop.click({ position: { x: 10, y: 10 } });
  }

  /**
   * Waits briefly for the popup to appear and dismisses it (via close, never
   * backdrop — a module-agnostic hook has no business navigating a test to
   * /attendance) if it does. No-ops if it never shows up within `timeout` —
   * the persona is checked in, exempt from attendance, already dismissed it
   * this page load, or the current route is one AppShell itself excludes
   * (/attendance, /login). Safe to call any number of times: once dismissed,
   * `bodyText` is gone, so a repeat call's wait just times out and no-ops.
   *
   * The bounded wait (rather than an instant `isVisible()` check) is
   * intentional — `shouldShowPopup` depends on an async attendance/holiday/
   * settings fetch in AppShell.tsx that resolves shortly after the page's
   * `load` event, not synchronously with it.
   */
  async dismissIfPresent(timeout = 2000): Promise<void> {
    const appeared = await this.bodyText
      .waitFor({ state: 'visible', timeout })
      .then(() => true, () => false);
    if (!appeared) return;
    await this.dismissViaClose();
  }
}

/**
 * Installs a page-wide `load` listener that transparently dismisses the
 * AppShell missed-checkin popup after every full navigation, for the
 * lifetime of the page. This is the ONE place popup handling should be wired
 * up — see fixtures/auth.ts, the sole call site — so module page objects
 * (LeavesPage, ShiftsPage, etc.) never need any popup-dismissal logic of
 * their own. Fire-and-forget: a dismissal hiccup must never fail or hang the
 * test that's actually running.
 */
export function installAppShellPopupAutoDismiss(page: Page): void {
  page.on('load', () => {
    new AppShellPopup(page).dismissIfPresent().catch(() => {});
  });
}
