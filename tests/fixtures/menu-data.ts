/**
 * Data-driven fixtures for the Menu Management suite
 * (docs/MenuManagement_TestCases.csv). Widths below are
 * menu_items' actual NVARCHAR column limits (server/migrations/mssql/
 * 006_menu_items.sql / 021_menu_items_hierarchy.sql) — menuItemSchema
 * (server/schemas/index.js) mirrors none of them (MM-BD-01's "confirmed
 * gap"), so an over-limit value is only ever rejected at the DB layer, not
 * by Zod.
 */
import { uniqueSuffix } from './test-data';

export function uniqueMenuName(label = ''): string {
  return `E2E Menu ${label} ${uniqueSuffix()}`.trim();
}

export function uniqueMenuPath(label = ''): string {
  return `/e2e-menu-${label ? `${label}-` : ''}${uniqueSuffix()}`;
}

/** A minimal, schema-valid top-level menu item — override any field per test. */
export function buildMenuItem(overrides: Partial<{
  id: string | number; parent_id: string | number | null; name: string; path: string; icon: string;
  module: string | null; permission: string | null; anyPermission: string[]; sort_order: number;
  is_active: boolean; is_placeholder: boolean; is_feature_enabled: boolean;
}> = {}) {
  return {
    id: overrides.id ?? `e2e-${uniqueSuffix()}`,
    parent_id: overrides.parent_id ?? null,
    name: overrides.name ?? uniqueMenuName(),
    path: overrides.path ?? uniqueMenuPath(),
    icon: overrides.icon ?? 'Settings',
    module: overrides.module ?? null,
    permission: overrides.permission ?? null,
    anyPermission: overrides.anyPermission,
    sort_order: overrides.sort_order ?? 9999,
    is_active: overrides.is_active ?? true,
    is_placeholder: overrides.is_placeholder ?? false,
    is_feature_enabled: overrides.is_feature_enabled ?? true,
  };
}

// MM-BD-01 — name NVARCHAR(100): at-limit accepted, over-limit only fails at the DB layer.
export const NAME_WIDTH_BOUNDARY = [
  { value: 'A'.repeat(100), shouldPass: true, label: '100 characters (at the DB column limit)' },
  { value: 'A'.repeat(101), shouldPass: false, label: '101 characters (one over — DB-layer failure, not schema)' },
];

// MM-BD-01 — path NVARCHAR(200): at-limit accepted, over-limit only fails at the DB layer.
// A fixed unique prefix keeps the padded value collision-free across runs.
export function pathWidthBoundary(): Array<{ value: string; shouldPass: boolean; label: string }> {
  const prefix = `/e2e-${uniqueSuffix()}-`;
  const pad = (len: number) => prefix + 'p'.repeat(Math.max(0, len - prefix.length));
  return [
    { value: pad(200), shouldPass: true, label: '200 characters (at the DB column limit)' },
    { value: pad(201), shouldPass: false, label: '201 characters (one over — DB-layer failure, not schema)' },
  ];
}

// MM-BD-01 — icon NVARCHAR(50): at-limit accepted, over-limit only fails at the DB layer.
export const ICON_WIDTH_BOUNDARY = [
  { value: 'I'.repeat(50), shouldPass: true, label: '50 characters (at the DB column limit)' },
  { value: 'I'.repeat(51), shouldPass: false, label: '51 characters (one over — DB-layer failure, not schema)' },
];
