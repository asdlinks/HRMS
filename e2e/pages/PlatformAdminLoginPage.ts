import { type Locator, type Page } from '@playwright/test';

/** Wraps client/src/platform-admin/pages/PlatformAdminLogin.tsx. */
export class PlatformAdminLoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  /** The page's own persistent inline `<Alert severity="error">` for a
   * server-side login failure (401/429) — a different UI primitive from the
   * shared notistack Toast component (pages/components/Toast.ts), which this
   * page does not use for login errors. Keeps its own locator, same
   * convention as EmployeesPage.employeeLimitBanner / LeaveCancellationPage.inlineAlert. */
  readonly serverErrorAlert: Locator;
  /** react-hook-form + zod client-side validation messages — exact strings
   * from PlatformAdminLogin.tsx's own zod schema (PA-UI-01/PA-UI-02). */
  readonly invalidEmailHelperText: Locator;
  readonly passwordRequiredHelperText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email Address');
    this.passwordInput = page.getByLabel('Password');
    this.signInButton = page.getByRole('button', { name: /Sign In|Signing in/ });
    this.serverErrorAlert = page.getByRole('alert');
    this.invalidEmailHelperText = page.getByText('Enter a valid email address', { exact: true });
    this.passwordRequiredHelperText = page.getByText('Password is required', { exact: true });
  }

  async goto() {
    await this.page.goto('/platform-admin/login');
  }

  async fillEmail(value: string) {
    await this.emailInput.fill(value);
  }

  async fillPassword(value: string) {
    await this.passwordInput.fill(value);
  }

  async submit() {
    await this.signInButton.click();
  }

  /** Fills both fields and submits — the common case for a full login attempt. */
  async login(email: string, password: string) {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
  }
}
