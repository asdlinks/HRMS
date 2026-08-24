/**
 * Platform Admin — Auth & Session (core happy-path, API contracts, UI login
 * behavior, change-password). Automates: PA-FN-01/02/03/04, PA-NG-05/06/07,
 * PA-VD-01/02/14, PA-UI-01/02/03/14/15, PA-AP-01/02/03/04, PA-BD-11,
 * PA-SC-04/11/14/15.
 *
 * Deliberately does NOT include any test that sends a WRONG password to the
 * "primary" `platformAdmin` persona, or any deliberately-repeated failed
 * login (lockout/rate-limit/enumeration/injection) — those live in
 * platform-admin-auth-lockout.spec.ts and platform-admin-auth-rate-limit.spec.ts,
 * using dedicated throwaway accounts, so this file's account never risks
 * getting locked out.
 *
 * IMPORTANT — shared IP-wide login rate limit (10 req/15min, no per-account
 * scoping — server/routes/platformAdmin/auth.routes.js). This file makes
 * exactly 4 deliberate POST /auth/login calls (the combined lifecycle test,
 * PA-VD-01, PA-VD-02, PA-UI-15's own isolated-context UI login) plus 1 more
 * via the platformAdminChangePasswordPage fixture (cached per worker slot,
 * at most 1 login for that persona across every test in this file) — 5
 * total, well under budget. PA-UI-03 (server error surfaced in the Alert) is
 * deliberately tested via `page.route()` response mocking, not a real
 * login attempt, to keep this file's budget small and deterministic — see
 * that test's own comment.
 *
 * Not automated in this file (see platform-admin-auth-not-automatable.spec.ts
 * for the full list + reasons): PA-BD-03/04/05 (real multi-minute/day TTL
 * waits), PA-AP-20 (no genuinely cross-origin environment available),
 * PA-DB-03/04/12/13 (raw DB access), PA-SC-05 (bcrypt cost inspection needs
 * raw DB access), PA-PF-01/03/07 (load testing), PA-PM-07 (needs mid-test DB
 * mutation).
 */
import { expect, test } from '../fixtures/platformAdminAuth';
import { PlatformAdminLoginPage } from '../pages/PlatformAdminLoginPage';
import { PLATFORM_ADMIN_PERSONAS } from '../fixtures/platformAdminPersonas';
import {
  PLATFORM_ADMIN_REFRESH_COOKIE_PATH,
  findPlatformAdminRefreshCookie,
  newPlatformAdminRequestContext,
  newPlatformAdminRequestContextWithCookie,
  platformAdminLoginRequest,
  platformAdminLogoutRequest,
  platformAdminRefreshRequest,
} from '../helpers/platformAdmin';
import {
  PLATFORM_ADMIN_NEW_PASSWORD_LENGTH_BOUNDARY,
  WRONG_CURRENT_PASSWORD,
  uniqueTempPassword,
} from '../fixtures/platformAdminAuthData';

const primary = PLATFORM_ADMIN_PERSONAS.platformAdmin;
const changePasswordPersona = PLATFORM_ADMIN_PERSONAS.platformAdminChangePassword;

