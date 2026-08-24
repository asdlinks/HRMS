import { type Locator, type Page } from '@playwright/test';
import { soleButtonIn } from '../../helpers/locators';

/**
 * Wraps client/src/components/dashboard/AnnouncementsCard.tsx — the
 * identical widget embedded on both EmployeeDashboard and ManagerDashboard
 * (client/src/pages/EmployeeDashboard.tsx / ManagerDashboard.tsx), same
 * component, same data, same `hasPermission('announcements.manage')` gating
 * on both. Lives in pages/components/ (not pages/) per
 * FRAMEWORK_GUIDELINES.md's "appears inside multiple modules' pages" rule.
 *
 * Not routable on its own — the caller navigates (`page.goto('/dashboard')`)
 * before constructing this, same as every other embedded-widget usage in
 * this suite (see holidays-lifecycle.spec.ts's HL-FN-11 upcoming-holidays
 * widget check).
 */
export class AnnouncementsCard {
  readonly page: Page;
  readonly root: Locator;
  private readonly headerRow: Locator;
  readonly addToggleButton: Locator;
  readonly titleInput: Locator;
  readonly bodyInput: Locator;
  readonly postButton: Locator;

  constructor(page: Page) {
    this.page = page;
    const heading = page.getByText('Company Announcements', { exact: true });
    this.headerRow = heading.locator('..');
    this.root = this.headerRow.locator('..');
    // The Plus IconButton (opens the create form) is the header row's only
    // button, and only renders for a canManage holder.
    this.addToggleButton = soleButtonIn(this.headerRow);
    // Both fields carry MUI's `required` prop, which appends " *" to the
    // accessible name — same convention as LeavesPage.ts's startDateField.
    this.titleInput = this.root.getByLabel(/^Title\s*\*?$/);
    this.bodyInput = this.root.getByLabel(/^Message\s*\*?$/);
    this.postButton = this.root.getByRole('button', { name: /^Post announcement$/ });
  }

  async openCreateForm(): Promise<void> {
    await this.addToggleButton.click();
  }

  async fillCreateForm(data: { title: string; body: string }): Promise<void> {
    await this.titleInput.fill(data.title);
    await this.bodyInput.fill(data.body);
  }

  async submitCreateForm(): Promise<void> {
    await this.postButton.click();
  }

  /** A rendered announcement row, matched by its exact title text. */
  row(title: string): Locator {
    return this.root.getByText(title, { exact: true }).locator('../..');
  }

  /** The delete (Trash2) IconButton inside a given row — only rendered for a canManage holder. */
  deleteButtonFor(title: string): Locator {
    return soleButtonIn(this.row(title));
  }
}
