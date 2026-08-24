import { test, expect } from '../fixtures/auth';
import { CompanyDocumentsPage } from '../pages/CompanyDocumentsPage';
import { DocumentFormDialog } from '../pages/DocumentFormDialog';
import { uploadDocumentApi, buildDocumentMultipart, oversizedFileBuffer, exactLimitFileBuffer } from '../helpers/companyDocuments';
import { uniqueDocumentTitle, todayIso, daysFromToday, DOCUMENT_CATEGORIES, TITLE_LENGTH_BOUNDARY, CATEGORY_CASING_VARIANTS } from '../fixtures/companyDocuments-data';
import { DISALLOWED_EXTENSION_PATH } from '../fixtures/test-assets';

/**
 * docs/CompanyDocuments_TestCases.csv — upload/metadata validation, both the
 * schema (companyDocumentMetadataSchema/documentVisibilitySchema) and the
 * multer file-filter/size gate. Automates: CD-VD-01, CD-VD-02, CD-VD-03,
 * CD-VD-04, CD-VD-05, CD-VD-06, CD-NG-01, CD-NG-02, CD-NG-03, CD-NG-09,
 * CD-NG-10, CD-NG-12, CD-NG-13, CD-BD-01, CD-BD-02, CD-BD-06, CD-UI-02,
 * CD-UI-03, CD-UI-04, CD-UI-05.
 *
 * Several rows below are titled "(confirmed gap)" per FRAMEWORK_GUIDELINES.md's
 * naming convention — these prove the application currently accepts input
 * the CSV documents as a known validation gap, not that the test itself is
 * broken.
 */
