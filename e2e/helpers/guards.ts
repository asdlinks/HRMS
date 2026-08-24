import { test } from '../fixtures/auth';
import type { Locator } from '@playwright/test';

export { assertSessionActive, installSessionExpiryDetector } from './sessionGuard';

/**
 * Skips the current test (with a clear reason, never a hard failure) when a
 * permission-gated control isn't present for the current persona — the same
 * "skip with reason" convention used throughout the Employee suite (e.g.
 * `test.skip(!(await form.isIdentitySectionVisible()), '...')`), extracted
 * here because it was repeated verbatim across shifts.spec.ts,
 * work-modes.spec.ts, attendance-policies.spec.ts and others.
 *
 * Waits (bounded) for the locator to actually appear rather than checking
 * `isVisible()` immediately — that call doesn't retry/auto-wait like an
 * `expect(...).toBeVisible()` does, so calling it right after `goto()` (before
 * the page's own data-fetch-then-permission-check render pass completes) was
 * confirmed live to report a permission-gated button as absent when the
 * persona actually held the permission and the button rendered moments
 * later — a false-skip race, not a real permission gap.
 */
export async function skipUnlessVisible(locator: Locator, reason: string) {
  const visible = await locator.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  test.skip(!visible, reason);
}
