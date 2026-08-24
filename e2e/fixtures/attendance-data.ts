/**
 * Data-driven fixtures for the Attendance/Shifts/Work Modes/Attendance
 * Policies suite — mirrors test-data.ts's uniqueX() pattern but kept in its
 * own file since test-data.ts is Employee Master-specific despite its
 * generic name. `uniqueSuffix()` itself (the counter) is genuinely generic
 * and reused as-is rather than duplicated — see fixtures/test-data.ts.
 */
import { uniqueSuffix } from './test-data';

export function uniqueShiftName(prefix = 'E2E Shift'): string {
  return `${prefix} ${uniqueSuffix()}`;
}

export function uniqueWorkMode(overrides: Partial<{ code: string; name: string; description: string }> = {}) {
  const suffix = uniqueSuffix();
  return {
    code: overrides.code ?? `E2E${suffix}`,
    name: overrides.name ?? `E2E Work Mode ${suffix}`,
    description: overrides.description ?? 'Created by Playwright E2E',
  };
}

export function uniquePolicyName(prefix = 'E2E Policy'): string {
  return `${prefix} ${uniqueSuffix()}`;
}

// ATE-BD-09 — geofence radius extremes; both are expected to save without a
// client-side error (the UI applies no min/max validation on this field).
export const GEOFENCE_RADIUS_BOUNDARY = [
  { value: '0', label: 'zero radius (effectively requires an exact coordinate match)' },
  { value: '100000', label: 'a very large (100km) radius' },
];

// ATE-BD-05 — shift numeric fields currently have no client-side lower bound
// (documents a known gap called out in docs/Attendance_AutomationDesign.md §5).
export const SHIFT_NUMERIC_FIELD_BOUNDARY = [
  { value: '0', shouldPass: true, label: 'zero (valid)' },
  { value: '-5', shouldPass: false, label: 'negative (expected invalid, but the client has no bounds check today)' },
];
