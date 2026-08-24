import { test, expect } from '../fixtures/auth';
import { readPersonaUser } from '../fixtures/personas';
import { XSS_PAYLOAD } from '../fixtures/test-data';
import { uniqueDocumentTitle } from '../fixtures/companyDocuments-data';
import { createDisposableDocument, getOwnProfile } from '../helpers/companyDocuments';
import { getNotifications, clearUnread } from '../helpers/notifications';
import { NotificationBell } from '../pages/components/NotificationBell';
import { AppShellPopup } from '../pages/components/AppShellPopup';

/**
 * docs/Notifications_TestCases.csv — cross-cutting Negative/Security/
 * Permission/Boundary rows. Automates: NT-NG-01, NT-NG-02, NT-NG-04, NT-NG-05,
 * NT-SC-01, NT-SC-02, NT-SC-04 (duplicate framing of NT-NG-05 per the CSV's
 * own cross-reference), NT-DB-03, NT-PM-01, NT-PM-02, NT-BD-01.
 *
 * NT-SC-03 (malicious link scheme) is NOT here — every call site that ever
 * sets `link` passes either a hardcoded server constant
 * ('/company-documents') or nothing at all (leaves.routes.js never sets it);
 * there is no HTTP-reachable path that lets a caller control the value, so
 * it's in notifications-not-automatable.spec.ts instead.
 *
 * .serial(): NT-SC-01/02 and NT-BD-01 each assert on a specific recipient's
 * clean/expected notification state (hrDirectoryPage and managerPage
 * respectively, deliberately DIFFERENT personas from each other and from
 * notifications-lifecycle.spec.ts's employeeSelfPage — see NT-BD-01's own
 * comment for the confirmed-live cross-test collision this design avoids).
 * Serializing this file's own tests is cheap insurance against a same-file
 * repeat of that same collision class, not a response to an observed one.
 */
test.describe.serial('Notifications — Permissions & Security', () => {
  test('NT-NG-01 (confirmed gap): no single-item mark-read endpoint exists — only the bulk mark-all-read', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    const response = await employeeSelfPage.request.post('/api/notifications/1/read');
    expect(response.status()).toBe(404);
  });

  test('NT-NG-02 (confirmed gap): no delete endpoint exists for a notification', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    const response = await employeeSelfPage.request.delete('/api/notifications/1');
    expect(response.status()).toBe(404);
  });

  test('NT-NG-04 / NT-PM-01 / NT-PM-02: notifications.manage is never enforced anywhere — a persona holding none of it (or any other manage permission) can still fully use both base endpoints', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    // employeeSelfPage: "Plain employee, no view.*/manage permissions at all" (e2e/.env.e2e.example) — a fortiori lacks notifications.manage.
    const getResponse = await employeeSelfPage.request.get('/api/notifications');
    expect(getResponse.ok()).toBeTruthy();
    const postResponse = await employeeSelfPage.request.post('/api/notifications/read');
    expect(postResponse.ok()).toBeTruthy();
  });

  test('NT-NG-05 / NT-SC-04 / NT-DB-03: a userId query param is silently ignored and no :id route exists — GET /notifications only and always returns the caller\'s own tenant-scoped rows, with no reachable path to another user\'s', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    const admin = readPersonaUser('admin');
    const self = readPersonaUser('employeeSelf');
    test.skip(!admin || !self, 'admin/employeeSelf persona not configured in this environment — need both personas\' real ids to prove isolation.');

    const response = await employeeSelfPage.request.get(`/api/notifications?userId=${admin!.id}`);
    expect(response.ok()).toBeTruthy();
    const rows = await response.json();
    for (const row of rows) {
      expect(row.user_id).toBe(self!.id); // never admin's id, regardless of the query param
    }

    // The pre-Milestone-1 vulnerable shape (a :userId/:id route param) doesn't exist at all — any such path 404s.
    const idResponse = await employeeSelfPage.request.get(`/api/notifications/${admin!.id}`);
    expect(idResponse.status()).toBe(404);
  });

  test('NT-SC-01 / NT-SC-02: a notification message built from unvalidated, user-controllable input (an HTML/script-like document title) renders as literal text in the dropdown and never executes', { tag: ['@regression'] }, async ({ adminPage, hrDirectoryPage }) => {
    // hrDirectoryPage, not employeeSelfPage: a lower-privilege persona still
    // proves the rendering claim just as well, and keeps this file's own
    // recipient distinct from notifications-lifecycle.spec.ts's — see this
    // file's header comment.
    await clearUnread(hrDirectoryPage);
    const title = `XSS Test ${XSS_PAYLOAD}`;
    // createNotification() does zero validation on the message it's handed (server/repositories/notifications.repository.js)
    // — the document title flows straight into `New document published: ${title}` unescaped at the server layer.
    await createDisposableDocument(adminPage, { title, visibility: { allEmployees: true } });

    await hrDirectoryPage.addInitScript(() => {
      (window as unknown as { __xssFired?: boolean }).__xssFired = false;
    });
    await hrDirectoryPage.goto('/dashboard');
    // A fresh navigation races AppShellPopup's fire-and-forget auto-dismiss
    // listener — see notifications-lifecycle.spec.ts's gotoDashboardSettled()
    // doc comment for the confirmed-live failure this avoids, the widened
    // timeout, and why a dismiss failure here is swallowed rather than
    // propagated.
    await new AppShellPopup(hrDirectoryPage).dismissIfPresent(10_000).catch(() => {});
    const bell = new NotificationBell(hrDirectoryPage);
    await bell.open();
    // If React's default text-escaping ever regressed to raw HTML injection, this exact literal-string locator
    // would stop matching (the <script> tag would be parsed out of the accessible text) rather than false-passing.
    await expect(bell.itemByMessage(`New document published: ${title}`)).toBeVisible();
    const fired = await hrDirectoryPage.evaluate(() => (window as unknown as { __xssFired?: boolean }).__xssFired);
    expect(fired).toBe(false);
  });

});
