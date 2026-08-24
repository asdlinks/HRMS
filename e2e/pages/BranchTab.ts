import { expect, type Locator, type Page } from '@playwright/test';
import { itemByName, soleButtonIn } from '../helpers/locators';

export interface BranchFormFields {
  name?: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  active?: boolean;
}

/** Wraps client/src/components/organization/BranchTab.tsx (the "Branches" tab of /organization). */
export class BranchTab {
  readonly page: Page;
  readonly newButton: Locator;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newButton = page.getByRole('button', { name: 'New Branch' });
    this.dialog = page.getByRole('dialog').filter({ hasText: /(New|Edit) Branch/ });
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

  async fill(fields: BranchFormFields) {
    if (fields.name !== undefined) await this.dialog.getByLabel('Name').fill(fields.name);
    if (fields.code !== undefined) await this.dialog.getByLabel('Code').fill(fields.code);
    if (fields.address !== undefined) await this.dialog.getByLabel('Address').fill(fields.address);
    if (fields.city !== undefined) await this.dialog.getByLabel('City').fill(fields.city);
    if (fields.state !== undefined) await this.dialog.getByLabel('State').fill(fields.state);
    if (fields.country !== undefined) await this.dialog.getByLabel('Country').fill(fields.country);
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
