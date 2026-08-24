/**
 * Shared "arrange"/API helpers for the Notifications suite
 * (docs/Notifications_TestCases.csv). No existing helper file touches the
 * Notification Center itself — leave-notifications.spec.ts and
 * company-documents-visibility.spec.ts each hit GET/POST /api/notifications
 * directly inline (there was no page object or helper file for this module
 * at the time), so this centralizes the same two calls this module's own
 * spec files use repeatedly, the same API-level "arrange" shape as
 * helpers/rbac.ts's assertOk()/helpers/companyDocuments.ts's uploadDocumentApi().
 */
import { type APIResponse, type Page } from '@playwright/test';
import { assertOk } from './rbac';

export interface NotificationRow {
  id: number;
  tenant_id: number;
  user_id: number;
  message: string;
  type: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export function getNotificationsApi(page: Page): Promise<APIResponse> {
  return page.request.get('/api/notifications');
}

export function markAllReadApi(page: Page): Promise<APIResponse> {
  return page.request.post('/api/notifications/read');
}

export async function getNotifications(page: Page): Promise<NotificationRow[]> {
  const response = await getNotificationsApi(page);
  assertOk(response);
  return response.json();
}

/** Clears the caller's own unread queue so a test's own trigger produces an unambiguous, isolated result — same pattern leave-notifications.spec.ts/company-documents-visibility.spec.ts already use inline. */
export async function clearUnread(page: Page): Promise<void> {
  assertOk(await markAllReadApi(page));
}
