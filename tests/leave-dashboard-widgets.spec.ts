import { test, expect } from '../fixtures/auth';

/**
 * Lower-confidence, lighter-weight coverage (matches the CSV's own "Low"
 * priority on all three cases here) — ManagerDashboard.tsx/EmployeeDashboard.tsx
 * were read only for the specific strings asserted below, not mapped in the
 * same exhaustive per-field depth as LeavesPage/LeaveCancellationPage.
 */
test.describe('Leave — Dashboard widgets', () => {
  test('LV-UI-09: ApprovalsQueueCard renders "Pending Approvals" and deep-links into /leaves, with no duplicate approve/reject action', { tag: ['@sanity'] }, async ({ managerPage }) => {
    await managerPage.goto('/');
    const card = managerPage.getByText('Pending Approvals').locator('../..');
    await expect(card).toBeVisible();
    // By design (see ApprovalsQueueCard.tsx's own comment), this card never
    // exposes its own Approve/Reject buttons — only LeavesPage does.
    await expect(card.getByRole('button', { name: /^(Approve|Reject)$/ })).toHaveCount(0);

    const firstItem = card.getByRole('link').first();
    if (await firstItem.isVisible().catch(() => false)) {
      await firstItem.click();
      await expect(managerPage).toHaveURL(/\/leaves$/);
    }
  });

  test('LV-UI-10: the "Team Time Off" / "Global Time Off" 7-day strip renders on the manager dashboard', { tag: ['@sanity'] }, async ({ managerPage }) => {
    await managerPage.goto('/');
    await expect(managerPage.getByText(/^(Team Time Off|Global Time Off)$/)).toBeVisible();
  });

  test('LV-UI-08: LeaveAllocationChart (Allocated vs Used) renders on the employee dashboard', { tag: ['@sanity'] }, async ({ employeeSelfPage }) => {
    await employeeSelfPage.goto('/');
    // Empty-message fallback per LeaveAllocationChart.tsx when nothing is configured; either state confirms the widget itself rendered without erroring.
    await expect(
      employeeSelfPage.getByText('No leave allocations configured.').or(employeeSelfPage.locator('.recharts-wrapper')).first()
    ).toBeVisible();
  });
});
