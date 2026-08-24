import { test, expect } from '../fixtures/auth';
import { LeavesPage } from '../pages/LeavesPage';
import { uniqueWeekdayRange } from '../fixtures/leave-data';

/**
 * Cross-cutting permission checks not already exercised elsewhere. Several
 * LV-PM-* cases are already covered as a side effect of functional tests and
 * are cross-referenced here rather than duplicated:
 *  - LV-PM-01 (view.own/.team/.all scoping)   â€” leave-list-approval.spec.ts LV-FN-05/06/07
 *  - LV-PM-02 (apply.own vs apply.any)        â€” leave-application.spec.ts LV-FN-01/02, LV-NG-01
 *  - LV-PM-03 (approve is not manager-scoped) â€” leave-list-approval.spec.ts LV-NG-18
 */
test.describe('Leave â€” cross-cutting permissions', () => {
  test('LV-PM-04: self-cancel requires no permission beyond record ownership â€” no leaves.cancel.own exists', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    const leaves = new LeavesPage(employeeSelfPage);
    const { start, end } = uniqueWeekdayRange(9);
    await leaves.goto();
    await leaves.openApplyDrawer();
    await leaves.fill({ leaveType: 'Casual', startDate: start, endDate: end, reason: 'E2E: PM-04 self-cancel-needs-no-permission check' });
    await leaves.submit();
    await expect(leaves.toast(/Leave application submitted for approval!|Leave recorded and approved!/)).toBeVisible();

    // employeeSelf holds only leaves.view.own/apply.own â€” no cancel.* permission of any kind â€” yet /cancellation is fully usable for their own record.
    await leaves.page.goto('/cancellation');
    await expect(leaves.page.getByLabel('Reason for Cancellation')).toBeVisible();
  });

  // NOTE: a bare `test.skip(true, reason)` statement directly in a describe
  // body (as all 7 below used to be) skips the WHOLE describe block, not
  // just the documented case â€” confirmed live, this was silently disabling
  // even LV-PM-04 above, the one real test in this file. The 2-arg
  // test.skip(title, callback) form registers each as its own standalone,
  // always-skipped placeholder instead.







});
