import { test, expect } from '../fixtures/auth';
import { createEmployee } from '../helpers/seed';
import { rawLogin } from '../helpers/tenantAuth';
import { LoginPage } from '../pages/LoginPage';
import { TENANT_CODE } from '../fixtures/personas';
import { SQL_INJECTION_PAYLOADS } from '../fixtures/test-data';

/**
 * docs/TenantAuth_TestCases.csv — Login (TA-FN-01, TA-NG-01/02/04/05/06/07/14,
 * TA-BD-01, TA-VD-01, TA-UI-01/02, TA-SC-06/08). TA-NG-13/TA-BD-02 (the
 * 21-attempt IP rate-limit boundary) live in their own
 * tenant-auth-rate-limit.spec.ts, deliberately kept out of this file — see
 * that file's header for why.
 *
 * This is the one file in the suite allowed to call POST /api/auth/login
 * directly (helpers/tenantAuth.ts's header explains why — every other module
 * must keep using the adminPage/managerPage/... fixtures instead). Every
 * request here still counts against the server's IP-scoped login rate
 * limiter (20 requests / 15 min — server/routes/auth.routes.js), on top of
 * whatever this same IP's persona-fixture logins cost elsewhere in a full
 * suite run (playwright.config.ts: workers × up-to-5 personas). This file
 * makes ~17 login attempts total plus one `adminPage` fixture login;
 * comfortably under budget on its own, but combined with a full `npm run
 * e2e` pass's own fixture-login cost it can push the shared IP over 20 and
 * produce spurious 429s in unrelated modules. Prefer running this file in
 * relative isolation (`npx playwright test tenant-auth-login.spec.ts`)
 * rather than folded into a full regression pass.
 *
 * `test.describe.configure({ mode: 'serial' })` keeps every test below in
 * one worker, one at a time — necessary so this file's own requests don't
 * race each other against the same IP counter.
 */
