import { expect, type Locator, type Page } from '@playwright/test';
import { itemByName, soleButtonIn } from '../helpers/locators';

export interface LookupFormFields {
  name?: string;
  code?: string;
  description?: string;
  active?: boolean;
}

/**
 * Wraps client/src/components/organization/LookupTab.tsx — the generic CRUD
 * list shared by Designations and Employment Types. `entityLabel` must match
 * the singular label passed to the component ("Designation" / "Employment Type"),
 * since button/dialog text is built from it (e.g. "New Designation").
 */
export class LookupTab {
  readonly page: Page;
  readonly entityLabel: string;
  readonly newButton: Locator;
  readonly dialog: Locator;

  constructor(page: Page, entityLabel: string) {
    this.page = page;
    this.entityLabel = entityLabel;
    this.newButton = page.getByRole('button', { name: `New ${entityLabel}` });
    this.dialog = page.getByRole('dialog').filter({ hasText: new RegExp(`(New|Edit) ${entityLabel}`) });
  }

  listItem(name: string): Locator {
    return itemByName(this.page, name);
  }

  async openAdd() {
    await this.newButton.click();
  }

  async openEdit(name: string) {
    await this.listItem(name).click();
  }

  async deleteItem(name: string) {
    await soleButtonIn(this.listItem(name)).click();
  }

  async fill(fields: LookupFormFields) {
    if (fields.name !== undefined) await this.dialog.getByLabel('Name').fill(fields.name);
    if (fields.code !== undefined) await this.dialog.getByLabel('Code').fill(fields.code);
    if (fields.description !== undefined) await this.dialog.getByLabel('Description').fill(fields.description);
    if (fields.active !== undefined) await this.dialog.getByLabel('Active').setChecked(fields.active);
  }

  async submit() {
    await this.dialog.getByRole('button', { name: /^(Create|Save Changes)$/ }).click();
  }

  async cancel() {
    await this.dialog.getByRole('button', { name: 'Cancel' }).click();
  }

  async expectDialogClosed() {
    await expect(this.dialog).toHaveCount(0);
  }

  async expectListItemAbsent(name: string) {
    await expect(this.listItem(name)).toHaveCount(0);
  }
}
