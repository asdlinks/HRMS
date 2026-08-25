import { test, expect } from '../fixtures/auth';
import { LeavesPage } from './pages/LeavesPage';
import { LeaveCancellationPage } from './pages/LeaveCancellationPage';
import { uniqueWeekdayRange } from './fixtures/leave-data';
import { formatDisplayDate } from './helpers/leave';

test('Review leave status views and cancel a request', async ({ employeeSelfPage }) => {
  const leaves = new LeavesPage(employeeSelfPage);
  const cancellation = new LeaveCancellationPage(employeeSelfPage);
  const { start, end } = uniqueWeekdayRange(1);
  const dateRange = `${formatDisplayDate(start)} → ${formatDisplayDate(end)}`;
  const leaveOption = `CASUAL (${formatDisplayDate(start)} to ${formatDisplayDate(end)})`;

  await leaves.goto();
  await expect(leaves.page.getByRole('heading', { name: 'Leave Management' })).toBeVisible();
  await expect(leaves.page.getByRole('button', { name: 'Apply for Leave' })).toBeVisible();

  await leaves.openApplyDrawer();
  await leaves.fill({ leaveType: 'Casual', startDate: start, endDate: end, reason: 'E2E: status view cancellation journey' });
  await leaves.submit();
  await expect(leaves.toast(/Leave application submitted for approval!|Leave recorded and approved!/)).toBeVisible();

  for (const status of ['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'] as const) {
    await leaves.filterByStatus(status);
    await expect(leaves.statusChip(status)).toBeVisible();
    await expect(leaves.page.getByRole('heading', { name: 'Recent Requests' })).toBeVisible();
    await expect(leaves.page.getByRole('grid')).toBeVisible();
  }

  await cancellation.goto();
  await expect(cancellation.page.getByRole('heading', { name: 'Leave Cancellation' })).toBeVisible();
  await expect(cancellation.page.getByText("You can only cancel leaves that haven't started yet.")).toBeVisible();
  await cancellation.selectLeaveToCancel(leaveOption);
  await expect(cancellation.submitButton).toBeEnabled();
  await cancellation.fillReason('E2E: no longer needed');
  await expect(cancellation.reasonField).toHaveValue('E2E: no longer needed');
  await cancellation.submit();
  await expect(cancellation.page.getByRole('dialog')).toBeVisible();
  await cancellation.confirmCancellation();
  await cancellation.expectSuccessMessage();

  await leaves.goto();
  await leaves.filterByStatus('Cancelled');
  await expect(leaves.statusChip('Cancelled')).toBeVisible();
  await expect(leaves.rowByDateRangeText(dateRange)).toBeVisible();
});
