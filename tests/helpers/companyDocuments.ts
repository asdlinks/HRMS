/**
 * Shared "arrange"/API helpers for the Company Documents suite
 * (docs/CompanyDocuments_TestCases.csv). No existing helper file touches
 * this module — per FRAMEWORK_GUIDELINES.md this gets its own file rather
 * than being bolted onto seed.ts/leave.ts/payroll.ts.
 *
 * Deliberately API-level (page.request.*), same shape as helpers/rbac.ts's
 * createRoleApi()/helpers/payroll.ts's createPayrollRunApi() — most tests in
 * this suite need a disposable document to exist as fast, reliable setup so
 * the test itself can focus on the actual assertion (visibility, lifecycle
 * transition, permission guard...), not on repeating the multipart-upload
 * dance every time.
 */
import fs from 'fs';
import { type APIResponse, type Page } from '@playwright/test';
import { assertOk } from './rbac';
import { uniqueDocumentTitle, todayIso, DOCUMENT_CATEGORIES } from '../fixtures/companyDocuments-data';
import { SAMPLE_PDF_PATH } from '../fixtures/test-assets';

/** Mirrors server/routes/companyDocuments.routes.js's own MAX_FILE_SIZE_BYTES exactly. */
export const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

export interface DocumentVisibilityInput {
  allEmployees?: boolean;
  roleIds?: number[];
  departmentIds?: number[];
  locationIds?: number[];
}

export interface UploadDocumentOverrides {
  title?: string;
  category?: string;
  description?: string | null;
  effective_date?: string;
  expiry_date?: string | null;
  visibility?: DocumentVisibilityInput;
  /**
   * Bypasses the normal `JSON.stringify(visibility)` step entirely — for a
   * deliberately malformed payload (CD-NG-09) or a shape the
   * DocumentVisibilityInput type wouldn't allow (CD-VD-04's non-array
   * roleIds). Takes precedence over `visibility` when both are set.
   */
  visibilityRaw?: string;
  /** Defaults to fixtures/test-assets.ts's SAMPLE_PDF_PATH — pass a Buffer directly for a runtime-generated file (e.g. the oversized-file boundary case), or `null` to omit the file field entirely (CD-NG-03). */
  file?: string | Buffer | null;
  fileName?: string;
  mimeType?: string;
}

function resolveFile(overrides: { file?: string | Buffer | null; fileName?: string; mimeType?: string }): { buffer: Buffer; name: string; mimeType: string } {
  const source = overrides.file ?? SAMPLE_PDF_PATH;
  const buffer = Buffer.isBuffer(source) ? source : fs.readFileSync(source);
  const name = overrides.fileName ?? (typeof source === 'string' ? source.split(/[\\/]/).pop()! : 'upload.bin');
  const mimeType = overrides.mimeType ?? (name.endsWith('.pdf') ? 'application/pdf' : name.endsWith('.png') ? 'image/png' : 'application/octet-stream');
  return { buffer, name, mimeType };
}

type MultipartPayload = Record<string, string | { name: string; mimeType: string; buffer: Buffer }>;

/**
 * Builds the multipart field set POST /company-documents expects
 * (title/category/description/effective_date/expiry_date + a
 * JSON-stringified `visibility` field + `file` — mirrors
 * client/src/api/companyDocuments.ts's createCompanyDocument exactly), as a
 * plain object rather than sending the request. Every negative/validation
 * test that needs to deliberately break one field (a malformed visibility
 * string, a missing file, a non-array roleIds) builds off this instead of
 * re-assembling the other 4-5 fields by hand each time — see
 * uploadDocumentApi() below for the common "just send it" case.
 */
export function buildDocumentMultipart(overrides: UploadDocumentOverrides = {}): MultipartPayload {
  const payload: MultipartPayload = {
    title: overrides.title ?? uniqueDocumentTitle(),
    category: overrides.category ?? DOCUMENT_CATEGORIES[0],
    description: overrides.description ?? '',
    effective_date: overrides.effective_date ?? todayIso(),
    expiry_date: overrides.expiry_date ?? '',
    visibility: overrides.visibilityRaw ?? JSON.stringify(overrides.visibility ?? { allEmployees: true }),
  };
  if (overrides.file !== null) {
    const { buffer, name, mimeType } = resolveFile(overrides);
    payload.file = { name, mimeType, buffer };
  }
  return payload;
}

