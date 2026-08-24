import type { BrowserContext, Page } from '@playwright/test';
import { SessionExpiredError } from '../auth/types';

/**
 * Deliberately its own file, not folded into `helpers/guards.ts` despite
 * being the same kind of cross-cutting utility — `guards.ts` imports `test`
 * from `fixtures/auth.ts` (for `skipUnlessVisible`'s `test.skip(...)`), and
 * `fixtures/auth.ts` needs to import `installSessionExpiryDetector` below to
 * wire it in at context-creation time. Putting both in `guards.ts` would
 * make that a circular import (`guards.ts` → `fixtures/auth.ts` →
 * `guards.ts`). This file has no dependency on `fixtures/auth.ts` at all, so
 * it can be imported from there safely; `guards.ts` re-exports both names so
 * callers can still reach them from the one place FRAMEWORK_GUIDELINES.md
 * documents as the home for cross-cutting utilities.
 */

interface SessionExpiredFlag {
  url: string;
  at: number;
}

const sessionExpiredFlags = new WeakMap<BrowserContext, SessionExpiredFlag>();

/**
 * Confirmed live (Payroll Framework Stabilization pass): PR-VD-04/PR-AP-03
 * (payroll-salary-assignments.spec.ts) and PR-FN-01 (payroll-salary-components.spec.ts)
 * all failed with a generic `TimeoutError: locator.click: Timeout 15000ms
 * exceeded` waiting for a page's own action button ("New Structure"/"New
 * Component") — but the failure screenshot showed the app's login screen,
 * not the target page. The cached persona session had gone stale mid-suite
 * (see AuthenticationManager's doc comment on cache staleness) and the app's
 * own client-side auth guard had already redirected to /login by the time
 * the page object's next locator wait started; nothing was ever going to
 * appear, and the test burned a full 15s finding that out.
 *
 * Rather than waiting for a locator that will never resolve, this pairs with
 * `installSessionExpiryDetector()` below: that installs a zero-cost `response`
 * listener once per persona context (fixtures/auth.ts), and this reads the
 * flag it sets. No wait of its own — either the flag is already set (a 401
 * response is a network event that fires independently of whatever the test
 * code is awaiting, so by the time a page object's goto() returns and this
 * runs, the flag has long since been set if it's going to be) or it isn't,
 * and this returns immediately either way. Costs nothing on the happy path.
 *
 * Known limitation: if a future Payroll test deliberately provokes a 401 as
 * part of a legitimate negative-path assertion and then continues with more
 * UI actions in the *same* test, this will misfire (the flag doesn't
 * distinguish "expected" from "unexpected" 401s). No current Payroll test
 * does this (checked: no `toBe(401)` assertion exists in any payroll spec) —
 * flagged here so whoever adds the first one knows to reset the flag or call
 * this before, not after, that assertion.
 */
export function assertSessionActive(page: Page): void {
  const flag = sessionExpiredFlags.get(page.context());
  if (flag) {
    throw new SessionExpiredError(
      `Session expired or redirected to login: ${flag.url} responded 401 at ${new Date(flag.at).toISOString()} ` +
        `(current page: ${page.url()}). The cached persona session likely went stale mid-suite — ` +
        `see AuthenticationManager's session-validation/refresh logic, not a locator/timing issue.`
    );
  }
}

/**
 * Installed once per persona context, in `fixtures/auth.ts`'s
 * `usePersonaPage()` — mirrors `AppShellPopup.ts`'s
 * `installAppShellPopupAutoDismiss()` in shape: one cross-cutting listener
 * wired in at context-creation time, never duplicated per page object.
 * Records the first 401 this context ever sees a response for;
 * `assertSessionActive()` above reads it. A `WeakMap` keyed by context (not a
 * property stapled onto the context object) so there's nothing to clean up —
 * the entry is garbage-collected along with the context once the test's
 * fixture teardown closes it.
 */
export function installSessionExpiryDetector(context: BrowserContext): void {
  context.on('response', (response) => {
    if (response.status() === 401 && !sessionExpiredFlags.has(context)) {
      sessionExpiredFlags.set(context, { url: response.url(), at: Date.now() });
    }
  });
}