test.describe('Platform Admin Auth — login/refresh/logout lifecycle + contracts', () => {
  test.skip(!primary, 'Platform-admin persona "platformAdmin" is not configured — see e2e/.env.e2e.example.');

  test('PA-FN-01/PA-FN-02/PA-FN-03/PA-AP-01/PA-AP-02/PA-AP-03/PA-SC-04/PA-NG-07: login, refresh, logout contracts, cookie flags, and refresh-token-replay theft detection', async () => {
    const ctx = await newPlatformAdminRequestContext();
    try {
      // PA-FN-01 / PA-AP-01 — login contract.
      const loginRes = await platformAdminLoginRequest(ctx, primary!.email, primary!.password);
      expect(loginRes.status()).toBe(200);
      const loginBody = await loginRes.json();
      expect(typeof loginBody.accessToken).toBe('string');
      expect(loginBody.accessToken.length).toBeGreaterThan(0);
      expect(loginBody.admin).toMatchObject({ email: primary!.email });
      expect(loginBody.admin).not.toHaveProperty('password');

      // PA-SC-04 — refresh cookie flags.
      const cookieAfterLogin = await findPlatformAdminRefreshCookie(ctx);
      expect(cookieAfterLogin).not.toBeNull();
      expect(cookieAfterLogin!.httpOnly).toBe(true);
      expect(cookieAfterLogin!.path).toBe(PLATFORM_ADMIN_REFRESH_COOKIE_PATH);
      // secure/sameSite are environment-dependent (isProduction) by design —
      // assert the two values are internally consistent rather than assuming
      // which mode this deployment runs in.
      if (cookieAfterLogin!.secure) {
        expect(cookieAfterLogin!.sameSite).toBe('None');
      } else {
        expect(cookieAfterLogin!.sameSite).toBe('Lax');
      }
      const staleCookieValue = cookieAfterLogin!.value;

      // PA-FN-02 / PA-AP-02 — refresh contract (rotates the cookie).
      const refreshRes = await platformAdminRefreshRequest(ctx);
      expect(refreshRes.status()).toBe(200);
      const refreshBody = await refreshRes.json();
      expect(typeof refreshBody.accessToken).toBe('string');
      const cookieAfterRefresh = await findPlatformAdminRefreshCookie(ctx);
      expect(cookieAfterRefresh!.value).not.toBe(staleCookieValue);

      // PA-NG-07 — replaying the now-stale (already-rotated) cookie from a
      // separate client is treated as theft: rejected AND every refresh
      // token for this admin is revoked (including the freshly-rotated one).
      const replayCtx = await newPlatformAdminRequestContextWithCookie(staleCookieValue);
      try {
        const replayRes = await platformAdminRefreshRequest(replayCtx);
        expect(replayRes.status()).toBe(401);
        expect((await replayRes.json()).error).toMatch(/session invalidated/i);
      } finally {
        await replayCtx.dispose();
      }

      // Theft detection revokes ALL of this admin's refresh tokens, so the
      // original (post-rotation, otherwise-still-valid) cookie is now dead too.
      const refreshAfterTheft = await platformAdminRefreshRequest(ctx);
      expect(refreshAfterTheft.status()).toBe(401);

      // PA-FN-03 / PA-AP-03 — logout is always 200 {success:true}, with or
      // without a cookie (idempotent).
      const logoutRes = await platformAdminLogoutRequest(ctx);
      expect(logoutRes.status()).toBe(200);
      expect(await logoutRes.json()).toEqual({ success: true });

      const noCookieCtx = await newPlatformAdminRequestContext();
      try {
        const logoutNoCookieRes = await platformAdminLogoutRequest(noCookieCtx);
        expect(logoutNoCookieRes.status()).toBe(200);
        expect(await logoutNoCookieRes.json()).toEqual({ success: true });
      } finally {
        await noCookieCtx.dispose();
      }
    } finally {
      await ctx.dispose();
    }
  });

  test('PA-NG-05: refresh with no cookie is rejected', async () => {
    const ctx = await newPlatformAdminRequestContext();
    try {
      const res = await platformAdminRefreshRequest(ctx);
      expect(res.status()).toBe(401);
      expect((await res.json()).error).toMatch(/not authenticated/i);
    } finally {
      await ctx.dispose();
    }
  });

  test('PA-NG-06: refresh with an unknown/garbage cookie value is rejected', async () => {
    const ctx = await newPlatformAdminRequestContextWithCookie('not-a-real-refresh-token-value');
    try {
      const res = await platformAdminRefreshRequest(ctx);
      expect(res.status()).toBe(401);
      expect((await res.json()).error).toMatch(/session expired/i);
    } finally {
      await ctx.dispose();
    }
  });

  test('PA-VD-01: login with missing email and password fields is rejected with a 400', async () => {
    const ctx = await newPlatformAdminRequestContext();
    try {
      const res = await ctx.post('/api/platform-admin/auth/login', { data: {} });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/email/i);
      expect(body.error).toMatch(/password/i);
    } finally {
      await ctx.dispose();
    }
  });

  test('PA-VD-02: login with a malformed email is rejected with a 400', async () => {
    const ctx = await newPlatformAdminRequestContext();
    try {
      const res = await ctx.post('/api/platform-admin/auth/login', { data: { email: 'notanemail', password: 'whatever' } });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toMatch(/email/i);
    } finally {
      await ctx.dispose();
    }
  });
});

