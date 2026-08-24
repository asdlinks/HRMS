-- ============================================================
-- Mywe HR — Phase 7, part 2: Dynamic Navigation.
--
-- Adds parent/child grouping, a `module` tag (used for feature-flag gating)
-- and a feature-enabled flag to the existing `menu_items` table, then
-- upgrades every existing tenant's flat 006_menu_items.sql seed in place —
-- matched by `path` and UPDATEd, never deleted+reinserted, so any admin
-- customization already saved via Settings > Menu Management (renamed
-- labels, reordering, hidden items) survives the upgrade.
--
-- `is_active` continues to mean "hidden from the nav" (existing meaning);
-- the new `is_feature_enabled` means "the backend routes for this module
-- should also reject requests" — a distinct, coarser switch a tenant admin
-- can use to turn an entire module off without hiding one menu item at a
-- time. GET /menu/tree (menu.routes.js) is what actually renders navigation
-- from here on; client/src/config/menuConfig.ts's static array becomes the
-- fallback used only if this table is ever empty for a tenant.
-- ============================================================

IF COL_LENGTH('menu_items', 'parent_id') IS NULL
    ALTER TABLE menu_items ADD parent_id INT NULL;
GO
IF COL_LENGTH('menu_items', 'module') IS NULL
    ALTER TABLE menu_items ADD module NVARCHAR(50) NULL;
GO
IF COL_LENGTH('menu_items', 'is_feature_enabled') IS NULL
    ALTER TABLE menu_items ADD is_feature_enabled BIT NOT NULL CONSTRAINT DF_menu_items_is_feature_enabled DEFAULT (1);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_menu_items_parent')
    ALTER TABLE menu_items ADD CONSTRAINT FK_menu_items_parent FOREIGN KEY (parent_id) REFERENCES menu_items(id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_menu_items_tenant_parent' AND object_id = OBJECT_ID('menu_items'))
    CREATE INDEX IX_menu_items_tenant_parent ON menu_items(tenant_id, parent_id);
GO

-- ---------------- upgrade existing flat rows in place ----------------

-- "Daily Check-In" becomes the Time & Leave group header (module = 'time').
UPDATE menu_items SET name = 'Time & Leave', module = 'time' WHERE path = '/attendance' AND parent_id IS NULL;
GO
UPDATE menu_items SET module = 'people' WHERE path = '/employees' AND parent_id IS NULL;
GO
UPDATE menu_items SET module = 'reports' WHERE path = '/reports';
GO
UPDATE menu_items SET module = 'payroll' WHERE path = '/payroll' AND parent_id IS NULL;
GO
UPDATE menu_items SET module = 'dashboard' WHERE path = '/dashboard';
GO
UPDATE menu_items SET module = 'recruitment' WHERE path = '/recruitment';
GO
UPDATE menu_items SET module = 'performance' WHERE path = '/performance';
GO
UPDATE menu_items SET module = 'assets' WHERE path = '/assets';
GO
UPDATE menu_items SET module = 'settings' WHERE path = '/settings';
GO

-- Department / My Team become children of the Employees (people) row.
UPDATE mi
SET mi.parent_id = parent.id, mi.module = 'people'
FROM menu_items mi
JOIN menu_items parent ON parent.tenant_id = mi.tenant_id AND parent.path = '/employees' AND parent.parent_id IS NULL
WHERE mi.path IN ('/department', '/my-team') AND mi.tenant_id = parent.tenant_id;
GO

-- Leaves / Leave Cancellation / Holiday Calendar become children of the
-- Time & Leave (formerly Daily Check-In) row.
UPDATE mi
SET mi.parent_id = parent.id, mi.module = 'time'
FROM menu_items mi
JOIN menu_items parent ON parent.tenant_id = mi.tenant_id AND parent.path = '/attendance' AND parent.parent_id IS NULL
WHERE mi.path IN ('/leaves', '/cancellation', '/holidays') AND mi.tenant_id = parent.tenant_id;
GO

-- ---------------- seed new child rows the flat 006 seed never had ----------------

INSERT INTO menu_items (tenant_id, parent_id, name, path, icon, module, permission, any_permission, sort_order, is_active, is_placeholder)
SELECT parent.tenant_id, parent.id, v.name, v.path, v.icon, 'time', v.permission, NULL, v.sort_order, 1, 0
FROM menu_items parent
CROSS APPLY (VALUES
    ('Attendance Policies', '/attendance/policies',      'ShieldCheck',        'attendance.policy.manage', 65),
    ('Kiosk Devices',       '/attendance/kiosk-devices', 'MonitorSmartphone',  'attendance.device.manage', 66),
    ('Face Enrollment',     '/attendance/face-enrollment', 'ScanFace',         'attendance.face.enroll',   67)
) AS v(name, path, icon, permission, sort_order)
WHERE parent.path = '/attendance' AND parent.parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.tenant_id = parent.tenant_id AND mi.path = v.path);
GO

INSERT INTO menu_items (tenant_id, parent_id, name, path, icon, module, permission, any_permission, sort_order, is_active, is_placeholder)
SELECT parent.tenant_id, parent.id, v.name, v.path, v.icon, 'payroll', v.permission, v.any_permission, v.sort_order, 1, 0
FROM menu_items parent
CROSS APPLY (VALUES
    ('Salary Components',    '/payroll/components',  'ListChecks', 'payroll.components.manage', NULL, 91),
    ('Salary Structures',    '/payroll/structures',  'FileStack',  'payroll.structures.manage', NULL, 92),
    ('Employee Assignments', '/payroll/assignments', 'UserCog',    'payroll.assign',            NULL, 93),
    ('Payroll Runs',         '/payroll/runs',        'Banknote',   NULL, 'payroll.process,payroll.approve', 94),
    ('Overtime',             '/payroll/overtime',    'Clock',      NULL, 'payroll.overtime.apply,payroll.overtime.approve,payroll.view.own', 95),
    ('Payslips',             '/payroll/payslips',    'Receipt',    NULL, 'payroll.view.own,payroll.view.team,payroll.view.all', 96),
    ('Reports',              '/payroll/reports',     'BarChart3',  'payroll.view.all', NULL, 97),
    ('Settings',             '/payroll/settings',    'Settings2',  'payroll.settings.manage', NULL, 98)
) AS v(name, path, icon, permission, any_permission, sort_order)
WHERE parent.path = '/payroll' AND parent.parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.tenant_id = parent.tenant_id AND mi.path = v.path);
GO
