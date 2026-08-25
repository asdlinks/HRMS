import { test, expect } from './fixtures/auth';

test('Review dashboard overview', { tag: ['@sanity'] }, async ({ adminPage }) => {
  await adminPage.goto('/dashboard');

  await expect(adminPage).toHaveURL(/\/dashboard$/);
  await expect(adminPage.getByRole('banner')).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'Time & Leave', exact: true })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Ask the AI assistant' })).toBeVisible();

  await expect(adminPage.getByRole('heading', { name: /Welcome, / })).toBeVisible();
  await expect(adminPage.getByText("Here's your leave summary for today.")).toBeVisible();

  await expect(adminPage.getByRole('link', { name: /Leaves Available/ })).toBeVisible();
  await expect(adminPage.getByText('Last Leave Taken', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('Team Out This Week', { exact: true })).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: 'Leave Allocation vs. Used' })).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: 'Team Presence (Next 7 Days)' })).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: 'Upcoming Holidays', exact: true })).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: 'Quick Actions' })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'Apply for Leave' })).toBeVisible();
});
