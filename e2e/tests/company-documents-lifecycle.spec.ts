import { test, expect } from '../fixtures/auth';
import { CompanyDocumentsPage } from '../pages/CompanyDocumentsPage';
import { DocumentFormDialog } from '../pages/DocumentFormDialog';
import { ConfirmDialog } from '../pages/components/ConfirmDialog';
import { escapeRegex } from '../helpers/locators';
import { createDisposableDocument } from '../helpers/companyDocuments';
import { uniqueDocumentTitle, todayIso, DOCUMENT_CATEGORIES } from '../fixtures/companyDocuments-data';
import { SAMPLE_PDF_PATH, SAMPLE_DOCX_PATH } from '../fixtures/test-assets';

/**
 * docs/CompanyDocuments_TestCases.csv — core CRUD lifecycle + list/detail
 * rendering. Automates: CD-FN-01, CD-FN-02, CD-FN-03, CD-FN-04, CD-FN-05,
 * CD-FN-06, CD-FN-09, CD-FN-10, CD-FN-11, CD-FN-13, CD-NG-14, CD-UI-01,
 * CD-UI-06, CD-UI-07, CD-UI-09.
 *
 * Deliberately does NOT use `adminPage` anywhere in this module. The
 * Pre-Implementation Verification Report's Phase 1 confirmed live (direct
 * DB query against the automation tenant, "autotest"/id 15) that the
 * `admin` persona currently holds ZERO roles/permissions — not a framework
 * assumption, a live-verified environment fact. `company-documents.manage`
 * is held by the `hrDirectory` persona (role `hr`), which is used
 * throughout this suite as the "manage" persona instead. `employeeSelf`
 * (role `employee`, no manage permissions at all) is the "employee view"
 * persona. This choice applies to every spec file in this module, not just
 * this one — see docs/CompanyDocuments_TestCases.csv's Pre-Implementation
 * Verification Report for the full live persona/permission matrix.
 */
