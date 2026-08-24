import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The global bell/notifications dropdown in TopNav.tsx — mounted on every
 * authenticated page, not owned by any one routable module, so this lives in
 * pages/components/ per FRAMEWORK_GUIDELINES.md's shared-widget convention.
 *
 * The bell IconButton renders a bare lucide `<Bell>` icon with no
 * aria-label/Tooltip — there is no accessible name to key off. The one
 * reliable anchor is its fixed DOM position as the very next sibling after
 * the light/dark mode toggle IconButton, the same xpath idiom
 * tenant-auth-session.spec.ts already uses live (confirmed working there)
 * rather than inventing a second way to reach the same element.
 */
export class NotificationBell {
  readonly page: Page;
  readonly bellButton: Locator;
  readonly badge: Locator;
  readonly menu: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    // NOT the `getByRole('button', {name: /Switch to.../}).locator('xpath=following-sibling::button[1]')`
    // idiom tenant-auth-session.spec.ts uses for its own one-off pre-open
    // click: that role query re-resolves every time the locator is used, and
    // MUI stamps `aria-hidden="true"` on the app's #root (everything outside
    // the open Menu's portal) for as long as the dropdown is open — the
    // mode-toggle button drops out of the accessibility tree the moment the
    // menu opens, so any read of this locator taken AFTER open() (badgeCount(),
    // re-clicking, ...) would time out. Anchoring on the bell icon's own
    // stable CSS class instead is a plain DOM query, immune to aria-hidden,
    // and safe to re-resolve at any point in the open/closed lifecycle.
    this.bellButton = page.locator('button').filter({ has: page.locator('svg.lucide-bell') });
    // MUI's Badge always renders the `.MuiBadge-badge` span, even at
    // badgeContent={0} (just visually hidden via `invisible` — it still
    // exists in the DOM), so scope every read through badgeCount() below
    // rather than asserting visibility directly.
    this.badge = this.bellButton.locator('.MuiBadge-badge');
    this.menu = page.getByRole('menu').filter({ has: page.getByText('Notifications', { exact: true }) });
    this.emptyState = this.menu.getByText('No recent activity');
  }

  /** Opens the dropdown — TopNav.tsx's openNotifications() re-fetches GET /notifications on every open. */
  async open(): Promise<void> {
    await this.bellButton.click();
    await expect(this.menu).toBeVisible();
  }

  /**
   * Closes the dropdown WITHOUT clicking a specific notification (Escape, same
   * as a backdrop/outside click from the user's point of view) — MUI's Menu
   * `onClose` fires identically for both, and TopNav.tsx's closeNotifications()
   * unconditionally calls markNotificationsRead() as a side effect of ANY
   * close, not just an item click. This is the one idiom for proving that
   * implicit-mark-read behavior (NT-FN-07) independent of the deep-link click
   * path (NT-FN-04).
   *
   * TopNav.tsx's closeNotifications() calls handleMarkRead() WITHOUT awaiting
   * it before setNotifAnchor(null) — a genuine fire-and-forget request, not
   * something a UI-only wait (menu closed) can observe completion of. Waits
   * for the underlying POST /notifications/read response directly (same
   * `page.waitForResponse` idiom tenant-auth-session.spec.ts already uses for
   * this exact endpoint) so a caller's next read is never racing it.
   */
  async closeWithoutClicking(): Promise<void> {
    const readResponse = this.page.waitForResponse(
      (res) => res.url().includes('/api/notifications/read') && res.request().method() === 'POST',
    );
    await this.page.keyboard.press('Escape');
    await expect(this.menu).not.toBeVisible();
    await readResponse;
  }

  /** 0 when the Badge is invisible (no unread items) — MUI hides rather than removes it at count 0. */
  async badgeCount(): Promise<number> {
    const text = await this.badge.textContent();
    return text ? Number(text) : 0;
  }

  items(): Locator {
    return this.menu.getByRole('menuitem');
  }

  itemByMessage(message: string | RegExp): Locator {
    return this.items().filter({ hasText: message });
  }
}
