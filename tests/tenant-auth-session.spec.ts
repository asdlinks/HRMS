import { test, expect } from '../fixtures/auth';
import { createEmployee } from '../helpers/seed';
import { rawLogin, rawRefresh, rawLogout, logoutViaUi } from '../helpers/tenantAuth';
import { LoginPage } from '../pages/LoginPage';
import { TENANT_CODE } from '../fixtures/personas';
import { installAppShellPopupAutoDismiss } from '../pages/components/AppShellPopup';

/**
 * docs/TenantAuth_TestCases.csv — Refresh/Logout/Session security
 * (TA-FN-02/03, TA-NG-08/09/10, TA-SC-03/04/05, TA-UI-03/04/05, TA-PF-02).
 * /auth/refresh and /auth/logout are NOT behind the login rate limiter
 * (server/routes/auth.routes.js), so — unlike tenant-auth-login.spec.ts —
 * this file's own requests don't compete for that 20/15min budget. Each
 * test still needs exactly one real /auth/login call per disposable
 * employee it creates; comfortably inside budget for a standalone run of
 * this file.
 */
test.describe('Tenant Auth — Session (refresh/logout/security)', () => {
  test('TA-FN-02: refresh with a valid cookie rotates the token and issues a new access token', { tag: ['@smoke', '@regression'] }, async ({ adminPage, browser }) => {
    const emp = await createEmployee(adminPage);
    const context = await browser.newContext();
    try {
      const loginRes = await rawLogin(context.request, { email: emp.email, password: emp.password });
      expect(loginRes.status()).toBe(200);

      const refreshRes = await rawRefresh(context.request);
      expect(refreshRes.status()).toBe(200);
      const body = await refreshRes.json();
      expect(typeof body.accessToken).toBe('string');
      expect(body.accessToken.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test('TA-FN-03: logout revokes the refresh token server-side and clears the cookie', { tag: ['@smoke', '@regression'] }, async ({ adminPage, browser }) => {
    const emp = await createEmployee(adminPage);
    const context = await browser.newContext();
    try {
      await rawLogin(context.request, { email: emp.email, password: emp.password });

      const logoutRes = await rawLogout(context.request);
      expect(logoutRes.status()).toBe(200);
      expect(await logoutRes.json()).toEqual({ success: true });

      const afterLogout = await rawRefresh(context.request);
      expect(afterLogout.status()).toBe(401);
    } finally {
      await context.close();
    }
  });

  test('TA-NG-08: refreshing with no cookie present returns 401 "Not authenticated"', { tag: ['@regression'] }, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const response = await rawRefresh(context.request);
      expect(response.status()).toBe(401);
      expect((await response.json()).error).toBe('Not authenticated');
    } finally {
      await context.close();
    }
  });

  test('TA-NG-09: refreshing with an unknown/never-issued token returns 401 "Session expired"', { tag: ['@regression'] }, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const response = await rawRefresh(context.request, 'mywe_refresh_token=totally-unknown-token-value');
      expect(response.status()).toBe(401);
      expect((await response.json()).error).toBe('Session expired, please log in again');
    } finally {
      await context.close();
    }
  });

  test('TA-NG-10 / TA-SC-03: replaying an already-rotated refresh token revokes every session for that user (theft detection)', { tag: ['@regression'] }, async ({ adminPage, browser }) => {
    const emp = await createEmployee(adminPage);
    const context = await browser.newContext();
    try {
      await rawLogin(context.request, { email: emp.email, password: emp.password });
      const originalCookie = (await context.cookies()).find((c) => c.name === 'mywe_refresh_token')!.value;

      const rotate = await rawRefresh(context.request); // jar now holds the newly-rotated cookie
      expect(rotate.status()).toBe(200);

      // Replay the ORIGINAL (now-revoked) value explicitly — the jar's own
      // (already-rotated) cookie must not be what actually gets sent here.
      const replay = await rawRefresh(context.request, `mywe_refresh_token=${originalCookie}`);
      expect(replay.status()).toBe(401);
      expect((await replay.json()).error).toBe('Session invalidated, please log in again');

      // Theft detection kills EVERY session for this user — even the cookie
      // that legitimately won the rotation a moment ago is dead now too.
      const afterTheft = await rawRefresh(context.request);
      expect(afterTheft.status()).toBe(401);
    } finally {
      await context.close();
    }
  });

  test('TA-SC-04: the refresh cookie is httpOnly, scoped to /api/auth, and its secure/sameSite pairing matches the server\'s production branch', { tag: ['@regression'] }, async ({ adminPage, browser }) => {
    const emp = await createEmployee(adminPage);
    const context = await browser.newContext();
    try {
      await rawLogin(context.request, { email: emp.email, password: emp.password });
      const cookie = (await context.cookies()).find((c) => c.name === 'mywe_refresh_token');
      expect(cookie).toBeDefined();
      expect(cookie!.httpOnly).toBe(true);
      expect(cookie!.path).toBe('/api/auth');
      // secure and sameSite are set together by the same isProduction branch
      // (refreshCookieOptions() in auth.routes.js) — assert the pairing
      // rather than one hardcoded value, since this suite doesn't control
      // whether the deployed environment's NODE_ENV is literally 'production'.
      if (cookie!.secure) {
        expect(cookie!.sameSite).toBe('None');
      } else {
        expect(cookie!.sameSite).toBe('Lax');
      }
    } finally {
      await context.close();
    }
  });

  test('TA-SC-05: an access token issued before logout remains valid against a protected route until its own expiry', { tag: ['@regression'] }, async ({ adminPage, browser }) => {
    const emp = await createEmployee(adminPage);
    const context = await browser.newContext();
    try {
      const loginRes = await rawLogin(context.request, { email: emp.email, password: emp.password });
      const { accessToken } = await loginRes.json();

      const logoutRes = await rawLogout(context.request);
      expect(logoutRes.status()).toBe(200);

      // Confirmed gap: the access token is a stateless, signature-verified
      // JWT — logout only kills the refresh chain (proven above/in
      // TA-FN-03), so the still-unexpired access token keeps working.
      const stillWorks = await context.request.get('/api/notifications', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(stillWorks.status()).toBe(200);
    } finally {
      await context.close();
    }
  });

  test('TA-UI-03: no access token is ever written to localStorage or sessionStorage', { tag: ['@regression'] }, async ({ adminPage, browser }) => {
    const emp = await createEmployee(adminPage);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      // This raw context bypasses fixtures/auth.ts's usePersonaPage() (needs
      // an anonymous/fresh context, not a persona), so the shared missed-
      // checkin-popup auto-dismiss it normally wires in never gets installed
      // — wire it explicitly here instead of adding one-off dismissal logic
      // (see AppShellPopup.ts's own guidance on this exact gap).
      installAppShellPopupAutoDismiss(page);
      const login = new LoginPage(page);
      await login.goto();
      const [loginResponse] = await Promise.all([
        page.waitForResponse((res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST'),
        login.login(TENANT_CODE, emp.email, emp.password),
      ]);
      const { accessToken } = await loginResponse.json();
      await login.expectLoggedIn();

      const storageDump = await page.evaluate(() => JSON.stringify({ ls: { ...localStorage }, ss: { ...sessionStorage } }));
      expect(storageDump).not.toContain(accessToken);
    } finally {
      await context.close();
    }
  });

  test('TA-UI-04: a 401 mid-session triggers exactly one silent /auth/refresh, then transparently retries', { tag: ['@regression'] }, async ({ adminPage, browser }) => {
    const emp = await createEmployee(adminPage);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      // This raw context bypasses fixtures/auth.ts's usePersonaPage() (needs
      // an anonymous/fresh context, not a persona), so the shared missed-
      // checkin-popup auto-dismiss it normally wires in never gets installed
      // — wire it explicitly here instead of adding one-off dismissal logic
      // (see AppShellPopup.ts's own guidance on this exact gap).
      installAppShellPopupAutoDismiss(page);
      const login = new LoginPage(page);
      await login.goto();
      await login.login(TENANT_CODE, emp.email, emp.password);
      await login.expectLoggedIn();

      let firstAttempt = true;
      await page.route('**/api/notifications*', async (route) => {
        if (firstAttempt) {
          firstAttempt = false;
          await route.fulfill({ status: 401, json: { error: 'Invalid or expired token' } });
        } else {
          await route.continue();
        }
      });

      const refreshRequest = page.waitForRequest((req) => req.url().includes('/api/auth/refresh') && req.method() === 'POST');
      // The theme-toggle button is the one reliably-labelled IconButton
      // immediately before the (unlabelled) notification bell in TopNav —
      // see e2e/README.md's own note that a few icon-only buttons in this
      // codebase have no accessible name and need a structural locator.
      const bellButton = page.getByRole('button', { name: /Switch to (dark|light) mode/ }).locator('xpath=following-sibling::button[1]');
      await bellButton.click(); // re-fetches notifications, hitting the mocked 401 once
      await refreshRequest;

      // The interceptor retried transparently — the notifications menu still opens normally afterward.
      await expect(page.getByText('Notifications', { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('TA-UI-05: logout clears local session state even when the logout API call itself fails', { tag: ['@regression'] }, async ({ adminPage, browser }) => {
    const emp = await createEmployee(adminPage);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      // This raw context bypasses fixtures/auth.ts's usePersonaPage() (needs
      // an anonymous/fresh context, not a persona), so the shared missed-
      // checkin-popup auto-dismiss it normally wires in never gets installed
      // — wire it explicitly here instead of adding one-off dismissal logic
      // (see AppShellPopup.ts's own guidance on this exact gap).
      installAppShellPopupAutoDismiss(page);
      const login = new LoginPage(page);
      await login.goto();
      await login.login(TENANT_CODE, emp.email, emp.password);
      await login.expectLoggedIn();

      await page.route('**/api/auth/logout', (route) => route.abort());
      await logoutViaUi(page);

      // AuthContext.logout()'s `finally` clears user/permissions regardless
      // of the aborted API call — ProtectedRoute reacts to user becoming
      // null and redirects here even though the logout request never
      // actually succeeded.
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    } finally {
      await context.close();
    }
  });

  test('TA-PF-02: two concurrent refresh calls presenting the same token — exactly one rotates cleanly', { tag: ['@regression'] }, async ({ adminPage, browser }) => {
    const emp = await createEmployee(adminPage);
    const context = await browser.newContext();
    try {
      await rawLogin(context.request, { email: emp.email, password: emp.password });
      const sharedCookie = (await context.cookies()).find((c) => c.name === 'mywe_refresh_token')!.value;

      const [first, second] = await Promise.all([
        rawRefresh(context.request, `mywe_refresh_token=${sharedCookie}`),
        rawRefresh(context.request, `mywe_refresh_token=${sharedCookie}`),
      ]);
      const statuses = [first.status(), second.status()].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 401]);
    } finally {
      await context.close();
    }
  });
});
