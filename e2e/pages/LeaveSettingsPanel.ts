import { type Locator, type Page } from '@playwright/test';
import { Toast } from './components/Toast';
import { soleButtonIn } from '../helpers/locators';

/** Wraps the "Leave Allocations" section inside SettingsPage.tsx's "General Config" tab (route: /settings). */
export class LeaveSettingsPanel {
  readonly page: Page;
  readonly navItem: Locator;
  readonly addCategoryButton: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navItem = page.getByRole('button', { name: 'General Config' });
    this.addCategoryButton = page.getByRole('button', { name: 'Add Leave Category' });
    this.saveButton = page.getByRole('button', { name: /^(Save Configuration|Saving…)$/ });
  }

  /**
   * Navigates to Settings and opens the General Config tab if the nav item
   * is present (permission-gated). Waits (bounded) for the item to actually
   * appear rather than checking `isVisible()` immediately — same fix as
   * `skipUnlessVisible` in helpers/guards.ts: an instant check races
   * Settings' own permission-gated render and can miss a nav item the
   * persona genuinely has, not just correctly skip one they don't.
   */
  async goto() {
    await this.page.goto('/settings');
    const visible = await this.navItem.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    if (visible) {
      await this.navItem.click();
    }
  }

  private row(index: number): Locator {
    // Each allocation row is a Stack of [Type TextField, Max Days TextField, remove IconButton] — scoped by field position since rows share identical labels.
    return this.page.getByLabel('Type', { exact: true }).nth(index).locator('xpath=ancestor::*[3]');
  }

  typeField(index: number): Locator {
    return this.page.getByLabel('Type', { exact: true }).nth(index);
  }

  maxDaysField(index: number): Locator {
    return this.page.getByLabel('Max Days', { exact: true }).nth(index);
  }

  async rowCount(): Promise<number> {
    return this.page.getByLabel('Type', { exact: true }).count();
  }

  async addCategory() {
    await this.addCategoryButton.click();
  }

  async removeCategory(index: number) {
    await soleButtonIn(this.row(index)).click();
  }

  async fillRow(index: number, fields: { type?: string; days?: string }) {
    if (fields.type !== undefined) await this.typeField(index).fill(fields.type);
    if (fields.days !== undefined) await this.maxDaysField(index).fill(fields.days);
  }

  async addRow(type: string, days: string) {
    await this.addCategory();
    const index = (await this.rowCount()) - 1;
    await this.fillRow(index, { type, days });
  }

  async save() {
    await this.saveButton.click();
  }

  async expectSaved() {
    await new Toast(this.page).expectVisible('Settings saved successfully!');
  }
}
