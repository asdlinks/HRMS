-- ============================================================
-- Phase 13A — Employee Master: Aadhaar/PAN (Identity Information) and
-- non-destructive removal of Employment Category.
--
-- Aadhaar/PAN: nullable columns (company policy may not require them) with
-- filtered unique indexes so multiple NULLs are allowed but any non-null
-- value must be unique across the tenant base — SQL Server 2016-compatible
-- (WHERE-filtered unique index, no newer syntax needed).
--
-- Employment Category removal follows the exact non-destructive precedent
-- of 041_remove_cost_centers_wiring.sql: the `employee_categories` table and
-- `users.employee_category_id` column/FK are left in place, unused. Only the
-- application-level wiring (permission, its grants, and its mention in the
-- Organization Structure menu item's any_permission list) is removed here;
-- app code (routes, repositories, client UI, reports) is updated alongside
-- this migration to stop referencing Employee Category.
-- ============================================================

IF COL_LENGTH('users', 'aadhaar_number') IS NULL
    ALTER TABLE users ADD aadhaar_number NVARCHAR(20) NULL;
GO

IF COL_LENGTH('users', 'pan_number') IS NULL
    ALTER TABLE users ADD pan_number NVARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_users_aadhaar_number')
    CREATE UNIQUE INDEX UQ_users_aadhaar_number ON users(aadhaar_number) WHERE aadhaar_number IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_users_pan_number')
    CREATE UNIQUE INDEX UQ_users_pan_number ON users(pan_number) WHERE pan_number IS NOT NULL;
GO

-- ---- Identity (PII) permission — Organization Administrator, HR
-- Administrator and Payroll Administrator only ----

IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'users.pii.manage')
INSERT INTO permissions (code, module, description) VALUES
    ('users.pii.manage', 'people', 'View and edit an employee''s Aadhaar and PAN numbers');
GO

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'users.pii.manage'
  AND r.code IN ('hr', 'payroll_admin', 'super_admin')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
GO

-- ---- Employment Category — non-destructive removal ----

DELETE FROM role_permissions
WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'employee-categories.manage');
GO

DELETE FROM permissions WHERE code = 'employee-categories.manage';
GO

UPDATE menu_items
SET any_permission = REPLACE(REPLACE(any_permission, 'employee-categories.manage,', ''), ',employee-categories.manage', '')
WHERE path = '/organization' AND any_permission LIKE '%employee-categories.manage%';
GO

UPDATE menu_items
SET any_permission = NULL
WHERE path = '/organization' AND any_permission = 'employee-categories.manage';
GO