/**
 * POSTs a new document via buildDocumentMultipart() above. Returns the raw
 * response — deliberately does NOT assert success, so negative/validation
 * tests (CD-NG-* / CD-VD-*) can use this same builder and assert their own
 * expected 400/415/etc. Only a manage-holding persona's page can succeed
 * here (company-documents.manage) — callers proving a permission gate pass
 * a lower-privilege persona's page on purpose.
 */
export async function uploadDocumentApi(page: Page, overrides: UploadDocumentOverrides = {}): Promise<APIResponse> {
  return page.request.post('/api/company-documents', { multipart: buildDocumentMultipart(overrides) });
}

export interface DisposableDocument {
  id: number;
  title: string;
  category: string;
  effectiveDate: string;
  expiryDate: string | null;
  visibility: DocumentVisibilityInput;
}

/**
 * Convenience wrapper over uploadDocumentApi() for the common "I just need a
 * real document to exist" arrange step — asserts success (via
 * helpers/rbac.ts's assertOk) and echoes back the fields most call sites
 * need next, the same success-asserting-wrapper-over-a-raw-builder shape as
 * helpers/rbac.ts's createRoleApi() over a raw page.request.post.
 */
export async function createDisposableDocument(page: Page, overrides: UploadDocumentOverrides = {}): Promise<DisposableDocument> {
  const title = overrides.title ?? uniqueDocumentTitle();
  const category = overrides.category ?? DOCUMENT_CATEGORIES[0];
  const effectiveDate = overrides.effective_date ?? todayIso();
  const expiryDate = overrides.expiry_date ?? null;
  const visibility = overrides.visibility ?? { allEmployees: true };

  const response = await uploadDocumentApi(page, { ...overrides, title, category, effective_date: effectiveDate, expiry_date: expiryDate ?? undefined, visibility });
  assertOk(response);
  const body = await response.json();
  return { id: body.id, title, category, effectiveDate, expiryDate, visibility };
}

export interface UploadVersionOverrides {
  file?: string | Buffer;
  fileName?: string;
  mimeType?: string;
}

/**
 * POSTs a new version for an existing document (multipart, file-only — the
 * real contract has no metadata fields on this route, confirmed by reading
 * companyDocuments.routes.js's POST /:id/versions). Returns the raw
 * response for the same reason uploadDocumentApi() does — negative tests
 * (CD-NG-05/CD-PM-04's permission checks) need the unsuccessful response,
 * not a thrown error.
 */
export async function uploadVersionApi(page: Page, documentId: number, overrides: UploadVersionOverrides = {}): Promise<APIResponse> {
  const { buffer, name, mimeType } = resolveFile(overrides);
  return page.request.post(`/api/company-documents/${documentId}/versions`, {
    multipart: { file: { name, mimeType, buffer } },
  });
}

export interface OwnProfile {
  id: number;
  name: string;
  email: string;
  department_id: number | null;
  location_id: number | null;
}

/**
 * Resolves the CURRENT persona's own department_id/location_id — needed for
 * the department/branch-scoped visibility rows (CD-FN-15) since this
 * framework has no fixture for logging in as a freshly created employee
 * (see FRAMEWORK_TECH_DEBT.md's C2), so department/branch visibility can
 * only be proven against a fixed persona's OWN real department/location, not
 * a disposable one created for the test. Side-effect-free (POST
 * /auth/refresh just re-signs a token and rotates the refresh cookie, the
 * same call helpers/rbac.ts's requireRolesManage() already uses to read a
 * live permission claim) — safe to call before any other setup in a test.
 */
export async function getOwnProfile(page: Page): Promise<OwnProfile> {
  const response = await page.request.post('/api/auth/refresh');
  assertOk(response);
  const body = await response.json();
  return body.user;
}

/** A byte buffer one over the server's 20MB limit — generated at test-runtime, never committed (see fixtures/test-assets.ts's doc comment for why). */
export function oversizedFileBuffer(): Buffer {
  return Buffer.alloc(MAX_UPLOAD_SIZE_BYTES + 1);
}

/** A byte buffer at exactly the server's advertised 20MB limit — confirmed live (2026-08-07) to be REJECTED, not accepted; see CD-BD-01's "(confirmed gap)" test and docs/HRMS_PRODUCT_DEFECT_REGISTER.md's CD-001 for the off-by-one this exposes. */
export function exactLimitFileBuffer(): Buffer {
  return Buffer.alloc(MAX_UPLOAD_SIZE_BYTES);
}
