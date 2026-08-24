const { many, one, run, transaction, sql } = require('../db/sql');
const { GATEABLE_MODULES } = require('../utils/planModules');

// Server-side fallback used only if a tenant somehow has zero menu_items rows
// (e.g. a provisioning bug) — keeps parity with client/src/config/menuConfig.ts
// so no tenant ever renders with a broken/empty nav.
const DEFAULT_MENU_TREE = [
    { id: 'fallback-dashboard', name: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard', permission: null, anyPermission: null, children: [] },
    { id: 'fallback-people', name: 'Employees', path: '/employees', icon: 'Users', permission: null, anyPermission: ['users.view.team', 'users.view.all'], children: [
        { id: 'fallback-department', name: 'Department', path: '/department', icon: 'Building2', permission: 'departments.manage', anyPermission: null },
        { id: 'fallback-my-team', name: 'My Team', path: '/my-team', icon: 'UsersRound', permission: null, anyPermission: null },
    ] },
    { id: 'fallback-time', name: 'Time & Leave', path: '/attendance', icon: 'ClipboardList', permission: null, anyPermission: null, children: [
        { id: 'fallback-leaves', name: 'Leaves', path: '/leaves', icon: 'CalendarClock', permission: null, anyPermission: null },
        { id: 'fallback-holidays', name: 'Holiday Calendar', path: '/holidays', icon: 'CalendarDays', permission: null, anyPermission: null },
    ] },
    { id: 'fallback-reports', name: 'Reports', path: '/reports', icon: 'FileText', permission: 'reports.view', anyPermission: null, children: [] },
    { id: 'fallback-settings', name: 'Settings', path: '/settings', icon: 'Settings', permission: 'settings.manage', anyPermission: null, children: [] },
];

function listMenuItems(tenantId) {
    return many(
        `SELECT id, parent_id, name, path, icon, module, permission, any_permission, sort_order, is_active, is_placeholder, is_feature_enabled
         FROM menu_items WHERE tenant_id = @tenantId ORDER BY sort_order, id`,
        { tenantId: { type: sql.Int, value: tenantId } }
    );
}

function parseAnyPermission(value) {
    return value ? String(value).split(',').filter(Boolean) : null;
}

// Every authenticated user's own nav, already permission-filtered and
// nested by parent_id — mirrors the predicate TopNav.tsx/ContextSidebar.tsx
// used to apply client-side. Falls back to a hardcoded tree if this tenant
// has no rows at all, so a provisioning gap never renders an empty nav.
async function getMenuTree(tenantId, permissions) {
    const rows = await many(
        `SELECT id, parent_id, name, path, icon, module, permission, any_permission, sort_order, is_placeholder
         FROM menu_items
         WHERE tenant_id = @tenantId AND is_active = 1 AND is_feature_enabled = 1
         ORDER BY sort_order, id`,
        { tenantId: { type: sql.Int, value: tenantId } }
    );
    if (rows.length === 0) return DEFAULT_MENU_TREE;

    const grantedSet = new Set(permissions || []);
    const isVisible = (row) => {
        if (row.permission) return grantedSet.has(row.permission);
        const anyPerm = parseAnyPermission(row.any_permission);
        if (anyPerm) return anyPerm.some((p) => grantedSet.has(p));
        return true;
    };

    const visible = rows.filter(isVisible);
    const byId = new Map(visible.map((r) => [r.id, {
        id: r.id,
        name: r.name,
        path: r.path,
        icon: r.icon,
        module: r.module,
        permission: r.permission,
        anyPermission: parseAnyPermission(r.any_permission),
        is_placeholder: !!r.is_placeholder,
        children: [],
    }]));

    const tree = [];
    for (const row of visible) {
        const node = byId.get(row.id);
        if (row.parent_id && byId.has(row.parent_id)) {
            byId.get(row.parent_id).children.push(node);
        } else if (!row.parent_id) {
            tree.push(node);
        }
        // A child whose parent got filtered out by permissions is dropped
        // rather than promoted to top-level — it's not independently
        // navigable as a module tab.
    }
    return tree;
}

// Used by requireFeatureEnabled() — is_feature_enabled on the top-level
// (parent_id IS NULL) row for a module tag gates every route under it.
function getModuleFeatureFlag(tenantId, moduleTag) {
    return one(
        `SELECT TOP 1 is_feature_enabled FROM menu_items
         WHERE tenant_id = @tenantId AND module = @module AND parent_id IS NULL`,
        { tenantId: { type: sql.Int, value: tenantId }, module: { type: sql.NVarChar(50), value: moduleTag } }
    );
}

// Replaces the full navigation set for a tenant in one transaction — the
// Menu Management UI always sends the complete, reordered list back.
// Parent references are resolved by matching the submitted `id` values to
// freshly-inserted rows (a full replace can't reuse old ids), so parent
// rows must appear before their children in `items`.
function replaceMenuItems(tenantId, items) {
    return transaction(async (tx) => {
        await tx.run('DELETE FROM menu_items WHERE tenant_id = @tenantId', {
            tenantId: { type: sql.Int, value: tenantId },
        });

        const oldIdToNewId = new Map();
        for (const [index, item] of items.entries()) {
            const parentNewId = item.parent_id != null ? oldIdToNewId.get(item.parent_id) ?? null : null;
            const result = await tx.run(
                `INSERT INTO menu_items (tenant_id, parent_id, name, path, icon, module, permission, any_permission, sort_order, is_active, is_placeholder, is_feature_enabled)
                 OUTPUT INSERTED.id
                 VALUES (@tenantId, @parentId, @name, @path, @icon, @module, @permission, @anyPermission, @sortOrder, @isActive, @isPlaceholder, @isFeatureEnabled)`,
                {
                    tenantId: { type: sql.Int, value: tenantId },
                    parentId: { type: sql.Int, value: parentNewId },
                    name: { type: sql.NVarChar(100), value: item.name },
                    path: { type: sql.NVarChar(200), value: item.path },
                    icon: { type: sql.NVarChar(50), value: item.icon },
                    module: { type: sql.NVarChar(50), value: item.module || null },
                    permission: { type: sql.NVarChar(100), value: item.permission || null },
                    anyPermission: {
                        type: sql.NVarChar(400),
                        value: Array.isArray(item.anyPermission) && item.anyPermission.length > 0
                            ? item.anyPermission.join(',')
                            : null,
                    },
                    sortOrder: { type: sql.Int, value: item.sort_order ?? index * 10 },
                    isActive: { type: sql.Bit, value: item.is_active !== false },
                    isPlaceholder: { type: sql.Bit, value: !!item.is_placeholder },
                    isFeatureEnabled: { type: sql.Bit, value: item.is_feature_enabled !== false },
                }
            );
            if (item.id != null) oldIdToNewId.set(item.id, result.recordset[0].id);
        }
    });
}

// Applies a Subscription Plan's enabled_modules to a tenant's top-level
// menu_items rows (Phase 13E, Part 8) — used both at provisioning time and
// whenever a Platform Admin reassigns a company's plan. `executor` defaults
// to a standalone `run` call, but accepts `tx.run` so this can also
// participate in provisionCompany's single provisioning transaction.
async function applyPlanModules(tenantId, enabledModules, executor = run) {
    const enabledSet = new Set(enabledModules || []);
    for (const module of GATEABLE_MODULES) {
        await executor(
            `UPDATE menu_items SET is_feature_enabled = @enabled
             WHERE tenant_id = @tenantId AND parent_id IS NULL AND module = @module`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                module: { type: sql.NVarChar(50), value: module },
                enabled: { type: sql.Bit, value: enabledSet.has(module) ? 1 : 0 },
            }
        );
    }
}

module.exports = { listMenuItems, replaceMenuItems, getMenuTree, getModuleFeatureFlag, applyPlanModules };
