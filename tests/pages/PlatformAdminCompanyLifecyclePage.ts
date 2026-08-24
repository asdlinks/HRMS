import { type Locator, type Page } from '@playwright/test';

/**
 * Wraps client/src/platform-admin/pages/CompanyDetailPage.tsx's mutation
 * surfaces (Suspend/Reactivate/Reset Admin Password buttons + their shared
 * ConfirmDialog) — deliberately a SEPARATE page object from the frozen
 * pages/PlatformAdminCompanyDetailPage.ts (Phase 3/4, read-only surfaces
 * only; its own header comment explicitly excludes these). Never edit that
 * file for a Phase 5 need — add here instead.
 */
export class PlatformAdminCompanyLifecyclePage {
  readonly page: Page;

  readonly suspendButton: Locator;
  readonly reactivateButton: Locator;
  readonly resetAdminPasswordButton: Locator;

  readonly confirmDialog: Locator;
  readonly confirmDialogTitle: Locator;
  readonly confirmDialogDescription: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;

  readonly resetResultAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.suspendButton = page.getByRole('button', { name: 'Suspend' });
    this.reactivateButton = page.getByRole('button', { name: 'Reactivate' });
    this.resetAdminPasswordButton = page.getByRole('button', { name: 'Reset Admin Password' });

    this.confirmDialog = page.getByRole('dialog');
    this.confirmDialogTitle = this.confirmDialog.locator('.MuiDialogTitle-root');
    this.confirmDialogDescription = this.confirmDialog.locator('.MuiDialogContentText-root');
    // ConfirmDialog.tsx never overrides confirmLabel from CompanyDetailPage.tsx's
    // three call sites — the button's accessible name is always the default "Confirm".
    this.confirmButton = this.confirmDialog.getByRole('button', { name: 'Confirm' });
    this.cancelButton = this.confirmDialog.getByRole('button', { name: 'Cancel' });

    this.resetResultAlert = page.getByText(/New password for/);
  }

  async goto(id: number | string) {
    await this.page.goto(`/platform-admin/companies/${id}`);
  }
}
