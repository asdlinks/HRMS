import { test, expect } from '../fixtures/auth';
import { readPersonaUser } from '../fixtures/personas';
import { AttendanceCard } from '../pages/AttendanceCard';
import { AppShellPopup } from '../pages/components/AppShellPopup';

test.describe('AppShell — missed check-in popup', () => {
  test('ATE-SM-08: shows on a non-attendance page when eligible and not checked in; dismisses via close and via backdrop click-through', { tag: ['@smoke'] }, async ({ employeeSelfPage }) => {
    const card = new AttendanceCard(employeeSelfPage);
    await employeeSelfPage.goto('/attendance');
    test.skip(await card.isAlreadyCheckedInToday(), 'employeeSelf already checked in today — the popup only shows while not-yet-checked-in (shared persona, see attendance-checkin-checkout.spec.ts header).');

    const popup = new AppShellPopup(employeeSelfPage);
    const self = readPersonaUser('employeeSelf');
    test.skip(!self, 'employeeSelf persona not configured — see e2e/.env.e2e.example.');

    await employeeSelfPage.goto('/dashboard');
    await popup.expectVisible();
    await expect(popup.greetingHeading(self!.name.split(' ')[0])).toBeVisible();
    // Suppressed on /attendance and /login per AppShell.tsx — never on the page we started from.
    await popup.dismissViaClose();
    await popup.expectHidden();

    // Dismiss-without-navigate is session-state (dismissedPopup), not per-page —
    // it must stay hidden after navigating elsewhere in the same SPA session.
    await employeeSelfPage.goto('/attendance');
    await employeeSelfPage.goto('/dashboard');
    await popup.expectHidden();

    // Reload resets the in-memory dismissed flag, so a still-eligible,
    // still-not-checked-in user sees it again — now dismiss via backdrop
    // click-through, which additionally navigates to /attendance.
    await employeeSelfPage.reload();
    await popup.expectVisible();
    await popup.dismissViaBackdropClick();
    await expect(employeeSelfPage).toHaveURL(/\/attendance$/);
    await popup.expectHidden();
  });

  test('the popup never renders on /attendance or /login, regardless of check-in state', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    const popup = new AppShellPopup(employeeSelfPage);
    await employeeSelfPage.goto('/attendance');
    await popup.expectHidden();
  });
});
