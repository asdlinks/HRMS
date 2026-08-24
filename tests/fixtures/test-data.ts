/**
 * Data-driven fixtures for the Employee Master suite. Each spec imports the
 * slice it needs and iterates with test.describe/test per row — see
 * e2e/tests/employee-creation.spec.ts for the pattern.
 */

let counter = 0;
/**
 * Unique per test-run suffix — avoids EM-NG-01 (duplicate email) colliding
 * across runs. `process.pid` is appended (not prepended) deliberately:
 * Playwright runs each worker as its own OS process (playwright.config.ts's
 * `workers` + `fullyParallel: true`), so two workers' *first* calls can land
 * in the same millisecond with the same counter value (`1`) — a bare
 * `Date.now()+counter` string would then collide across workers on every
 * run. `uniqueAadhaar()` below takes only the last 12 characters of this
 * string, so the pid must be the suffix (not the prefix) to survive that
 * truncation.
 */
export function uniqueSuffix(): string {
  counter += 1;
  return `${Date.now()}${counter}${process.pid}`;
}

export function uniqueEmployee(overrides: Partial<{
  name: string; email: string; employeeId: string; dateOfBirth: string; joiningDate: string;
}> = {}) {
  const suffix = uniqueSuffix();
  return {
    name: overrides.name ?? `E2E Test User ${suffix}`,
    email: overrides.email ?? `e2e.user.${suffix}@example.test`,
    employeeId: overrides.employeeId ?? `E2E-${suffix}`,
    dateOfBirth: overrides.dateOfBirth ?? '1995-06-15',
    joiningDate: overrides.joiningDate ?? new Date().toISOString().slice(0, 10),
    password: 'ValidPass123',
  };
}

// EM-BD-01 — probation_period boundary (<=24 accepted, 25 rejected)
export const PROBATION_PERIOD_BOUNDARY = [
  { value: '24', shouldPass: true, label: 'at the 24-month limit' },
  { value: '25', shouldPass: false, label: 'one month over the limit' },
];

/**
 * A syntactically valid, per-run-unique Aadhaar/PAN pair — Aadhaar/PAN carry
 * a tenant-agnostic (see EM-SC-02) unique index, so a hardcoded "valid"
 * value only ever succeeds once, globally, until manually freed. Confirmed
 * live: pii-banking.spec.ts's EM-FN-13 and employee-detail-profile.spec.ts's
 * KNOWN_AADHAAR/KNOWN_PAN both used fixed literals here and began failing
 * with a 409 ("already assigned to another employee") after enough repeated
 * suite runs. Both derive from uniqueSuffix() so they stay collision-free
 * without needing their own counter.
 */
export function uniqueAadhaar(): string {
  return uniqueSuffix().replace(/\D/g, '').padStart(12, '0').slice(-12);
}

/**
 * A plain `Number(uniqueSuffix())` seed loses integer precision once the
 * concatenated digits exceed Number.MAX_SAFE_INTEGER (~16 digits) — a real
 * risk as this suite scales and `uniqueSuffix()` grows (timestamp + counter
 * + pid). Distinct suffix strings would then round to the same double and
 * produce the same "unique" PAN. A bounded polynomial hash over the string
 * stays a safe integer regardless of input length.
 */
function hashToSafeInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) % 2147483647;
  }
  return h;
}

export function uniquePan(): string {
  const seed = hashToSafeInt(uniqueSuffix());
  const letters = (start: number, count: number) => {
    let out = '';
    let x = start;
    for (let i = 0; i < count; i++) { out += String.fromCharCode(65 + (x % 26)); x = Math.floor(x / 26); }
    return out;
  };
  const digits = String(seed % 10000).padStart(4, '0');
  return `${letters(seed, 5)}${digits}${letters(seed + 1, 1)}`;
}

// EM-BD-02 / EM-NG-03 — Aadhaar must be exactly 12 digits
export const AADHAAR_BOUNDARY = [
  { value: '123456789012', shouldPass: true, label: '12 digits (valid)' },
  { value: '12345678901', shouldPass: false, label: '11 digits (too short)' },
  { value: '1234567890123', shouldPass: false, label: '13 digits (too long)' },
];

// EM-BD-03 / EM-NG-04 — PAN must match ^[A-Z]{5}[0-9]{4}[A-Z]$
export const PAN_BOUNDARY = [
  { value: 'ABCDE1234F', shouldPass: true, label: 'exact pattern match' },
  { value: 'ABCDE1234', shouldPass: false, label: 'missing trailing letter' },
  { value: 'ABCD1234FF', shouldPass: false, label: 'only 4 leading letters' },
];

// EM-BD-04 / EM-NG-06 — password minimum length is 6
export const PASSWORD_BOUNDARY = [
  { value: 'abc123', shouldPass: true, label: 'exactly 6 characters' },
  { value: 'abc12', shouldPass: false, label: '5 characters (one under)' },
];

// EM-BD-06 — date_of_birth: empty string rejected, single char passes min-length only
export const DOB_BOUNDARY = [
  { value: '', shouldPass: false, label: 'empty string' },
  { value: '1', shouldPass: true, label: 'single character (passes min-length, no format check)' },
];

// EM-VD-05 — banking fields have no server-side format validation (confirmed gap)
export const INVALID_BANKING_SAMPLE = {
  accountHolderName: 'Test Holder',
  bankName: 'Test Bank',
  branch: 'Test Branch',
  accountNumber: 'NOT-A-NUMBER-!!',
  ifsc: 'not-an-ifsc',
  upi: 'not-a-upi-id',
};

// EM-BD-07 — org structure name at NVARCHAR(150) limit vs one over
export const NAME_LENGTH_BOUNDARY = [
  { value: 'A'.repeat(150), shouldPass: true, label: '150 characters (at limit)' },
  { value: 'A'.repeat(151), shouldPass: false, label: '151 characters (over limit)' },
];

// EM-BD-08 — bank_account_number/bank_ifsc_code/bank_upi_id NVARCHAR column
// limits (50/20/100 — 043_banking_information_employee_master.sql). No
// server-side format validation exists (EM-VD-05), so plain repeated
// characters are enough to probe the length boundary itself.
export const BANKING_LENGTH_BOUNDARY = [
  { field: 'accountNumber' as const, atLimit: '1'.repeat(50), overLimit: '1'.repeat(51), label: 'account number' },
  { field: 'ifsc' as const, atLimit: 'A'.repeat(20), overLimit: 'A'.repeat(21), label: 'IFSC code' },
  { field: 'upi' as const, atLimit: 'a'.repeat(100), overLimit: 'a'.repeat(101), label: 'UPI ID' },
];

export const SQL_INJECTION_PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  "admin'--",
];

export const XSS_PAYLOAD = '<script>window.__xssFired = true;</script>';
