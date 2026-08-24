-- ============================================================
-- Mywe HR — Feature-driven RBAC follow-up.
--
-- SettingsPage.tsx gated 6 unrelated tabs (General Config, Locations /
-- Offices, Holiday Config, Attendance Rules, Menu Management, Roles &
-- Permissions) behind `isSuperAdminLike = users.view.team && users.view.all`
-- — a proxy for "top admin role" with nothing to do with user/team
-- visibility. Meanwhile roles.routes.js and menu.routes.js's write route
-- gated their entire surface behind the generic `settings.manage` catch-all
-- instead of a permission named after what they actually do.
--
-- This migration adds module-specific permissions for every surface above
-- (plus true view/manage splits for shifts and payroll settings, which
-- previously conflated the two) and backfills them onto whichever roles
-- have the *equivalent real access* today, so no existing role loses any
-- capability it currently has. Going forward these new permissions — not
-- settings.manage — are the sole gate (see server/routes/*.js changes in
-- this same change set).
-- ============================================================

-- ---- 1. New permission catalogue rows ----

INSERT INTO permissions (code, module, description)
SELECT v.code, v.module, v.description
FROM (VALUES
    ('company.view',               'company',     'View company profile and branding settings'),
    ('locations.view',             'locations',   'View office locations'),
    ('holidays.view',              'holidays',    'View holiday calendar configuration'),
    ('shifts.view',                'shifts',      'View shift definitions and assignments'),
    ('payroll.settings.view',      'payroll',     'View payroll configuration (pay cycle, overtime, rounding)'),
    ('menu.view',                  'menu',        'View sidebar navigation configuration'),
    ('menu.manage',                'menu',        'Reorder, rename, hide or enable navigation menu items'),
    ('roles.view',                 'roles',       'View roles and their permission grants'),
    ('roles.manage',               'roles',       'Create/delete roles, edit permission grants, assign roles to employees'),
    ('attendance.settings.view',   'attendance',  'View org-wide attendance rules (weekly offs, off Saturdays)'),
    ('attendance.settings.manage', 'attendance',  'Edit org-wide attendance rules (weekly offs, off Saturdays)'),
    ('general.settings.view',      'general',     'View leave allocation categories and the attendance link'),
    ('general.settings.manage',    'general',     'Edit leave allocation categories and the attendance link')
) AS v(code, module, description)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.code = v.code);
GO

-- ---- 2. Backfill: company/locations/holidays GETs are open to every
-- authenticated user today (no permission check at all) — grant the new
-- .view permission to every existing role so gating the GET doesn't
-- regress anyone. ----

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code IN ('company.view', 'locations.view', 'holidays.view')
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO

-- ---- 3. Backfill: shifts.view / payroll.settings.view — these GETs are
-- already restricted to manage-holders today, so only grant view to
-- whoever already holds the matching .manage permission (no widening). ----

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, target.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id AND src.code = 'shifts.manage'
JOIN permissions target ON target.code = 'shifts.view'
WHERE NOT EXISTS (
    SELECT 1 FROM role_permissions rp2 WHERE rp2.role_id = rp.role_id AND rp2.permission_id = target.id
);
GO

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, target.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id AND src.code = 'payroll.settings.manage'
JOIN permissions target ON target.code = 'payroll.settings.view'
WHERE NOT EXISTS (
    SELECT 1 FROM role_permissions rp2 WHERE rp2.role_id = rp.role_id AND rp2.permission_id = target.id
);
GO

-- ---- 4. Backfill: menu / roles / attendance-settings / general-settings —
-- these surfaces are gated by `settings.manage` today (directly, or via
-- isSuperAdminLike client-side which only ever admits roles that also hold
-- settings.manage). Grant the new dedicated permissions to every role that
-- currently holds settings.manage, matching today's real access exactly. ----

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, target.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id AND src.code = 'settings.manage'
CROSS JOIN permissions target
WHERE target.code IN (
    'menu.view', 'menu.manage',
    'roles.view', 'roles.manage',
    'attendance.settings.view', 'attendance.settings.manage',
    'general.settings.view', 'general.settings.manage'
)
AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp2 WHERE rp2.role_id = rp.role_id AND rp2.permission_id = target.id
);
GO

-- ---- 5. The "Settings" sidebar entry required settings.manage, hiding the
-- Security/password-change tab (meant to be visible to everyone) from
-- anyone without it. Open the nav entry to all; per-tab visibility inside
-- SettingsPage.tsx now does the real gating. ----

UPDATE menu_items SET permission = NULL WHERE path = '/settings' AND permission = 'settings.manage';
GO
