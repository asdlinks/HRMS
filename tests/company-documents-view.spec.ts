import { test, expect } from '../fixtures/auth';
import { CompanyDocumentsPage } from '../pages/CompanyDocumentsPage';
import { createDisposableDocument } from '../helpers/companyDocuments';
import { uniqueDocumentTitle } from '../fixtures/companyDocuments-data';
import { SAMPLE_PDF_PATH } from '../fixtures/test-assets';

test('Access company documents', { tag: ['@smoke'] }, async ({ hrDirectoryPage, employeeSelfPage }) => {
  const title = uniqueDocumentTitle('company-documents-view');
  const document = await createDisposableDocument(hrDirectoryPage, {
    title,
    visibility: { allEmployees: true },
    fileName: 'sample.pdf',
    file: SAMPLE_PDF_PATH,
  });

  const documents = new CompanyDocumentsPage(employeeSelfPage);
  await documents.goto();
  expect(await documents.isEmployeeView()).toBe(true);
  await expect(documents.categoryFilter).toBeVisible();

  await documents.search(document.title);
  const row = documents.row(document.title);
  await expect(row).toBeVisible();
  await expect(row.getByRole('gridcell', { name: document.title, exact: true })).toBeVisible();

  const download = documents.downloadButton(document.title);
  await expect(download).toBeVisible();
  await expect(download).toBeEnabled();
  const responsePromise = employeeSelfPage.waitForResponse(
    (response) => response.url().includes(`/api/company-documents/${document.id}/download`) && response.ok(),
  );
  await download.click();
  await expect(await responsePromise).toBeTruthy();
});
