import { expect, type Locator, type Page } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly tenantCodeInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  /** The top-of-form `<Alert severity="error">` — surfaces the server's exact `error` message string (see client/src/types/index.ts's getErrorMessage). */
  readonly errorAlert: Locator;
  readonly forgotPasswordLink: Locator;
  /** The Collapse'd `<Alert severity="info">` the forgot-password link toggles — no self-service reset flow exists behind it. */
  readonly forgotPasswordInfoAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tenantCodeInput = page.getByLabel('Company Code');
    this.emailInput = page.getByLabel('Email Address');
    this.passwordInput = page.getByLabel('Password');
    this.signInButton = page.getByRole('button', { name: 'Sign In' });
    this.errorAlert = page.getByRole('alert').filter({ hasNotText: "Password resets aren't self-service" });
    this.forgotPasswordLink = page.getByRole('button', { name: 'Forgot your password?' });
    this.forgotPasswordInfoAlert = page.getByText("Password resets aren't self-service");
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(tenantCode: string, email: string, password: string) {
    await this.tenantCodeInput.fill(tenantCode);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async expectLoggedIn() {
    await expect(this.page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  }

  async expectLoginError() {
    // Failed login keeps the user on /login with an error snackbar; assert we
    // never navigated away rather than matching specific snackbar copy.
    await expect(this.page).toHaveURL(/\/login/);
  }

  /** Asserts the top-of-form error alert shows exactly this server-provided message. */
  async expectErrorMessage(text: string | RegExp) {
    await expect(this.errorAlert).toHaveText(text);
  }

  async clickForgotPassword() {
    await this.forgotPasswordLink.click();
  }

  /** The `email()` validation message react-hook-form + zodResolver renders under the Email field. */
  emailFormatError(): Locator {
    return this.page.getByText('Enter a valid email address');
  }
}
