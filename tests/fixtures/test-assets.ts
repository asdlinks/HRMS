import path from 'path';

/**
 * Resolved absolute paths to the small, committed binary fixtures under
 * e2e/test-assets/documents/ — introduced for the Company Documents suite
 * (the first module in this framework needing real file-upload fixtures).
 * Content is deliberately trivial for every one of these: server/routes/
 * companyDocuments.routes.js's `fileFilter` checks only the file extension,
 * never magic bytes, so a byte-perfect PDF/DOCX isn't required for any
 * upload/version/download/preview-header assertion this suite makes. Kept
 * small and few on purpose — see docs/CompanyDocuments_TestCases.csv's
 * planning report §4 for why an oversized (20MB+) fixture is generated at
 * test-runtime instead of committed here.
 */
const DOCUMENTS_DIR = path.join(__dirname, '../test-assets/documents');

/** Minimal valid PDF — previewable (application/pdf is in PREVIEWABLE_MIME_TYPES on both client and server). */
export const SAMPLE_PDF_PATH = path.join(DOCUMENTS_DIR, 'sample.pdf');

/** Minimal valid 1x1 PNG — previewable. */
export const SAMPLE_PNG_PATH = path.join(DOCUMENTS_DIR, 'sample.png');

/** Valid extension, NOT in PREVIEWABLE_MIME_TYPES — drives the 415 preview-rejection path (CD-NG-14). */
export const SAMPLE_DOCX_PATH = path.join(DOCUMENTS_DIR, 'sample.docx');

/** Extension outside ALLOWED_EXTENSIONS entirely — drives CD-NG-01. */
export const DISALLOWED_EXTENSION_PATH = path.join(DOCUMENTS_DIR, 'disallowed.exe');

/** Plain-text content mislabeled with a .pdf extension — drives CD-SC-04 (extension-only checking, never content/magic bytes). */
export const SPOOFED_PDF_PATH = path.join(DOCUMENTS_DIR, 'spoofed.pdf');

/** Reused (not duplicated) for the Company Profile Settings suite's logo-upload happy path — well under its 300KB client-side size cap, and its non-image-rejecting `accept="image/*"` filter is exactly as bypassable via setInputFiles as it is here. */
export const VALID_LOGO_PATH = SAMPLE_PNG_PATH;
