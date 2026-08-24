import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Centralizes "assert this success/error message appeared" — the app
 * renders these via a notistack Snackbar with no consistent role or
 * data-testid, so matching the message text itself is the only stable
 * anchor. Before this existed, 7+ call sites across LeavesPage.ts,
 * LeaveSettingsPanel.ts, helpers/seed.ts, and helpers/leave.ts each built
 * their own `page.getByText(message)` independently.
 *
 * Deliberately NOT for every "a message appeared" case: LeaveCancellationPage's
 * inline `role="alert"` banner and EmployeesPage's persistent employee-limit
 * banner are different UI primitives (a fixed-position Alert, not a
 * transient Snackbar) and correctly keep their own locators.
 */
export class Toast {
  constructor(private readonly page: Page) {}

  /**
   * Scoped to `role="alert"` (notistack's default `SnackbarContent` renders
   * with this role — confirmed live via an error-context aria snapshot:
   * `- alert: - img - text: Employee added`), filtered to the specific
   * message and narrowed to the most recently-mounted match. NOT scoped to
   * `#notistack-snackbar` — an earlier version of this fix assumed that id
   * was a universal anchor based on a single observed case (the "cancel" run
   * toast), but a live rerun immediately falsified that: the "Employee
   * added" success toast carries no such id at all, only `role="alert"`,
   * which sent every `createEmployee()` call through this component into a
   * spurious `element(s) not found` failure. Lesson: one screenshot is not
   * "confirmed live" for a claim about *every* toast variant this component
   * serves — verify against more than one message before trusting a DOM
   * anchor as universal.
   *
   * `.filter({ hasText: message })` is also what keeps this from colliding
   * with `EmployeesPage.employeeLimitBanner`, which is *also* `getByRole('alert')`
   * — a persistent, unrelated Alert that can be on-screen at the same time on
   * the Employees page. `.last()` handles `SnackbarProvider`'s `maxSnack={4}`
   * (client/src/main.tsx) ever having more than one alert-role element
   * matching the same text stacked at once; notistack always appends newest.
   *
   * Confirmed live (Payroll Framework Stabilization pass): PR-FN-14's
   * `expectVisible(/cancel/i)` was ALSO a strict mode violation — the
   * original unscoped version matched 5 elements ("Cancelled" status Chip,
   * the toast itself, a dialog heading, and 2 buttons) on any page with an
   * open Cancel confirmation, none of which carry `role="alert"` except the
   * toast — so this scoping fixes that case too.
   */
  locator(message: string | RegExp): Locator {
    return this.page.getByRole('alert').filter({ hasText: message }).last();
  }

  /**
   * Confirmed live (Payroll Framework Stabilization pass, second validation
   * run): PR-FN-17/PR-FN-18 (payroll-overtime.spec.ts) failed with
   * `element(s) not found` at Playwright's default 5000ms `expect` timeout —
   * distinct from the selector bug above (this was a genuine "hasn't
   * rendered yet" case, not a "will never match" one; no network/auth error
   * anywhere near either failure). `SnackbarProvider`'s `autoHideDuration={3500}`
   * (client/src/main.tsx) means a toast that takes a few extra seconds to
   * even mount, under the same shared-tenant load documented in
   * FRAMEWORK_GUIDELINES.md's Cleanup strategy addendum, can otherwise run
   * out the assertion's budget before ever appearing. A local override here
   * — not a change to Playwright's global `expect` timeout config — same
   * pattern as every other scoped override in this pass.
   */
  async expectVisible(message: string | RegExp, timeout = 15_000): Promise<void> {
    await expect(this.locator(message)).toBeVisible({ timeout });
  }
}
