/**
 * Shared "arrange"/API helpers for the Announcements suite
 * (docs/Announcements_TestCases.csv). No existing helper file touches
 * /announcements — per FRAMEWORK_GUIDELINES.md this gets its own file
 * rather than being bolted onto seed.ts.
 *
 * Deliberately API-level (page.request.*), same shape as helpers/holidays.ts
 * — most Announcements tests need a disposable announcement to exist as
 * fast, reliable *setup* so the test itself can focus on the actual
 * assertion (permission guard, ownership gap, dashboard-widget rendering,
 * ...).
 *
 * Announcements are disposable records — per FRAMEWORK_GUIDELINES.md's
 * Cleanup strategy, created with a uniqueSuffix()-based title and never
 * deleted, EXCEPT where a test's own point is exercising the DELETE
 * endpoint itself. There is no bulk-list-then-restore concern here (unlike
 * Leave's shared settings blob) — GET /announcements is a plain unbounded
 * read, not a shared mutable singleton.
 */
import { type APIResponse, type Page } from '@playwright/test';
import { assertOk } from './rbac';
import { uniqueAnnouncementTitle, uniqueAnnouncementBody } from '../fixtures/announcements-data';

export interface AnnouncementRow {
  id: number;
  title: string;
  body: string;
  created_at: string;
  author_name: string;
}

/** GET /api/announcements — raw, doesn't assert. Open to any authenticated user. */
export async function getAnnouncementsApi(page: Page): Promise<APIResponse> {
  return page.request.get('/api/announcements');
}

/** POST /api/announcements — raw, doesn't assert. Requires announcements.manage. */
export async function createAnnouncementApi(page: Page, data: { title: string; body: string }): Promise<APIResponse> {
  return page.request.post('/api/announcements', { data });
}

/** DELETE /api/announcements/:id — raw, doesn't assert. Requires announcements.manage. */
export async function deleteAnnouncementApi(page: Page, id: number | string): Promise<APIResponse> {
  return page.request.delete(`/api/announcements/${id}`);
}

/**
 * Creates a disposable announcement via the API and returns its identity,
 * including the server-assigned id (POST returns `{success, id}` directly —
 * unlike holidays, no read-back GET is needed). Assumes `page`'s persona
 * holds announcements.manage.
 */
export async function createAnnouncement(
  page: Page,
  overrides: Partial<{ title: string; body: string }> = {},
): Promise<AnnouncementRow> {
  const title = overrides.title ?? uniqueAnnouncementTitle();
  const body = overrides.body ?? uniqueAnnouncementBody();

  const postResponse = await createAnnouncementApi(page, { title, body });
  assertOk(postResponse);
  const { id } = await postResponse.json();

  const listResponse = await getAnnouncementsApi(page);
  assertOk(listResponse);
  const rows: AnnouncementRow[] = await listResponse.json();
  const created = rows.find((r) => r.id === id);
  if (!created) throw new Error(`Announcement ${id} was created but is not present in GET /announcements — check is_active/tenant scoping.`);
  return created;
}
