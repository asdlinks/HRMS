-- ============================================================
-- Mywe HR — Phase 10B: Reports & Analytics Platform.
--
-- 1. `users.gender` / `users.last_login_at` — two small additive columns
--    needed by explicitly-requested reports (Gender Distribution, User
--    Login Report) that have no other data source. Full login *history*
--    and the Audit report category are deliberately NOT built here (no
--    audit_log table yet) — this only tracks the single most-recent login.
-- 2. `reports.*` permission catalogue — replaces the single monolithic
--    `reports.view` gate with per-category, scope-suffixed permissions
--    (own/team/all), mirroring the `payroll.view.{own,team,all}` precedent
--    from 012_payroll_permissions.sql. `reports.view` itself is left alone
--    (030_org_admin_core.sql's payroll_admin/attendance_admin seeds still
--    reference it) — new code just stops requiring it.
-- 3. `report_favorites` / `report_saved_filters` — per-user UI state for
--    the new Reports Dashboard's Favorites/Saved Reports categories.
-- ============================================================

-- ---- 1. Schema additions ----

IF COL_LENGTH('users', 'gender') IS NULL
    ALTER TABLE users ADD gender NVARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_users_gender')
    ALTER TABLE users ADD CONSTRAINT CK_users_gender CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Other'));
GO

IF COL_LENGTH('users', 'last_login_at') IS NULL
    ALTER TABLE users ADD last_login_at DATETIME2 NULL;
GO

-- ---- 2. Permission catalogue ----

IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'reports.dashboard.view')
INSERT INTO permissions (code, module, description) VALUES
    ('reports.dashboard.view',      'reports', 'View the Reports Dashboard (KPIs and charts)'),
    ('reports.employee.view.own',   'reports', 'View your own employee reports'),
    ('reports.employee.view.team', 'reports', 'View employee reports for your direct/indirect reports'),
    ('reports.employee.view.all',  'reports', 'View employee reports for everyone in the organization'),
    ('reports.attendance.view.own',   'reports', 'View your own attendance reports'),
    ('reports.attendance.view.team',  'reports', 'View attendance reports for your direct/indirect reports'),
    ('reports.attendance.view.all',   'reports', 'View attendance reports for everyone in the organization'),
    ('reports.leave.view.own',   'reports', 'View your own leave reports'),
    ('reports.leave.view.team',  'reports', 'View leave reports for your direct/indirect reports'),
    ('reports.leave.view.all',   'reports', 'View leave reports for everyone in the organization'),
    ('reports.payroll.view.own',   'reports', 'View your own payroll reports'),
    ('reports.payroll.view.team',  'reports', 'View payroll reports for your direct/indirect reports'),
    ('reports.payroll.view.all',   'reports', 'View payroll reports for everyone in the organization'),
    ('reports.organization.view', 'reports', 'View organization-wide structural reports (branches, departments, designations, cost centers)'),
    ('reports.compliance.view',  'reports', 'View compliance/statutory reports'),
    ('reports.audit.view',       'reports', 'View the audit trail report');
GO

-- own-scope: every default role gets a personal view of their own data.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code IN (
    'reports.dashboard.view', 'reports.employee.view.own', 'reports.attendance.view.own', 'reports.leave.view.own', 'reports.payroll.view.own'
)
  AND r.code IN ('employee', 'manager', 'hr', 'super_admin', 'payroll_admin', 'attendance_admin')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
GO

-- manager: team-level visibility across employee/attendance/leave/payroll.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code IN (
    'reports.employee.view.team', 'reports.attendance.view.team', 'reports.leave.view.team', 'reports.payroll.view.team'
)
  AND r.code = 'manager'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
GO

-- hr / super_admin: full organization-wide visibility across every category.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code IN (
    'reports.employee.view.all', 'reports.attendance.view.all', 'reports.leave.view.all', 'reports.payroll.view.all',
    'reports.organization.view', 'reports.compliance.view'
)
  AND r.code IN ('hr', 'super_admin')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
GO

-- super_admin only: the audit trail (sensitive even as a stub).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'reports.audit.view'
  AND r.code = 'super_admin'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
GO

-- payroll_admin: payroll reports + org-wide structural/compliance context, no employee/attendance/leave oversight.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code IN ('reports.payroll.view.all', 'reports.organization.view', 'reports.compliance.view')
  AND r.code = 'payroll_admin'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
GO

-- attendance_admin: attendance reports org-wide + structural context.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code IN ('reports.attendance.view.all', 'reports.organization.view')
  AND r.code = 'attendance_admin'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
GO

-- ---- Reports nav item: any of the new view permissions unlocks it, not just reports.view ----
-- The full reports.* permission list is 401 chars — over the original
-- NVARCHAR(400), which this column has needed since 006_menu_items.sql;
-- widen it rather than truncate the permission list.
ALTER TABLE menu_items ALTER COLUMN any_permission NVARCHAR(1000) NULL;
GO

UPDATE menu_items
SET permission = NULL,
    any_permission = 'reports.dashboard.view,reports.employee.view.own,reports.employee.view.team,reports.employee.view.all,' +
                      'reports.attendance.view.own,reports.attendance.view.team,reports.attendance.view.all,' +
                      'reports.leave.view.own,reports.leave.view.team,reports.leave.view.all,' +
                      'reports.payroll.view.own,reports.payroll.view.team,reports.payroll.view.all,' +
                      'reports.organization.view,reports.compliance.view,reports.audit.view'
WHERE path = '/reports';
GO

-- ---- 3. Favorites / saved filters ----

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'report_favorites')
CREATE TABLE report_favorites (
    id          INT IDENTITY(1,1) NOT NULL,
    tenant_id   INT NOT NULL,
    user_id     INT NOT NULL,
    report_id   NVARCHAR(60) NOT NULL,
    created_at  DATETIME2 NOT NULL CONSTRAINT DF_report_favorites_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_report_favorites PRIMARY KEY (id),
    CONSTRAINT UQ_report_favorites_user_report UNIQUE (tenant_id, user_id, report_id),
    CONSTRAINT FK_report_favorites_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT FK_report_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'report_saved_filters')
CREATE TABLE report_saved_filters (
    id          INT IDENTITY(1,1) NOT NULL,
    tenant_id   INT NOT NULL,
    user_id     INT NOT NULL,
    report_id   NVARCHAR(60) NOT NULL,
    name        NVARCHAR(200) NOT NULL,
    filters     NVARCHAR(MAX) NOT NULL, -- JSON
    created_at  DATETIME2 NOT NULL CONSTRAINT DF_report_saved_filters_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_report_saved_filters PRIMARY KEY (id),
    CONSTRAINT FK_report_saved_filters_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT FK_report_saved_filters_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_report_favorites_user' AND object_id = OBJECT_ID('report_favorites'))
CREATE INDEX IX_report_favorites_user ON report_favorites(tenant_id, user_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_report_saved_filters_user' AND object_id = OBJECT_ID('report_saved_filters'))
CREATE INDEX IX_report_saved_filters_user ON report_saved_filters(tenant_id, user_id, report_id);
GO
