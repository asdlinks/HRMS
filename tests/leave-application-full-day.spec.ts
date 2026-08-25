import { test, expect } from '../fixtures/auth';
import { LeavesPage } from '../pages/LeavesPage';

function futureMonday(): string {
  const date = new Date();
  date.setDate(date.getDate() + 700);
  while (date.getDay() !== 1) date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

test('Submit a valid full-day leave request', { tag: ['@smoke'] }, async ({ employeeSelfPage }) => {
  const leaves = new LeavesPage(employeeSelfPage);
  const start = futureMonday();

  await leaves.goto();
  await expect(leaves.applyButton).toBeVisible();
  await leaves.openApplyDrawer();
  await expect(leaves.drawer.getByText('Record Leave')).toBeVisible();

  await leaves.selectLeaveType('Paid');
  await leaves.startDateField.fill(start);
  await leaves.endDateField.fill(start);
  await leaves.fullDayToggle.click();
  await expect(leaves.fullDayToggle).toHaveAttribute('aria-pressed', 'true');
  await leaves.reasonField.fill('E2E: valid full-day leave request');
  await expect(leaves.submitButton).toBeEnabled();
  const submitResponse = employeeSelfPage.waitForResponse(
    (response) => response.url().endsWith('/api/leaves') && response.request().method() === 'POST',
  );
  await leaves.submit();
  const response = await submitResponse;
  await expect(response.status()).toBe(200);

  await expect(leaves.toast(/Leave application submitted for approval!|Leave recorded and approved!/)).toBeVisible();
  await expect(leaves.drawer).toBeHidden();
  await leaves.filterByStatus('Pending');
  await expect(leaves.statusChip('Pending')).toBeVisible();
  await expect(leaves.rowByDateRangeText(start)).toBeVisible();
});