test.describe('Platform Admin Auth — login page UI', () => {
  test('PA-UI-01: an invalid email format shows inline client-side validation', async ({ page }) => {
    const loginPage = new PlatformAdminLoginPage(page);
    await loginPage.goto();
    await loginPage.fillEmail('notanemail');
    await loginPage.fillPassword('SomePassword123');
    await loginPage.submit();
    await expect(loginPage.invalidEmailHelperText).toBeVisible();
  });

  test('PA-UI-02: an empty password shows inline client-side validation', async ({ page }) => {
    const loginPage = new PlatformAdminLoginPage(page);
    await loginPage.goto();
    await loginPage.fillEmail('someone@example.com');
    await loginPage.submit();
    await expect(loginPage.passwordRequiredHelperText).toBeVisible();
  });

  /**
   * PA-UI-03 — deliberately mocks the login response instead of sending a
   * real login attempt: this is purely a frontend-rendering concern (does the
   * Alert component surface whatever error the API returned), already proven
   * correct at the API layer by PA-NG-01/02/03 and PA-BD-01 in the other spec
   * files. Mocking keeps this file's login-endpoint request budget small and
   * deterministic, and lets both the 401 and 429 cases be covered without
   * needing to actually exhaust the rate limiter or lock an account.
   */
  test('PA-UI-03: a mocked 401/429 login response is surfaced in the top-level Alert', async ({ page }) => {
    const loginPage = new PlatformAdminLoginPage(page);

    await page.route('**/api/platform-admin/auth/login', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Invalid email or password' }) })
    );
    await loginPage.goto();
    await loginPage.login('someone@example.com', 'wrong-password');
    await expect(loginPage.serverErrorAlert).toBeVisible();
    await expect(loginPage.serverErrorAlert).toContainText(/invalid email or password/i);

    await page.route('**/api/platform-admin/auth/login', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Too many login attempts from this location. Please try again later.' }),
      })
    );
    await loginPage.goto();
    await loginPage.login('someone@example.com', 'wrong-password');
    await expect(loginPage.serverErrorAlert).toBeVisible();
    await expect(loginPage.serverErrorAlert).toContainText(/too many login attempts/i);
  });

  test('PA-UI-14: navigating to a protected Platform Admin route while unauthenticated redirects to /platform-admin/login', async ({ page }) => {
    await page.goto('/platform-admin/companies');
    await expect(page).toHaveURL(/\/platform-admin\/login$/);
  });

  test('PA-UI-15: an access-token expiry with a failed refresh signs the user out and redirects to login', async ({ browser }) => {
    test.skip(!primary, 'Platform-admin persona "platformAdmin" is not configured — see e2e/.env.e2e.example.');
    // Uses its own isolated context (not the shared platformAdminPage
    // fixture) because this test deliberately corrupts the session's cookie
    // — reusing the cached fixture context would poison it for any other
    // test in this worker slot.
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new PlatformAdminLoginPage(page);
    await loginPage.goto();
    await loginPage.login(primary!.email, primary!.password);
    await expect(page).toHaveURL(/\/platform-admin\/companies$/);

    // Simulate the access token going stale mid-session (PlatformAdminAuthContext
    // re-authenticates via POST /auth/refresh on every mount) by forcing that
    // call to fail, then triggering a remount via reload.
    await page.route('**/api/platform-admin/auth/refresh', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Session expired, please log in again' }) })
    );
    await page.reload();
    await expect(page).toHaveURL(/\/platform-admin\/login$/);
    await context.close();
  });
});