test.describe('Company Documents — Lifecycle', () => {
  test.beforeEach(() => { test.slow(); });

  test('CD-FN-01: manager uploads a document with title/category/dates/visibility/file via the real form', { tag: ['@smoke'] }, async ({ hrDirectoryPage }) => {
    const docs = new CompanyDocumentsPage(hrDirectoryPage);
    const form = new DocumentFormDialog(hrDirectoryPage);
    const title = uniqueDocumentTitle('CD-FN-01');

    await docs.goto();
    expect(await docs.isAdminView()).toBe(true);
    await docs.openUpload();
    await form.waitForOpen();
    await form.fill({ title, category: DOCUMENT_CATEGORIES[0], description: 'E2E: CD-FN-01', effectiveDate: todayIso(), allEmployees: true });
    await form.setFile(SAMPLE_PDF_PATH);
    await form.submit();
    await docs.toast('Document published');
    await form.expectClosed();

    const row = docs.row(title);
    await expect(row).toBeVisible();
    await expect(row.getByRole('gridcell', { name: 'v1' })).toBeVisible();
  });

  test('CD-FN-02: employee sees an active, effective, all-employees-shared document', { tag: ['@smoke'] }, async ({ hrDirectoryPage, employeeSelfPage }) => {
    const doc = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-FN-02'), visibility: { allEmployees: true } });

    const docs = new CompanyDocumentsPage(employeeSelfPage);
    await docs.goto();
    expect(await docs.isEmployeeView()).toBe(true);
    // Quick-filter search, not just a large page size — this tenant's
    // accumulated document count already exceeds the 50-row max page size
    // (see CompanyDocumentsPage.search()'s doc comment).
    await docs.search(doc.title);
    await expect(docs.row(doc.title)).toBeVisible();
  });

  test('CD-FN-03: manager\'s list reflects status/category filters and the API\'s search query param, regardless of status/date', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const activeTitle = uniqueDocumentTitle('CD-FN-03-active');
    const archivedDoc = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-FN-03-archived'), category: DOCUMENT_CATEGORIES[1] });
    await createDisposableDocument(hrDirectoryPage, { title: activeTitle, category: DOCUMENT_CATEGORIES[0] });
    const archiveResp = await hrDirectoryPage.request.patch(`/api/company-documents/${archivedDoc.id}/archive`);
    expect(archiveResp.ok()).toBeTruthy();

    const docs = new CompanyDocumentsPage(hrDirectoryPage);
    await docs.goto();
    await expect(docs.row(activeTitle)).toBeVisible();
    await expect(docs.row(archivedDoc.title)).toHaveCount(0); // Active tab is the default view

    await docs.showArchived();
    await expect(docs.row(archivedDoc.title)).toBeVisible();
    await expect(docs.row(activeTitle)).toHaveCount(0);

    await docs.showActive();
    await docs.filterByCategory(DOCUMENT_CATEGORIES[1]);
    await expect(docs.row(activeTitle)).toHaveCount(0); // wrong category, even though active

    // The admin UI wires status/category into query params but never wires a search box
    // (confirmed by reading AdminDocumentsView.tsx) — the API's own `search` param is only reachable directly.
    const searchResp = await hrDirectoryPage.request.get(`/api/company-documents?search=${encodeURIComponent(activeTitle)}`);
    expect(searchResp.ok()).toBeTruthy();
    const results = await searchResp.json();
    expect(results.some((d: { title: string }) => d.title === activeTitle)).toBe(true);
  });

  test('CD-FN-04: GET /:id as a manager includes the shares array', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const doc = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-FN-04'), visibility: { allEmployees: true } });
    const response = await hrDirectoryPage.request.get(`/api/company-documents/${doc.id}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body.shares)).toBe(true);
    expect(body.shares.some((s: { share_type: string }) => s.share_type === 'all')).toBe(true);
  });

  test('CD-FN-05: GET /:id as an employee for a visible document returns it WITHOUT a shares array', { tag: ['@regression'] }, async ({ hrDirectoryPage, employeeSelfPage }) => {
    const doc = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-FN-05'), visibility: { allEmployees: true } });
    const response = await employeeSelfPage.request.get(`/api/company-documents/${doc.id}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.shares).toBeUndefined();
    expect(body.title).toBe(doc.title);
  });

  test('CD-FN-06: editing a document updates its metadata and fully replaces its share rows', { tag: ['@smoke'] }, async ({ hrDirectoryPage, managerPage }) => {
    const originalTitle = uniqueDocumentTitle('CD-FN-06');
    const updatedTitle = `${originalTitle} (edited)`;
    const doc = await createDisposableDocument(hrDirectoryPage, { title: originalTitle, visibility: { allEmployees: true } });

    const docs = new CompanyDocumentsPage(hrDirectoryPage);
    const form = new DocumentFormDialog(hrDirectoryPage);
    await docs.goto();
    await docs.editButton(originalTitle).click();
    await form.waitForOpen();
    await form.fill({ title: updatedTitle, allEmployees: false });
    await form.selectRole('Manager');
    await form.submit();
    await docs.toast('Document updated');
    await form.expectClosed();
    await expect(docs.row(updatedTitle)).toBeVisible();

    // Share rows were fully replaced: 'all' is gone, 'role' (Manager) is now the only share.
    const detail = await (await hrDirectoryPage.request.get(`/api/company-documents/${doc.id}`)).json();
    expect(detail.shares).toHaveLength(1);
    expect(detail.shares[0].share_type).toBe('role');

    const asManager = await (await managerPage.request.get(`/api/company-documents/${doc.id}`)).json();
    expect(asManager.title).toBe(updatedTitle);
  });

  test('CD-FN-09 / CD-UI-07: archiving then restoring a document transitions active -> archived -> active, with the row action flipping labels', { tag: ['@smoke'] }, async ({ hrDirectoryPage }) => {
    const doc = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-FN-09') });
    const docs = new CompanyDocumentsPage(hrDirectoryPage);
    await docs.goto();

    await expect(docs.archiveButton(doc.title)).toBeVisible();
    await docs.archiveButton(doc.title).click();
    await docs.toast('Document archived');
    await expect(docs.row(doc.title)).toHaveCount(0); // left the Active tab
    await docs.showArchived();
    await expect(docs.restoreButton(doc.title)).toBeVisible(); // label flipped Archive -> Restore

    await docs.restoreButton(doc.title).click();
    await docs.toast('Document restored');
    await docs.showActive();
    await expect(docs.archiveButton(doc.title)).toBeVisible(); // label flipped back
  });

  test('CD-FN-10 / CD-UI-06: deleting a document warns it is permanent, then removes it (and every version) transactionally', { tag: ['@smoke'] }, async ({ hrDirectoryPage }) => {
    const doc = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-FN-10') });
    const docs = new CompanyDocumentsPage(hrDirectoryPage);
    const confirm = new ConfirmDialog(hrDirectoryPage, new RegExp(`Delete "${escapeRegex(doc.title)}"\\?`));

    await docs.goto();
    await docs.deleteButton(doc.title).click();
    await confirm.expectVisible();
    await expect(hrDirectoryPage.getByText('This permanently removes the document and every version of it. This cannot be undone.')).toBeVisible();
    await confirm.confirm('Delete');
    await docs.toast('Document deleted');
    await expect(docs.row(doc.title)).toHaveCount(0);

    const getResponse = await hrDirectoryPage.request.get(`/api/company-documents/${doc.id}`);
    expect(getResponse.status()).toBe(404);
  });

  test('CD-FN-11: downloading the current version streams the file as an attachment with the original filename', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const doc = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-FN-11'), fileName: 'sample.pdf', file: SAMPLE_PDF_PATH });
    const response = await hrDirectoryPage.request.get(`/api/company-documents/${doc.id}/download`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-disposition']).toContain('attachment');
    expect(response.headers()['content-disposition']).toContain('sample.pdf');
  });

  test('CD-FN-13 / CD-NG-14: preview serves an inline response for a previewable MIME type and 415s for one that is not', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const previewable = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-FN-13'), fileName: 'sample.pdf', file: SAMPLE_PDF_PATH });
    const okResponse = await hrDirectoryPage.request.get(`/api/company-documents/${previewable.id}/preview`);
    expect(okResponse.ok()).toBeTruthy();
    expect(okResponse.headers()['content-type']).toContain('application/pdf');
    expect(okResponse.headers()['content-disposition']).toContain('inline');

    const notPreviewable = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-NG-14'), fileName: 'sample.docx', file: SAMPLE_DOCX_PATH, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const rejectedResponse = await hrDirectoryPage.request.get(`/api/company-documents/${notPreviewable.id}/preview`);
    expect(rejectedResponse.status()).toBe(415);
  });

  test('CD-UI-01: the same route renders AdminDocumentsView (full CRUD) for a manage holder and EmployeeDocumentsView (read-only) for everyone else', { tag: ['@sanity'] }, async ({ hrDirectoryPage, employeeSelfPage }) => {
    const adminDocs = new CompanyDocumentsPage(hrDirectoryPage);
    await adminDocs.goto();
    expect(await adminDocs.isAdminView()).toBe(true);
    await expect(adminDocs.uploadButton).toBeVisible();

    const employeeDocs = new CompanyDocumentsPage(employeeSelfPage);
    await employeeDocs.goto();
    expect(await employeeDocs.isEmployeeView()).toBe(true);
    await expect(employeeDocs.uploadButton).toHaveCount(0);
  });

  test('CD-UI-09: the employee view\'s category filter re-filters the already-fetched list without a new API call', { tag: ['@regression'] }, async ({ hrDirectoryPage, employeeSelfPage }) => {
    const title = uniqueDocumentTitle('CD-UI-09');
    await createDisposableDocument(hrDirectoryPage, { title, category: DOCUMENT_CATEGORIES[2], visibility: { allEmployees: true } });

    const docs = new CompanyDocumentsPage(employeeSelfPage);
    await docs.goto();
    expect(await docs.isEmployeeView()).toBe(true);
    // Confirm the row is genuinely fetched/rendered first (quick-filter
    // search, not page size alone — see CompanyDocumentsPage.search()'s doc
    // comment), THEN clear the search so the category filter below exercises
    // the real, full, already-fetched list this test is actually about.
    await docs.search(title);
    await expect(docs.row(title)).toBeVisible();
    await docs.clearSearch();

    let listCallsAfterLoad = 0;
    employeeSelfPage.on('request', (req) => {
      if (req.method() === 'GET' && /\/api\/company-documents(\?|$)/.test(new URL(req.url()).pathname + (new URL(req.url()).search || ''))) listCallsAfterLoad += 1;
    });
    await docs.filterByCategory(DOCUMENT_CATEGORIES[2]);
    await expect(docs.row(title)).toBeVisible();
    expect(listCallsAfterLoad).toBe(0); // client-side filter only — no re-fetch
  });
});
