import { test as base, type Browser, type Page } from '@playwright/test';
import { AuthenticationManager } from '../auth/AuthenticationManager';
import { authConfig } from '../config/auth.config';
import { installAppShellPopupAutoDismiss } from '../pages/components/AppShellPopup';
import { installSessionExpiryDetector } from '../helpers/sessionGuard';
import { installTransientRequestRetries } from '../helpers/networkResilience';
import { PERSONAS, personaUserFile, type PersonaKey } from './personas';

type PersonaFixtures = {
  adminPage: Page;
  managerPage: Page;
  hrDirectoryPage: Page;
  usersManageOnlyPage: Page;
  employeeSelfPage: Page;
};

type WorkerFixtures = {
  /** Playwright's `parallelIndex` — stable across worker-process recycling within a run. */
  workerSlot: number;
  authManager: AuthenticationManager;
};

/**
 * This file is intentionally thin: it only wires AuthenticationManager
 * (../auth/AuthenticationManager.ts) into Playwright's fixture/test
 * lifecycle. All authentication logic — login, storage-state file I/O,
 * validation, recovery, configuration, logging — lives in that one class
 * (and its config in ../config/auth.config.ts). Don't add auth logic here;
 * add it there.
 */
async function usePersonaPage(
  persona: PersonaKey,
  authManager: AuthenticationManager,
  browser: Browser,
  use: (page: Page) => Promise<void>
) {
  const session = await authManager.acquireSession(persona, browser);
  if (!session) {
    base.skip(
      true,
      `Persona "${persona}" is not configured in e2e/.env.e2e — see e2e/.env.e2e.example. Skipping.`
    );
    return;
  }
  const { context, page } = session;
  // Cross-cutting, module-agnostic AppShell UI (the missed-checkin popup) is
  // handled once, here, for every persona page — see AppShellPopup.ts. Module
  // page objects must never grow their own copy of this dismissal logic.
  installAppShellPopupAutoDismiss(page);
  // Records the first 401 this context ever sees, so a page object's
  // assertSessionActive() (helpers/sessionGuard.ts) can fail fast with a
  // clear diagnosis instead of a page object waiting out a doomed 15s
  // locator timeout once the persona's session has gone stale mid-suite —
  // see that file's doc comment for the confirmed-live failure this fixes.
  installSessionExpiryDetector(context);
  // Retries a handful of raw `context.request.*` ("page.request.*") calls on
  // a genuine dropped-connection error only — see networkResilience.ts's doc
  // comment. Applies to every spec file automatically; no test changes.
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

export const test = base.extend<PersonaFixtures, WorkerFixtures>({
  workerSlot: [
    async ({}, use, workerInfo) => {
      await use(workerInfo.parallelIndex);
    },
    { scope: 'worker' },
  ],

  authManager: [
    async ({ workerSlot }, use) => {
      const manager = new AuthenticationManager({
        config: authConfig,
        personas: PERSONAS,
        personaUserFile,
        slot: workerSlot,
      });
      await use(manager);
    },
    { scope: 'worker' },
  ],

  adminPage: async ({ browser, authManager }, use) => usePersonaPage('admin', authManager, browser, use),
  managerPage: async ({ browser, authManager }, use) => usePersonaPage('manager', authManager, browser, use),
  hrDirectoryPage: async ({ browser, authManager }, use) => usePersonaPage('hrDirectory', authManager, browser, use),
  usersManageOnlyPage: async ({ browser, authManager }, use) =>
    usePersonaPage('usersManageOnly', authManager, browser, use),
  employeeSelfPage: async ({ browser, authManager }, use) => usePersonaPage('employeeSelf', authManager, browser, use),
});

export { expect } from '@playwright/test';