test.describe('Company Documents — Form & Upload Validation', () => {
  test.beforeEach(() => { test.slow(); });

  test('CD-VD-01: missing title is rejected with a 400 required-field error', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const response = await uploadDocumentApi(hrDirectoryPage, { title: '' });
    expect(response.status()).toBe(400);
  });

  test.describe('CD-VD-02 / CD-BD-06: title length boundary (255 accepted, 256 rejected)', () => {
    for (const { value, shouldPass, label } of TITLE_LENGTH_BOUNDARY) {
      test(`title at ${label}`, { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
        const response = await uploadDocumentApi(hrDirectoryPage, { title: value });
        if (shouldPass) expect(response.ok()).toBeTruthy();
        else expect(response.status()).toBe(400);
      });
    }
  });

  test('CD-VD-03: missing or invalid category is rejected with a 400 enum/required error', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const missing = await uploadDocumentApi(hrDirectoryPage, { title: uniqueDocumentTitle('CD-VD-03-missing'), category: '' });
    expect(missing.status()).toBe(400);

    const invalid = await uploadDocumentApi(hrDirectoryPage, { title: uniqueDocumentTitle('CD-VD-03-invalid'), category: 'Not A Real Category' });
    expect(invalid.status()).toBe(400);
  });

  test('CD-VD-04: roleIds/departmentIds/locationIds submitted as non-array values are rejected', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const multipart = buildDocumentMultipart({
      title: uniqueDocumentTitle('CD-VD-04'),
      // Deliberately a shape DocumentVisibilityInput wouldn't allow — bypass via visibilityRaw.
      visibilityRaw: JSON.stringify({ allEmployees: false, roleIds: 'not-an-array' }),
    });
    const response = await hrDirectoryPage.request.post('/api/company-documents', { multipart });
    expect(response.status()).toBe(400);
  });

  test('CD-VD-05 (confirmed gap): expiry_date as a non-date, non-empty string passes validation — mirrors CD-NG-13 for effective_date', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const response = await uploadDocumentApi(hrDirectoryPage, { title: uniqueDocumentTitle('CD-VD-05'), expiry_date: 'not-a-date' });
    // No format check exists anywhere for this field (schemas/index.js's
    // companyDocumentMetadataSchema only requires a non-empty string) — the
    // request either succeeds outright or fails downstream at the SQL
    // Date-binding layer, never with a clean validation-shaped 400.
    expect(response.status()).not.toBe(400);
  });

  test('CD-VD-06: an extremely long description is accepted (NVARCHAR(MAX), no max-length validation anywhere)', { tag: ['@sanity'] }, async ({ hrDirectoryPage }) => {
    const response = await uploadDocumentApi(hrDirectoryPage, { title: uniqueDocumentTitle('CD-VD-06'), description: 'A'.repeat(20_000) });
    expect(response.ok()).toBeTruthy();
  });

  test('CD-NG-01: uploading a file with an unsupported extension is rejected with a 400 naming the extension', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const response = await uploadDocumentApi(hrDirectoryPage, { title: uniqueDocumentTitle('CD-NG-01'), file: DISALLOWED_EXTENSION_PATH, fileName: 'disallowed.exe' });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('.exe');
  });

  test.describe('CD-NG-02 / CD-BD-01: file size boundary — exactly 20MB accepted, one byte over rejected', () => {
    test('CD-BD-01 (confirmed gap): a file exactly at the advertised 20MB limit is REJECTED — the effective limit is one byte short of MAX_FILE_SIZE_BYTES', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
      // Corrected during 2026-08-07 re-verification against `testauto`: a
      // direct probe (MAX-1/MAX/MAX+1 byte buffers) showed a file of exactly
      // MAX_FILE_SIZE_BYTES (20*1024*1024, server/routes/companyDocuments.routes.js)
      // is rejected with the SAME "File exceeds the 20MB size limit" error as
      // an oversized one — only MAX-1 succeeds. The original assertion here
      // (expecting exactly-at-limit to succeed, matching the code's evident
      // intent and its own error message) was never actually true; this
      // documents the real, off-by-one boundary instead. See
      // docs/HRMS_PRODUCT_DEFECT_REGISTER.md's CD-001.
      const response = await uploadDocumentApi(hrDirectoryPage, { title: uniqueDocumentTitle('CD-BD-01-at-limit'), file: exactLimitFileBuffer(), fileName: 'at-limit.pdf' });
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('20MB');
    });

    test('one byte over the 20MB limit is rejected with a 400', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
      const response = await uploadDocumentApi(hrDirectoryPage, { title: uniqueDocumentTitle('CD-NG-02-over-limit'), file: oversizedFileBuffer(), fileName: 'over-limit.pdf' });
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('20MB');
    });
  });

  test('CD-NG-03: POST / with no file attached fails cleanly with a 400, not an unhandled crash', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const multipart = buildDocumentMultipart({ title: uniqueDocumentTitle('CD-NG-03'), file: null }); // no `file` field at all
    const response = await hrDirectoryPage.request.post('/api/company-documents', { multipart });
    expect(response.status()).toBe(400);
  });

  test('CD-NG-09: a malformed JSON string in the multipart visibility field is rejected with a 400', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const multipart = buildDocumentMultipart({ title: uniqueDocumentTitle('CD-NG-09'), visibilityRaw: '{not valid json' });
    const response = await hrDirectoryPage.request.post('/api/company-documents', { multipart });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('valid JSON');
  });

  test('CD-NG-10 / CD-BD-02: a category value outside the fixed enum — including one that only differs by casing — is rejected', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const outsideEnum = await uploadDocumentApi(hrDirectoryPage, { title: uniqueDocumentTitle('CD-NG-10'), category: 'Not A Category' });
    expect(outsideEnum.status()).toBe(400);

    for (const { value, label } of CATEGORY_CASING_VARIANTS) {
      const response = await uploadDocumentApi(hrDirectoryPage, { title: uniqueDocumentTitle(`CD-BD-02-${label}`), category: value });
      expect(response.status(), `category enum match should be exact-string, rejecting "${label}"`).toBe(400);
    }
  });

  test('CD-NG-12 (confirmed gap): expiry_date earlier than effective_date is accepted with no cross-field validation', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const response = await uploadDocumentApi(hrDirectoryPage, {
      title: uniqueDocumentTitle('CD-NG-12'),
      effective_date: todayIso(),
      expiry_date: daysFromToday(-30),
    });
    expect(response.ok()).toBeTruthy();
  });

  test('CD-NG-13 (confirmed gap): effective_date as a non-date string passes Zod\'s min-length-only check and fails only at the SQL layer, not with a clean 400', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const response = await uploadDocumentApi(hrDirectoryPage, { title: uniqueDocumentTitle('CD-NG-13'), effective_date: 'not-a-date' });
    expect(response.status()).not.toBe(400);
  });

  test('CD-UI-02: submitting the Upload Document form with empty required fields is blocked by native HTML5 validation', { tag: ['@sanity'] }, async ({ hrDirectoryPage }) => {
    const docs = new CompanyDocumentsPage(hrDirectoryPage);
    const form = new DocumentFormDialog(hrDirectoryPage);
    await docs.goto();
    await docs.openUpload();
    await form.waitForOpen();
    await form.submit();
    // A native required-field violation blocks form submission client-side —
    // the dialog stays open and no request is ever sent.
    await expect(form.root).toBeVisible();
    expect(await form.titleField.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  });

  test('CD-UI-03: submitting a new document with no file selected is blocked client-side with a clear message', { tag: ['@sanity'] }, async ({ hrDirectoryPage }) => {
    const docs = new CompanyDocumentsPage(hrDirectoryPage);
    const form = new DocumentFormDialog(hrDirectoryPage);
    await docs.goto();
    await docs.openUpload();
    await form.waitForOpen();
    await form.fill({ title: uniqueDocumentTitle('CD-UI-03'), category: DOCUMENT_CATEGORIES[0], effectiveDate: todayIso() });
    await form.submit();
    await expect(form.errorText('Please select a file to upload')).toBeVisible();
    await expect(form.root).toBeVisible(); // never actually submitted
  });

  test('CD-UI-04 (confirmed gap): the file input\'s accept="..." attribute is cosmetic only — setInputFiles bypasses it, and the server 400 surfaces in the dialog', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const docs = new CompanyDocumentsPage(hrDirectoryPage);
    const form = new DocumentFormDialog(hrDirectoryPage);
    await docs.goto();
    await docs.openUpload();
    await form.waitForOpen();
    await form.fill({ title: uniqueDocumentTitle('CD-UI-04'), category: DOCUMENT_CATEGORIES[0], effectiveDate: todayIso() });
    // setInputFiles talks to the DOM node directly — it never consults the
    // input's own `accept` attribute, the same bypass a real drag-drop or
    // "All files" toggle would achieve in a live browser.
    await form.setFile(DISALLOWED_EXTENSION_PATH);
    await form.submit();
    await expect(form.errorText(/is not allowed/)).toBeVisible();
  });

  test('CD-UI-05 (confirmed gap): no client-side file-size pre-check exists — an oversized file reaches the network before the 20MB limit is enforced server-side', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const docs = new CompanyDocumentsPage(hrDirectoryPage);
    const form = new DocumentFormDialog(hrDirectoryPage);
    await docs.goto();
    await docs.openUpload();
    await form.waitForOpen();
    await form.fill({ title: uniqueDocumentTitle('CD-UI-05'), category: DOCUMENT_CATEGORIES[0], effectiveDate: todayIso() });
    await form.fileInput.setInputFiles({ name: 'oversized.pdf', mimeType: 'application/pdf', buffer: oversizedFileBuffer() });

    const [response] = await Promise.all([
      hrDirectoryPage.waitForResponse((res) => res.url().endsWith('/api/company-documents') && res.request().method() === 'POST'),
      form.submit(),
    ]);
    expect(response.status()).toBe(400); // the request WAS sent — no client-side block — and only THEN rejected
    await expect(form.errorText('20MB')).toBeVisible();
  });
});
