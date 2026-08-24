-- ============================================================
-- Mywe HR — Phase 10A: Organization Administration core.
--
-- 1. User lifecycle: `status` (active/disabled/exited) + `exit_date` replace
--    hard-delete as the default offboarding path — Disable/Enable becomes
--    the primary action; DELETE stays available but is no longer the first
--    thing an admin reaches for. This is also what makes future Inactive/
--    Exit-Employee/Attrition reporting possible at all.
-- 2. `roles.description` — finally wires the column
--    roles.repository.js's createRole has reserved since Phase 9
--    ("void description; // reserved for a future roles.description column").
-- 3. `users.unlock` — a new, dedicated permission (mirrors the existing
--    `users.password.reset` precedent: sensitive single-purpose account
--    actions get their own permission, not bundled into `users.manage`).
-- 4. Default roles become deletable templates ("customers may... delete
--    unused roles") — except the root Organization Administrator
--    (`super_admin`), which stays protected so a tenant can never delete its
--    own last admin route back in.
-- 5. Display names updated for clarity — role `code` values are UNCHANGED,
--    so nothing that references a role by code breaks.
-- 6. New default roles for every existing tenant: Payroll Administrator,
--    Attendance Administrator — splitting responsibilities that were
--    previously folded into HR Administrator / Organization Administrator,
--    per the earlier RBAC business-responsibility review this session.
-- 7. HR Administrator and Manager are tightened to match that same review:
--    payroll processing/approval, attendance-infrastructure configuration,
--    and org/system-admin permissions move to the new dedicated roles (or
--    stay Organization-Administrator-only) instead of being bundled into
--    every admin-ish role by accident of history.
-- ============================================================

-- ---- 1. User status + exit date ----

IF COL_LENGTH('users', 'status') IS NULL
    ALTER TABLE users ADD status NVARCHAR(20) NOT NULL CONSTRAINT DF_users_status DEFAULT ('active');
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_users_status')
    ALTER TABLE users ADD CONSTRAINT CK_users_status CHECK (status IN ('active', 'disabled', 'exited'));
GO

IF COL_LENGTH('users', 'exit_date') IS NULL
    ALTER TABLE users ADD exit_date DATE NULL;
GO

-- ---- 2. roles.description ----

IF COL_LENGTH('roles', 'description') IS NULL
    ALTER TABLE roles ADD description NVARCHAR(500) NULL;
GO

-- ---- 3. users.unlock permission ----

IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'users.unlock')
INSERT INTO permissions (code, module, description) VALUES
    ('users.unlock', 'users', 'Unlock a user account after too many failed login attempts');
GO

-- Same distribution as the existing users.password.reset precedent (hr +
-- super_admin only — manager never got password-reset either).
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, target.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id AND src.code = 'users.password.reset'
JOIN permissions target ON target.code = 'users.unlock'
WHERE NOT EXISTS (
    SELECT 1 FROM role_permissions rp2 WHERE rp2.role_id = rp.role_id AND rp2.permission_id = target.id
);
GO

-- ---- 4. Default roles become deletable (except the root Organization Administrator) ----

UPDATE roles SET is_system = 0 WHERE code IN ('hr', 'manager', 'employee');
GO

-- ---- 5. Display name updates (codes unchanged) ----

UPDATE roles SET name = 'Organization Administrator' WHERE code = 'super_admin';
UPDATE roles SET name = 'HR Administrator' WHERE code = 'hr';
GO

-- ---- 6. New default roles for every existing tenant ----

INSERT INTO roles (tenant_id, code, name, is_system)
SELECT t.id, v.code, v.name, 0
FROM tenants t
CROSS JOIN (VALUES ('payroll_admin', 'Payroll Administrator'), ('attendance_admin', 'Attendance Administrator')) AS v(code, name)
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.tenant_id = t.id AND r.code = v.code);
GO

-- Payroll Administrator: payroll domain only — no user/system administration.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'payroll_admin'
  AND p.code IN (
    'payroll.settings.view', 'payroll.settings.manage', 'payroll.components.manage', 'payroll.structures.manage',
    'payroll.assign', 'payroll.process', 'payroll.approve', 'payroll.overtime.apply', 'payroll.overtime.approve',
    'payroll.view.own', 'payroll.view.all', 'salary-grades.manage',
    'reports.view', 'company.view', 'locations.view', 'holidays.view', 'users.view.directory'
  )
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
GO

-- Attendance Administrator: shift/attendance-infrastructure domain only.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'attendance_admin'
  AND p.code IN (
    'shifts.view', 'shifts.manage', 'attendance.policy.manage', 'attendance.device.manage', 'attendance.face.enroll',
    'attendance.settings.view', 'attendance.settings.manage', 'work-modes.manage',
    'attendance.checkin', 'attendance.view.team',
    'reports.view', 'company.view', 'locations.view', 'holidays.view', 'users.view.directory'
  )
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
GO

-- ---- 7. Tighten HR Administrator ----
-- Keeps: employee lifecycle (users.*), leave, holidays/locations/departments,
-- announcements, reports, and *.view oversight into payroll/shifts/attendance
-- settings (all already granted). Loses hands-on payroll processing/
-- approval, attendance-infrastructure config, and org/system-admin actions.

DELETE rp
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id AND r.code = 'hr'
JOIN permissions p ON p.id = rp.permission_id
WHERE p.code IN (
    'payroll.settings.manage', 'payroll.components.manage', 'payroll.structures.manage', 'payroll.assign',
    'payroll.process', 'payroll.approve', 'payroll.overtime.apply', 'payroll.overtime.approve',
    'attendance.policy.manage', 'attendance.device.manage', 'attendance.face.enroll', 'attendance.settings.manage',
    'shifts.manage', 'work-modes.manage', 'salary-grades.manage',
    'company.manage', 'menu.manage', 'roles.manage', 'general.settings.manage', 'settings.manage'
);
GO

-- ---- 8. Tighten Manager ----
-- Keeps: team leave approval, team attendance/payroll visibility, overtime
-- approval, directory/team visibility, reporting. Loses org/system-admin
-- permissions a line manager was never meant to hold by default.

DELETE rp
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id AND r.code = 'manager'
JOIN permissions p ON p.id = rp.permission_id
WHERE p.code IN (
    'users.manage', 'holidays.manage', 'company.manage', 'settings.manage',
    'menu.manage', 'roles.manage', 'attendance.settings.manage', 'general.settings.manage'
);
GO
