import { expect, type Locator, type Page } from '@playwright/test';

/** Wraps client/src/components/ui/ConfirmDialog.tsx — reused across Delete/Status-change/etc. */
export class ConfirmDialog {
  readonly page: Page;
  readonly root: Locator;

  constructor(page: Page, titlePattern: string | RegExp) {
    this.page = page;
    this.root = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: titlePattern }) });
  }

  async expectVisible() {
    await expect(this.root).toBeVisible();
  }

  async confirm(label: string | RegExp = /Confirm|Delete|Delete Permanently|Enable|Disable/) {
    await this.root.getByRole('button', { name: label }).click();
  }

  async cancel(label = 'Cancel') {
    await this.root.getByRole('button', { name: label }).click();
  }
}
