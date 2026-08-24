-- ============================================================
-- Mywe HR — Payroll (Phase 4), part 4: permissions.
--
-- New payroll permission codes, granted to the seeded roles following the
-- exact idempotent INSERT pattern used by 007_leaves_notify_permission.sql
-- and 008_user_dob_announcements.sql.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'payroll.settings.manage')
INSERT INTO permissions (code, module, description) VALUES
    ('payroll.settings.manage',   'payroll', 'Configure pay cycle, overtime rate, rounding and currency settings'),
    ('payroll.components.manage', 'payroll', 'Create and edit salary components (earnings/deductions)'),
    ('payroll.structures.manage', 'payroll', 'Create and edit salary structures and their component mappings'),
    ('payroll.assign',            'payroll', 'Assign a salary structure, CTC and bank details to an employee'),
    ('payroll.process',           'payroll', 'Create and process payroll runs'),
    ('payroll.approve',           'payroll', 'Approve, mark paid and publish payslips for a payroll run'),
    ('payroll.overtime.apply',    'payroll', 'Submit overtime hours for an employee'),
    ('payroll.overtime.approve',  'payroll', 'Approve or reject submitted overtime hours'),
    ('payroll.view.own',          'payroll', 'View your own payslips and payroll history'),
    ('payroll.view.team',         'payroll', 'View payroll summaries and payslip history for your direct/indirect reports'),
    ('payroll.view.all',          'payroll', 'View payroll data and reports for everyone in the organization');
GO

-- employee: sees only their own payslip/history.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'payroll.view.own'
  AND r.code IN ('employee', 'manager', 'hr', 'super_admin')
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO

-- manager: team payroll visibility + approving their reports' overtime, but
-- no configuration access and no ability to enter OT hours or process pay
-- (maker/checker split — HR is the maker for OT, manager is the checker).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code IN ('payroll.view.team', 'payroll.overtime.approve')
  AND r.code = 'manager'
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO

-- hr / super_admin: own the entire payroll lifecycle end-to-end.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code IN (
    'payroll.settings.manage', 'payroll.components.manage', 'payroll.structures.manage',
    'payroll.assign', 'payroll.process', 'payroll.approve',
    'payroll.overtime.apply', 'payroll.overtime.approve', 'payroll.view.all'
)
  AND r.code IN ('hr', 'super_admin')
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO
