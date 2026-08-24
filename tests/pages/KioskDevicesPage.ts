import { expect, type Locator, type Page } from '@playwright/test';
import { rowByCellText } from '../helpers/locators';

/**
 * Wraps client/src/pages/KioskDevicesPage.tsx (route: /attendance/kiosk-devices).
 * Register-once/rotate-after — there is no Edit dialog, only rotate-key and
 * revoke/reactivate as separate row actions (KioskDeviceFormDialog.tsx's own
 * comment confirms this).
 */
export class KioskDevicesPage {
  readonly page: Page;
  readonly registerButton: Locator;
  readonly formDialog: Locator;
  readonly keyRevealDialog: Locator;
  readonly kioskUrlInput: Locator;
  readonly kioskUrlSaveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.registerButton = page.getByRole('button', { name: 'Register Device' });
    this.formDialog = page.getByRole('dialog').filter({ hasText: 'Register Kiosk Device' });
    this.keyRevealDialog = page.getByRole('dialog').filter({ hasText: /^Device Key —/ });
    this.kioskUrlInput = page.getByPlaceholder('https://kiosk.yourcompany.com');
    this.kioskUrlSaveButton = page.getByRole('button', { name: 'Save' });
  }

  async goto() {
    await this.page.goto('/attendance/kiosk-devices');
  }

  row(deviceName: string): Locator {
    return rowByCellText(this.page, deviceName, { exact: true });
  }

  async openRegister() {
    await this.registerButton.click();
  }

  async fillRegisterForm(fields: { deviceName?: string; locationName?: string }) {
    if (fields.deviceName !== undefined) await this.formDialog.getByLabel('Device name').fill(fields.deviceName);
    if (fields.locationName !== undefined) {
      await this.formDialog.locator('#mui-component-select-location_id').click();
      await this.page.getByRole('option', { name: fields.locationName, exact: true }).click();
    }
  }

  async submitRegister() {
    await this.formDialog.getByRole('button', { name: /^(Register Device|Registering…)$/ }).click();
  }

  async closeKeyReveal() {
    await this.keyRevealDialog.getByRole('button', { name: 'Done' }).click();
  }

  /** Registers a device end-to-end and dismisses the one-time key reveal dialog. */
  async registerDevice(deviceName: string) {
    await this.openRegister();
    await this.fillRegisterForm({ deviceName });
    await this.submitRegister();
    await expect(this.keyRevealDialog).toBeVisible();
    await this.closeKeyReveal();
  }

  async rotateKey(deviceName: string) {
    await this.row(deviceName).getByRole('button', { name: 'Rotate key' }).click();
    await expect(this.keyRevealDialog).toBeVisible();
  }

  async revoke(deviceName: string) {
    await this.row(deviceName).getByRole('button', { name: 'Revoke device' }).click();
    await this.page.getByRole('button', { name: 'Revoke' }).click();
  }

  async reactivate(deviceName: string) {
    await this.row(deviceName).getByRole('button', { name: 'Reactivate device' }).click();
  }

  async saveKioskUrl(url: string) {
    await this.kioskUrlInput.fill(url);
    await this.kioskUrlSaveButton.click();
  }

  async expectStatus(deviceName: string, status: 'Active' | 'Revoked') {
    await expect(this.row(deviceName).getByText(status, { exact: true })).toBeVisible();
  }
}
