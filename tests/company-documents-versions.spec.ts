import { test, expect } from '../fixtures/auth';
import { CompanyDocumentsPage } from '../pages/CompanyDocumentsPage';
import { VersionHistoryDialog } from '../pages/VersionHistoryDialog';
import { createDisposableDocument, uploadVersionApi } from '../helpers/companyDocuments';
import { uniqueDocumentTitle } from '../fixtures/companyDocuments-data';
import { SAMPLE_PDF_PATH, SAMPLE_PNG_PATH } from '../fixtures/test-assets';

/**
 * docs/CompanyDocuments_TestCases.csv — versioning. Automates: CD-FN-07,
 * CD-FN-08, CD-FN-12, CD-BD-05, CD-UI-08, CD-NG-05, CD-PM-04.
 *
 * Uses `hrDirectoryPage` as the manage persona throughout, not `adminPage`
 * — see company-documents-lifecycle.spec.ts's header comment for why.
 */
test.describe('Company Documents — Versions', () => {
  test.beforeEach(() => { test.slow(); });

  test('CD-FN-07 / CD-FN-08: uploading a new version increments version_number, repoints current_version_id, and lists newest-first', { tag: ['@smoke'] }, async ({ hrDirectoryPage }) => {
    const doc = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-FN-07'), fileName: 'sample.pdf', file: SAMPLE_PDF_PATH });

    const versionResponse = await uploadVersionApi(hrDirectoryPage, doc.id, { fileName: 'sample.png', file: SAMPLE_PNG_PATH });
    expect(versionResponse.ok()).toBeTruthy();

    const detail = await (await hrDirectoryPage.request.get(`/api/company-documents/${doc.id}`)).json();
    expect(detail.version_number).toBe(2); // current_version_id repointed to the new version

    const versions = await (await hrDirectoryPage.request.get(`/api/company-documents/${doc.id}/versions`)).json();
    expect(versions).toHaveLength(2);
    expect(versions.map((v: { version_number: number }) => v.version_number)).toEqual([2, 1]); // newest first
    expect(versions[0].original_file_name).toBe('sample.png');
    expect(versions[1].original_file_name).toBe('sample.pdf');
  });

  test('CD-FN-12: a manager can download a specific historical version via ?versionId=, distinct from the current one', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const doc = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-FN-12'), fileName: 'sample.pdf', file: SAMPLE_PDF_PATH });
    await uploadVersionApi(hrDirectoryPage, doc.id, { fileName: 'sample.png', file: SAMPLE_PNG_PATH });

    const versions = await (await hrDirectoryPage.request.get(`/api/company-documents/${doc.id}/versions`)).json();
    const v1 = versions.find((v: { version_number: number }) => v.version_number === 1);

    const currentDownload = await hrDirectoryPage.request.get(`/api/company-documents/${doc.id}/download`);
    expect(currentDownload.headers()['content-disposition']).toContain('sample.png');

    const historicalDownload = await hrDirectoryPage.request.get(`/api/company-documents/${doc.id}/download?versionId=${v1.id}`);
    expect(historicalDownload.ok()).toBeTruthy();
    expect(historicalDownload.headers()['content-disposition']).toContain('sample.pdf');
  });

  test('CD-BD-05: no version-count ceiling exists — every sequential version persists and stays individually downloadable', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    // Scaled down from the CSV's illustrative "50+" to 8 — this is an
    // API-level loop (no UI overhead), but 50 sequential round trips against
    // a shared remote dev server would add real wall-clock cost for a row
    // whose entire point (no ceiling exists) is already proven by any N > 1
    // that keeps succeeding. See the Automation Planning Report's Test Data
    // Strategy note on scaling "many" rows to a representative count.
    const TOTAL_VERSIONS = 8;
    const doc = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-BD-05'), fileName: 'sample.pdf', file: SAMPLE_PDF_PATH });

    for (let i = 2; i <= TOTAL_VERSIONS; i++) {
      const response = await uploadVersionApi(hrDirectoryPage, doc.id, { fileName: 'sample.png', file: SAMPLE_PNG_PATH });
      expect(response.ok()).toBeTruthy();
    }

    const versions = await (await hrDirectoryPage.request.get(`/api/company-documents/${doc.id}/versions`)).json();
    expect(versions).toHaveLength(TOTAL_VERSIONS);

    const oldest = versions[versions.length - 1];
    const downloadOldest = await hrDirectoryPage.request.get(`/api/company-documents/${doc.id}/download?versionId=${oldest.id}`);
    expect(downloadOldest.ok()).toBeTruthy();
  });

  test('CD-UI-08: the Version History dialog\'s per-version download button requests that specific version', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const doc = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-UI-08'), fileName: 'sample.pdf', file: SAMPLE_PDF_PATH });
    await uploadVersionApi(hrDirectoryPage, doc.id, { fileName: 'sample.png', file: SAMPLE_PNG_PATH });

    const docs = new CompanyDocumentsPage(hrDirectoryPage);
    const history = new VersionHistoryDialog(hrDirectoryPage);
    await docs.goto();
    await docs.versionHistoryButton(doc.title).click();
    await history.waitForOpen();
    expect(await history.versionCount()).toBe(2);

    const [request] = await Promise.all([
      hrDirectoryPage.waitForRequest((req) => req.url().includes(`/company-documents/${doc.id}/download`) && req.url().includes('versionId=')),
      history.downloadButton(1).click(),
    ]);
    expect(request.url()).toContain('versionId=');
  });

  test('CD-NG-05 / CD-PM-04: a versionId-qualified download/preview always requires company-documents.manage, even for a document otherwise visible to the caller', { tag: ['@regression'] }, async ({ hrDirectoryPage, employeeSelfPage }) => {
    const doc = await createDisposableDocument(hrDirectoryPage, { title: uniqueDocumentTitle('CD-NG-05'), visibility: { allEmployees: true }, fileName: 'sample.pdf', file: SAMPLE_PDF_PATH });
    await uploadVersionApi(hrDirectoryPage, doc.id, { fileName: 'sample.png', file: SAMPLE_PNG_PATH });
    const versions = await (await hrDirectoryPage.request.get(`/api/company-documents/${doc.id}/versions`)).json();
    const v1 = versions.find((v: { version_number: number }) => v.version_number === 1);

    // The document itself IS visible to this employee (shared with all) — proving the versionId qualifier is the thing being blocked, not general visibility.
    const plainGet = await employeeSelfPage.request.get(`/api/company-documents/${doc.id}`);
    expect(plainGet.ok()).toBeTruthy();

    const downloadAttempt = await employeeSelfPage.request.get(`/api/company-documents/${doc.id}/download?versionId=${v1.id}`);
    expect(downloadAttempt.status()).toBe(403);

    const previewAttempt = await employeeSelfPage.request.get(`/api/company-documents/${doc.id}/preview?versionId=${v1.id}`);
    expect(previewAttempt.status()).toBe(403);
  });
});
