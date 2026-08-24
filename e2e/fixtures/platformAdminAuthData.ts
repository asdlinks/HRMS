import { uniqueSuffix } from './test-data';

/**
 * PA-BD-11/PA-VD-14 — platformAdminChangePasswordSchema's
 * newPassword: z.string().min(8). Mirrors fixtures/test-data.ts's
 * PASSWORD_BOUNDARY convention.
 */
export const PLATFORM_ADMIN_NEW_PASSWORD_LENGTH_BOUNDARY = [
  { value: 'Aa1defgh', shouldPass: true, label: 'exactly 8 characters (at the minimum)' },
  { value: 'Aa1defg', shouldPass: false, label: '7 characters (one under the minimum)' },
] as const;

/** A syntactically-valid, unique-per-call password for the change-password
 * test group's temporary intermediate value (distinct from the boundary
 * value above, used where the exact length doesn't matter) — built on
 * uniqueSuffix() per this suite's own uniqueness convention. */
export function uniqueTempPassword(): string {
  return `TempPw1!${uniqueSuffix()}`;
}

/** A value that is never the real current password of any seeded
 * platform-admin test account — used by PA-NG-08 (wrong current password). */
export const WRONG_CURRENT_PASSWORD = 'Definitely-Not-The-Real-Password-123';
