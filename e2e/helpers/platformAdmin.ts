import { request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { platformAdminAuthConfig } from '../config/platformAdminAuth.config';

/** server/routes/platformAdmin/auth.routes.js's REFRESH_COOKIE/REFRESH_COOKIE_PATH —
 * duplicated here (not imported — this is a Node/Express file, not reachable
 * from the Playwright TS project) so contract tests can assert on the exact
 * values rather than a value this suite invented independently. */
export const PLATFORM_ADMIN_REFRESH_COOKIE_NAME = 'mywe_platform_admin_refresh_token';
export const PLATFORM_ADMIN_REFRESH_COOKIE_PATH = '/api/platform-admin/auth';

export function platformAdminLoginRequest(ctx: APIRequestContext, email: string, password: string): Promise<APIResponse> {
  return ctx.post(platformAdminAuthConfig.loginEndpoint, {
    data: { email, password },
    timeout: platformAdminAuthConfig.requestTimeoutMs,
  });
}

export function platformAdminRefreshRequest(ctx: APIRequestContext): Promise<APIResponse> {
  return ctx.post(platformAdminAuthConfig.refreshEndpoint, { timeout: platformAdminAuthConfig.requestTimeoutMs });
}

export function platformAdminLogoutRequest(ctx: APIRequestContext): Promise<APIResponse> {
  return ctx.post(platformAdminAuthConfig.logoutEndpoint, { timeout: platformAdminAuthConfig.requestTimeoutMs });
}

export function platformAdminChangePasswordRequest(
  ctx: APIRequestContext,
  accessToken: string,
  currentPassword: string,
  newPassword: string
): Promise<APIResponse> {
  return ctx.post(platformAdminAuthConfig.changePasswordEndpoint, {
    data: { currentPassword, newPassword },
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: platformAdminAuthConfig.requestTimeoutMs,
  });
}

/**
 * Finds the platform-admin refresh cookie in a storageState() snapshot — used
 * by cookie-flag assertions (PA-SC-04/PA-AP-01) instead of every call site
 * re-deriving the lookup.
 */
export async function findPlatformAdminRefreshCookie(ctx: APIRequestContext) {
  const state = await ctx.storageState();
  return state.cookies.find((c) => c.name === PLATFORM_ADMIN_REFRESH_COOKIE_NAME) ?? null;
}

/**
 * A fresh (never-before-authenticated) request context scoped to the
 * platform-admin base URL — every Auth & Session test that deliberately
 * drives the login/refresh/logout/change-password endpoints directly (rather
 * than via the cached platformAdminPage/platformAdminChangePasswordPage
 * fixtures) creates its own via this helper, so its cookie jar never leaks
 * into or is contaminated by another test's.
 */
export function newPlatformAdminRequestContext(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: platformAdminAuthConfig.baseURL });
}

/**
 * A fresh request context pre-seeded with a specific (possibly stale/
 * garbage/revoked) refresh-cookie value, without ever having logged in
 * through it — used to simulate a different client presenting a token it
 * shouldn't have (PA-NG-06's garbage value, PA-NG-07's replay-of-a-rotated
 * token). domain/secure are derived from platformAdminAuthConfig.baseURL so
 * this stays correct against either the deployed HTTPS dev environment or a
 * local HTTP server.
 */
export function newPlatformAdminRequestContextWithCookie(cookieValue: string): Promise<APIRequestContext> {
  const url = new URL(platformAdminAuthConfig.baseURL);
  return request.newContext({
    baseURL: platformAdminAuthConfig.baseURL,
    storageState: {
      cookies: [
        {
          name: PLATFORM_ADMIN_REFRESH_COOKIE_NAME,
          value: cookieValue,
          domain: url.hostname,
          path: PLATFORM_ADMIN_REFRESH_COOKIE_PATH,
          expires: -1,
          httpOnly: true,
          secure: url.protocol === 'https:',
          sameSite: url.protocol === 'https:' ? 'None' : 'Lax',
        },
      ],
      origins: [],
    },
  });
}
