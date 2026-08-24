import { test as base, type Browser, type Page } from '@playwright/test';
import { PlatformAdminAuthenticationManager } from '../auth/PlatformAdminAuthenticationManager';
import { platformAdminAuthConfig } from '../config/platformAdminAuth.config';
import { installSessionExpiryDetector } from '../helpers/sessionGuard';
import { installTransientRequestRetries } from '../helpers/networkResilience';
import { PLATFORM_ADMIN_PERSONAS, platformAdminPersonaUserFile, type PlatformAdminPersonaKey } from './platformAdminPersonas';

type PlatformAdminPersonaFixtures = {
  /** Logged in as the "primary" dedicated platform-admin account — never
   * deliberately sent a wrong password by any test. Use for UI-authenticated
   * flows (session-expiry, protected-route-after-login) and any API-contract
   * check that just needs a valid session, not for lockout/rate-limit/
   * enumeration/injection tests — see e2e/.env.e2e.example. */
  platformAdminPage: Page;
  /** Logged in as the dedicated change-password account. Only the
   * change-password test group should use this fixture — it mutates then
   * reverts this account's own password (try/finally) within that group. */
  platformAdminChangePasswordPage: Page;
};

type PlatformAdminWorkerFixtures = {
  platformAdminWorkerSlot: number;
  platformAdminAuthManager: PlatformAdminAuthenticationManager;
};

/**
 * Thin Playwright-fixture wrapper around PlatformAdminAuthenticationManager —
 * mirrors fixtures/auth.ts's role for the tenant suite (see that file's own
 * doc comment). Deliberately its own file/fixture graph, not merged into
 * fixtures/auth.ts: Platform Admin is a wholly separate principal type (see
 * PlatformAdminAuthenticationManager.ts's doc comment) and this Phase (Auth &
 * Session) has no test that needs a tenant persona and a platform-admin
 * persona in the same test — that cross-portal-isolation slice
 * (PA-NG-17/18/19, PA-SC-01/02/13, PA-PM-01..04) is out of scope for this
 * phase and will need Playwright's mergeTests() with fixtures/auth.ts when
 * it's built, not a change to this file.
 *
 * Only two of the four platform-admin personas get a page fixture here — the
 * lockout/inactive personas are never used to drive a real browsing session
 * in this phase's tests (every lockout/rate-limit/inactive-account/injection
 * test calls the login endpoint directly via a fresh, deliberately-counted
 * `request.newContext()`, not this cached fixture) — see
 * PlatformAdminAuthenticationManager.ts's doc comment on the shared
 * 10-req/15min IP-wide login budget.
 */
async function usePlatformAdminPersonaPage(
  persona: PlatformAdminPersonaKey,
  authManager: PlatformAdminAuthenticationManager,
  browser: Browser,
  use: (page: Page) => Promise<void>
) {
  const session = await authManager.acquireSession(persona, browser);
  if (!session) {
    base.skip(
      true,
      `Platform-admin persona "${persona}" is not configured in e2e/.env.e2e — see e2e/.env.e2e.example. Skipping.`
    );
    return;
  }
  const { context, page } = session;
  installSessionExpiryDetector(context);
  installTransientRequestRetries(context);
  try {
    await use(page);
  } finally {
    try {
      await authManager.releaseSession(persona, context);
    } finally {
      await context.close();
    }
  }
}

export const test = base.extend<PlatformAdminPersonaFixtures, PlatformAdminWorkerFixtures>({
  platformAdminWorkerSlot: [
    async ({}, use, workerInfo) => {
      await use(workerInfo.parallelIndex);
    },
    { scope: 'worker' },
  ],

  platformAdminAuthManager: [
    async ({ platformAdminWorkerSlot }, use) => {
      const manager = new PlatformAdminAuthenticationManager({
        config: platformAdminAuthConfig,
        personas: PLATFORM_ADMIN_PERSONAS,
        personaUserFile: platformAdminPersonaUserFile,
        slot: platformAdminWorkerSlot,
      });
      await use(manager);
    },
    { scope: 'worker' },
  ],

  platformAdminPage: async ({ browser, platformAdminAuthManager }, use) =>
    usePlatformAdminPersonaPage('platformAdmin', platformAdminAuthManager, browser, use),

  platformAdminChangePasswordPage: async ({ browser, platformAdminAuthManager }, use) =>
    usePlatformAdminPersonaPage('platformAdminChangePassword', platformAdminAuthManager, browser, use),
});

export { expect } from '@playwright/test';
