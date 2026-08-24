-- ============================================================
-- Mywe HR — Phase 7, part 4: Work Modes.
--
-- Deliberately the smallest of the Phase 7 additions: `work_modes` is a
-- simple tenant-scoped master (seeded Office/WFH/Hybrid/ClientVisit/
-- FieldWork, admin-extensible like departments), and every existing
-- consumer of the free-text `attendance.work_mode` column (attendanceEngine
-- .service.js, the face-attendance kiosk, reports) is left completely
-- untouched. `attendance.work_mode_id` and `users.default_work_mode_id` are
-- additive nullable FKs populated going forward only — no backfill of
-- historical attendance rows.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'work_modes')
CREATE TABLE work_modes (
    id          INT IDENTITY(1,1) NOT NULL,
    tenant_id   INT NOT NULL,
    code        NVARCHAR(30) NOT NULL,
    name        NVARCHAR(100) NOT NULL,
    description NVARCHAR(255) NULL,
    sort_order  INT NOT NULL CONSTRAINT DF_work_modes_sort_order DEFAULT (0),
    is_active   BIT NOT NULL CONSTRAINT DF_work_modes_is_active DEFAULT (1),
    created_at  DATETIME2 NOT NULL CONSTRAINT DF_work_modes_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_work_modes PRIMARY KEY (id),
    CONSTRAINT UQ_work_modes_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT FK_work_modes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_work_modes_tenant_id' AND object_id = OBJECT_ID('work_modes'))
    CREATE INDEX IX_work_modes_tenant_id ON work_modes(tenant_id);
GO

-- Seed defaults for every existing tenant. Codes deliberately match the
-- existing attendance.work_mode / workModeSelectSchema string values
-- ('WFH', 'ClientVisit', 'FieldWork') so a naming-convention linkage exists
-- without needing a translation table.
INSERT INTO work_modes (tenant_id, code, name, description, sort_order)
SELECT t.id, v.code, v.name, v.description, v.sort_order
FROM tenants t
CROSS APPLY (VALUES
    ('Office',      'Office',        'Working from a company office location', 0),
    ('WFH',         'Work From Home', 'Remote work from home',                  10),
    ('Hybrid',      'Hybrid',        'Split between office and remote days',    20),
    ('ClientVisit', 'Client Visit',  'On-site at a client location',            30),
    ('FieldWork',   'Field Work',    'Field/on-location work with no fixed site', 40)
) AS v(code, name, description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM work_modes wm WHERE wm.tenant_id = t.id AND wm.code = v.code);
GO

IF COL_LENGTH('attendance', 'work_mode_id') IS NULL
BEGIN
    ALTER TABLE attendance ADD work_mode_id INT NULL;
    ALTER TABLE attendance ADD CONSTRAINT FK_attendance_work_mode FOREIGN KEY (work_mode_id) REFERENCES work_modes(id);
END
GO

IF COL_LENGTH('users', 'default_work_mode_id') IS NULL
BEGIN
    ALTER TABLE users ADD default_work_mode_id INT NULL;
    ALTER TABLE users ADD CONSTRAINT FK_users_default_work_mode FOREIGN KEY (default_work_mode_id) REFERENCES work_modes(id);
END
GO

IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'work-modes.manage')
INSERT INTO permissions (code, module, description) VALUES
    ('work-modes.manage', 'work-modes', 'Create and edit work modes and assign an employee''s default work mode');
GO

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'work-modes.manage'
  AND r.code IN ('hr', 'super_admin')
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO

-- Seed a "Work Modes" child under the Settings menu group for every tenant.
INSERT INTO menu_items (tenant_id, parent_id, name, path, icon, module, permission, any_permission, sort_order, is_active, is_placeholder)
SELECT parent.tenant_id, parent.id, 'Work Modes', '/work-modes', 'Laptop', 'settings', 'work-modes.manage', NULL, 10, 1, 0
FROM menu_items parent
WHERE parent.path = '/settings' AND parent.parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.tenant_id = parent.tenant_id AND mi.path = '/work-modes');
GO
