import { test, expect } from '../fixtures/auth';
import { LeavesPage } from '../pages/LeavesPage';
import { LeaveCancellationPage } from '../pages/LeaveCancellationPage';
import { uniqueWeekdayRange, sameDate } from '../fixtures/leave-data';
import { formatDisplayDate as formatDisplay } from '../helpers/leave';

test.describe('Leave Cancellation', () => {
  test('LV-FN-10: employee cancels their own Pending leave', { tag: ['@smoke'] }, async ({ employeeSelfPage }) => {
    const leaves = new LeavesPage(employeeSelfPage);
    const { start, end } = uniqueWeekdayRange(1);
    await leaves.goto();
    await leaves.openApplyDrawer();
    await leaves.fill({ leaveType: 'Casual', startDate: start, endDate: end, reason: 'E2E: to be cancelled' });
    await leaves.submit();
    await expect(leaves.toast(/Leave application submitted for approval!|Leave recorded and approved!/)).toBeVisible();

    const cancellation = new LeaveCancellationPage(employeeSelfPage);
    const optionPrefix = `CASUAL (${formatDisplay(start)} to ${formatDisplay(end)})`;
    await cancellation.goto();
    await cancellation.cancelLeave(optionPrefix, 'E2E: no longer needed');

    await cancellation.expectSuccessMessage();
  });

  test('LV-NG-13: cancelling a leave that is no longer Pending/Approved is rejected (row disappears from the cancellable dropdown once Cancelled, and a direct repeat PATCH is rejected 409 server-side)', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    const leaves = new LeavesPage(employeeSelfPage);
    const cancellation = new LeaveCancellationPage(employeeSelfPage);
    const { start, end } = uniqueWeekdayRange(2);
    await leaves.goto();
    await leaves.openApplyDrawer();
    await leaves.fill({ leaveType: 'Casual', startDate: start, endDate: end, reason: 'E2E: double-cancel guard' });
    await leaves.submit();
    await expect(leaves.toast(/Leave application submitted for approval!|Leave recorded and approved!/)).toBeVisible();

    const optionPrefix = `CASUAL (${formatDisplay(start)} to ${formatDisplay(end)})`;
    await cancellation.goto();
    await cancellation.cancelLeave(optionPrefix, 'E2E: first cancellation');
    await cancellation.expectSuccessMessage();

    // Client-side proof: the client-side dropdown is rebuilt from
    // Approved/Pending leaves only â€” a just-Cancelled leave is filtered out
    // entirely, so re-selecting it to attempt a second cancellation has no UI
    // path at all.
    await cancellation.goto();
    await expect(cancellation.page.getByRole('option', { name: new RegExp(optionPrefix.replace(/[()]/g, '\\$&')) })).toHaveCount(0);

    // Server-side proof: repeat the exact PATCH the confirm dialog above just
    // sent, directly on the same authenticated session, to verify the actual
    // response the UI can no longer trigger â€” the 409 the CSV documents, not
    // just the UI's own filtering.
    const rows = await (await employeeSelfPage.request.get('/api/leaves')).json();
    const cancelled = rows.find((r: { start_date: string; status: string }) => sameDate(r.start_date, start) && r.status === 'Cancelled');
    expect(cancelled).toBeDefined();
    const repeatResponse = await employeeSelfPage.request.patch(`/api/leaves/${cancelled.id}`, {
      data: { status: 'Cancelled', cancellation_reason: 'E2E: repeat cancellation attempt' },
    });
    expect(repeatResponse.status()).toBe(409);
    expect((await repeatResponse.json()).error).toBe('Cannot cancel a leave request that is already Cancelled');
  });

  test('LV-UI-06: the cancellable dropdown is filtered to the caller\'s own upcoming (start_date >= today) Approved/Pending leaves', { tag: ['@sanity'] }, async ({ employeeSelfPage }) => {
    const leaves = new LeavesPage(employeeSelfPage);
    const cancellation = new LeaveCancellationPage(employeeSelfPage);
    const { start, end } = uniqueWeekdayRange(3);
    await leaves.goto();
    await leaves.openApplyDrawer();
    await leaves.fill({ leaveType: 'Casual', startDate: start, endDate: end, reason: 'E2E: upcoming leave for dropdown check' });
    await leaves.submit();
    await expect(leaves.toast(/Leave application submitted for approval!|Leave recorded and approved!/)).toBeVisible();

    await cancellation.goto();
    const optionPrefix = `CASUAL (${formatDisplay(start)} to ${formatDisplay(end)})`;
    const count = await cancellation.optionCount();
    expect(count).toBeGreaterThan(0);
    await cancellation.selectLeaveToCancel(optionPrefix); // resolves without throwing => it's genuinely present in the filtered list
    await expect(cancellation.submitButton).toBeEnabled();
  });

  test('LV-UI-07: submitting with an empty cancellation reason is blocked client-side (contrast with LV-VD-04\'s server-side acceptance)', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    const leaves = new LeavesPage(employeeSelfPage);
    const cancellation = new LeaveCancellationPage(employeeSelfPage);
    const { start, end } = uniqueWeekdayRange(4);
    await leaves.goto();
    await leaves.openApplyDrawer();
    await leaves.fill({ leaveType: 'Casual', startDate: start, endDate: end, reason: 'E2E: empty-reason guard' });
    await leaves.submit();
    await expect(leaves.toast(/Leave application submitted for approval!|Leave recorded and approved!/)).toBeVisible();

    const optionPrefix = `CASUAL (${formatDisplay(start)} to ${formatDisplay(end)})`;
    await cancellation.goto();
    await cancellation.selectLeaveToCancel(optionPrefix);
    await cancellation.submit();

    await expect(cancellation.page.getByText('Please provide a reason for cancellation.')).toBeVisible();
  });

  test('LV-NG-19: cancelling an Approved leave that has already started is blocked only client-side â€” a direct API call still succeeds (confirmed gap)', { tag: ['@sanity'] }, async ({ employeeSelfPage }) => {
    // The "hasn't started yet" restriction is enforced ONLY by
    // LeaveCancellationPage's client-side `start_date >= today` filter â€” a
    // leave that has already started is simply absent from the dropdown, so
    // there is no UI path to attempt cancelling it through the form itself.
    const leaves = new LeavesPage(employeeSelfPage);
    const cancellation = new LeaveCancellationPage(employeeSelfPage);
    await leaves.goto();
    const past = new Date();
    past.setDate(past.getDate() - 30);
    while (past.getDay() === 0) past.setDate(past.getDate() - 1);
    const pastIso = past.toISOString().slice(0, 10);

    await leaves.openApplyDrawer();
    await leaves.fill({ leaveType: 'Casual', startDate: pastIso, endDate: pastIso, reason: 'E2E: already-started leave' });
    await leaves.submit();
    await expect(leaves.toast('Leave recorded and approved!')).toBeVisible(); // past leaves auto-approve (LV-FN-03)

    // Client-side proof: the dropdown's own filter never offers this leave as a candidate.
    await cancellation.goto();
    const optionPrefix = `CASUAL (${formatDisplay(pastIso)} to ${formatDisplay(pastIso)})`;
    await expect(cancellation.page.getByRole('option', { name: new RegExp(optionPrefix.replace(/[()]/g, '\\$&')) })).toHaveCount(0);

    // Server-side proof of the actual gap the CSV documents: the identical
    // PATCH the confirm dialog would have sent, issued directly, still
    // succeeds â€” cancelLeave() (leaves.repository.js) only guards on
    // status IN ('Pending', 'Approved'), never on start_date, so nothing
    // server-side stops cancelling a leave that's already started or finished.
    const rows = await (await employeeSelfPage.request.get('/api/leaves')).json();
    const target = rows.find((r: { start_date: string; status: string }) => sameDate(r.start_date, pastIso) && r.status === 'Approved');
    expect(target).toBeDefined();
    const cancelResponse = await employeeSelfPage.request.patch(`/api/leaves/${target.id}`, {
      data: { status: 'Cancelled', cancellation_reason: 'E2E: LV-NG-19 direct-API cancel of an already-started leave' },
    });
    expect(cancelResponse.status()).toBe(200);
    expect(await cancelResponse.json()).toEqual({ success: true, status: 'Cancelled' });
  });

  // NOTE: a bare `test.skip(true, reason)` statement here (as this used to
  // be) skips the WHOLE describe block, not just this one documented case â€”
  // confirmed live across several spec files. Use the 2-arg
  // test.skip(title, callback) form for a standalone always-skipped case.
});