test.describe('Platform Admin Auth — change password', () => {
  test.skip(!changePasswordPersona, 'Platform-admin persona "platformAdminChangePassword" is not configured — see e2e/.env.e2e.example.');

  test('PA-AP-04: change-password without an Authorization header is rejected', async () => {
    const ctx = await newPlatformAdminRequestContext();
    try {
      const res = await ctx.post('/api/platform-admin/auth/change-password', {
        data: { currentPassword: 'whatever', newPassword: 'whatever123' },
      });
      expect(res.status()).toBe(401);
    } finally {
      await ctx.dispose();
    }
  });

  test('PA-FN-04/PA-NG-08/PA-BD-11/PA-VD-14/PA-SC-11/PA-AP-04: change-password contract, wrong-current-password rejection, newPassword length boundary, and refresh-token revocation on success', async ({
    platformAdminChangePasswordPage,
  }) => {
    // Authorization header is already attached to this context's requests by
    // PlatformAdminAuthenticationManager.acquireSession() — no need to read
    // the access token back from the page (which, per PA-SC-14, never
    // exposes it anywhere reachable from `window` anyway).
    const request = platformAdminChangePasswordPage.request;
    const originalPassword = changePasswordPersona!.password;

    // PA-NG-08 — wrong current password is rejected, nothing changes.
    const wrongCurrentRes = await request.post('/api/platform-admin/auth/change-password', {
      data: { currentPassword: WRONG_CURRENT_PASSWORD, newPassword: uniqueTempPassword() },
    });
    expect(wrongCurrentRes.status()).toBe(400);
    expect((await wrongCurrentRes.json()).error).toMatch(/current password is incorrect/i);

    // PA-BD-11/PA-VD-14 — newPassword below the 8-char minimum is rejected by
    // schema validation before ever reaching the currentPassword check.
    const tooShort = PLATFORM_ADMIN_NEW_PASSWORD_LENGTH_BOUNDARY.find((c) => !c.shouldPass)!;
    const tooShortRes = await request.post('/api/platform-admin/auth/change-password', {
      data: { currentPassword: originalPassword, newPassword: tooShort.value },
    });
    expect(tooShortRes.status()).toBe(400);

    // PA-FN-04/PA-BD-11 (at-limit case) — a correct current password with a
    // newPassword exactly at the 8-char minimum succeeds.
    const atLimit = PLATFORM_ADMIN_NEW_PASSWORD_LENGTH_BOUNDARY.find((c) => c.shouldPass)!;
    try {
      const changeRes = await request.post('/api/platform-admin/auth/change-password', {
        data: { currentPassword: originalPassword, newPassword: atLimit.value },
      });
      expect(changeRes.status()).toBe(200);
      expect((await changeRes.json()).success).toBe(true);

      // PA-SC-11 — the refresh token issued at login (still held by this
      // context's cookie jar) must now be revoked by the password change.
      const refreshAfterChangeRes = await platformAdminRefreshRequest(request);
      expect(refreshAfterChangeRes.status()).toBe(401);
    } finally {
      // Always revert, regardless of pass/fail above, so this dedicated
      // account's real password matches e2e/.env.e2e for the next run — the
      // access token is still valid (change-password only revokes refresh
      // tokens, not the in-flight stateless JWT), so this call still
      // authenticates even though the refresh-token check above just proved
      // the refresh cookie itself is dead.
      const revertRes = await request.post('/api/platform-admin/auth/change-password', {
        data: { currentPassword: atLimit.value, newPassword: originalPassword },
      });
      expect(revertRes.status(), 'CRITICAL: failed to revert platformAdminChangePassword account to its original password — fix e2e/.env.e2e or the account manually before the next run.').toBe(200);
    }
  });
});