test.describe('Tenant Auth — Login', () => {
  test.describe.configure({ mode: 'serial' });

  test('TA-FN-01: valid tenantCode/email/password returns an access token and sets the httpOnly refresh cookie', { tag: ['@smoke', '@regression'] }, async ({ adminPage, browser }) => {
    const emp = await createEmployee(adminPage);
    const context = await browser.newContext();
    try {
      const response = await rawLogin(context.request, { email: emp.email, password: emp.password });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(typeof body.accessToken).toBe('string');
      expect(body.accessToken.length).toBeGreaterThan(0);

      const cookies = await context.cookies();
      const refreshCookie = cookies.find((c) => c.name === 'mywe_refresh_token');
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie!.httpOnly).toBe(true);
      expect(refreshCookie!.path).toBe('/api/auth');
    } finally {
      await context.close();
    }
  });

  test('TA-NG-01: a missing tenantCode, email, or password each return 400', { tag: ['@regression'] }, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      for (const missing of ['tenantCode', 'email', 'password'] as const) {
        const data: Record<string, string | undefined> = { tenantCode: TENANT_CODE, email: 'someone@example.test', password: 'irrelevant' };
        data[missing] = undefined;
        const response = await rawLogin(context.request, data);
        expect(response.status(), `missing ${missing}`).toBe(400);
        expect((await response.json()).error).toBe('Company code, email and password are required');
      }
    } finally {
      await context.close();
    }
  });

  test('TA-NG-02: an unknown tenantCode returns the generic invalid-credentials message', { tag: ['@regression'] }, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const response = await rawLogin(context.request, { tenantCode: `no-such-tenant-${Date.now()}`, email: 'someone@example.test', password: 'irrelevant' });
      expect(response.status()).toBe(401);
      // Same exact string TA-NG-04/TA-NG-07 assert below — the CSV's account-
      // enumeration-resistance claim (TA-SC-06) is that all three are
      // byte-identical, not merely "some 401 happened".
      expect((await response.json()).error).toBe('Invalid company code, email or password');
    } finally {
      await context.close();
    }
  });

  test('TA-NG-04: an unknown email within a valid tenant returns the identical generic message (TA-SC-06)', { tag: ['@regression'] }, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const response = await rawLogin(context.request, { email: `no-such-user-${Date.now()}@example.test`, password: 'irrelevant' });
      expect(response.status()).toBe(401);
      expect((await response.json()).error).toBe('Invalid company code, email or password');
    } finally {
      await context.close();
    }
  });

  test('TA-NG-05: a disabled user is rejected with a distinct 403, not the generic invalid-credentials message', { tag: ['@regression'] }, async ({ adminPage, browser }) => {
    const emp = await createEmployee(adminPage);
    const users = await (await adminPage.request.get('/api/users')).json();
    const user = users.find((u: { email: string }) => u.email === emp.email);
    expect(user).toBeDefined();
    const statusResponse = await adminPage.request.patch(`/api/users/${user.id}/status`, { data: { status: 'disabled' } });
    expect(statusResponse.ok()).toBeTruthy();

    const context = await browser.newContext();
    try {
      const response = await rawLogin(context.request, { email: emp.email, password: emp.password });
      expect(response.status()).toBe(403);
      expect((await response.json()).error).toBe('This account has been disabled. Contact your administrator.');
    } finally {
      await context.close();
    }
  });

  test('TA-NG-06 / TA-BD-01 / TA-NG-07 / TA-SC-07: 5 failed attempts leave the account open, the 6th locks it independently of the IP limiter', { tag: ['@regression'] }, async ({ adminPage, browser }) => {
    const emp = await createEmployee(adminPage);
    const context = await browser.newContext();
    try {
      // TA-BD-01: auth.repository.js's registerFailedLogin() sets
      // locked_until as a side effect of the request that crosses
      // MAX_FAILED_LOGIN_ATTEMPTS (5) — but that same request's own response
      // is decided from the *pre*-update locked_until, so it still correctly
      // reports "wrong password". The lock only becomes visible starting the
      // NEXT request. All 5 of these therefore return 401, not just the
      // first 4 — confirmed live against auth.repository.js's actual
      // read-then-write order, not an assumption.
      for (let attempt = 1; attempt <= 5; attempt++) {
        const response = await rawLogin(context.request, { email: emp.email, password: 'wrong-password' });
        expect(response.status(), `attempt ${attempt} should not yet lock the account`).toBe(401);
        expect((await response.json()).error).toBe('Invalid company code, email or password'); // TA-NG-07
      }

      // The 6th request is the first one processed with locked_until already
      // in the future — a 429 with the per-account lockout message, distinct
      // from the IP-rate-limit 429 (tenant-auth-rate-limit.spec.ts) despite
      // the same status code. Only 6 of the shared IP's budget are spent
      // getting here, proving this fired from account-level lockout, not the
      // IP limiter (TA-SC-07: the two layers trip independently of each
      // other).
      const sixth = await rawLogin(context.request, { email: emp.email, password: 'wrong-password' });
      expect(sixth.status()).toBe(429);
      expect((await sixth.json()).error).toBe('Too many failed login attempts. Please try again in a few minutes.');

      // Locked out even with the correct password.
      const seventh = await rawLogin(context.request, { email: emp.email, password: emp.password });
      expect(seventh.status()).toBe(429);
      expect((await seventh.json()).error).toBe('Too many failed login attempts. Please try again in a few minutes.');
    } finally {
      await context.close();
    }
  });

  test('TA-NG-14 / TA-VD-01: a malformed email posted directly to the API is not rejected by format', { tag: ['@regression'] }, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const response = await rawLogin(context.request, { email: 'not-an-email', password: 'irrelevant' });
      // Confirmed gap: /login has no Zod schema, only a truthy-presence
      // check — a syntactically invalid email reaches the DB lookup and
      // fails there (401), it is never rejected as a 400 format error.
      expect(response.status()).toBe(401);
      expect((await response.json()).error).toBe('Invalid company code, email or password');
    } finally {
      await context.close();
    }
  });

  test('TA-SC-08: SQL injection payloads in the email field are treated as literal, non-matching credentials', { tag: ['@regression'] }, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      for (const payload of SQL_INJECTION_PAYLOADS) {
        const response = await rawLogin(context.request, { email: payload, password: 'irrelevant' });
        expect(response.status(), payload).toBe(401);
        expect((await response.json()).error).toBe('Invalid company code, email or password');
      }
    } finally {
      await context.close();
    }
  });

  test('TA-UI-01: a malformed email is blocked client-side before any request is sent', { tag: ['@regression'] }, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const login = new LoginPage(page);
      await login.goto();
      await login.tenantCodeInput.fill(TENANT_CODE);
      await login.emailInput.fill('not-an-email');
      await login.passwordInput.fill('irrelevant');

      let loginRequestFired = false;
      page.on('request', (req) => {
        if (req.url().includes('/auth/login')) loginRequestFired = true;
      });
      await login.signInButton.click();
      await expect(login.emailFormatError()).toBeVisible();
      expect(loginRequestFired).toBe(false);
    } finally {
      await context.close();
    }
  });

  test('TA-UI-02 / TA-SC-02: "Forgot your password?" only expands an info alert — no self-service reset flow exists', { tag: ['@regression'] }, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const login = new LoginPage(page);
      await login.goto();
      await expect(login.forgotPasswordInfoAlert).toBeHidden();
      await login.clickForgotPassword();
      await expect(login.forgotPasswordInfoAlert).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
