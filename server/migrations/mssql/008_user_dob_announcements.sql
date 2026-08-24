-- ============================================================
-- Mywe HR — Dashboard foundation: birthdays + company announcements
--
-- Two small additive changes for the redesigned dashboard (Phase 2):
--   1. A nullable date_of_birth on users, so "Birthdays" can be a real
--      widget instead of a placeholder. Nullable/optional — existing rows
--      and the create/edit user forms are unaffected until someone fills
--      it in.
--   2. A new `announcements` table + `announcements.manage` permission
--      (HR/Admin authors, everyone reads) for the "Company Announcements"
--      dashboard widget.
-- Work Anniversaries need no schema change — users.joining_date already
-- exists.
-- ============================================================

IF COL_LENGTH('users', 'date_of_birth') IS NULL
ALTER TABLE users ADD date_of_birth DATE NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'announcements')
CREATE TABLE announcements (
    id           INT IDENTITY(1,1) NOT NULL,
    tenant_id    INT NOT NULL,
    title        NVARCHAR(200) NOT NULL,
    body         NVARCHAR(MAX) NOT NULL,
    created_by   INT NOT NULL,
    created_at   DATETIME2 NOT NULL CONSTRAINT DF_announcements_created_at DEFAULT (SYSUTCDATETIME()),
    is_active    BIT NOT NULL CONSTRAINT DF_announcements_is_active DEFAULT (1),
    CONSTRAINT PK_announcements PRIMARY KEY (id),
    CONSTRAINT FK_announcements_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT FK_announcements_created_by FOREIGN KEY (created_by) REFERENCES users(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_announcements_tenant_id' AND object_id = OBJECT_ID('announcements'))
CREATE INDEX IX_announcements_tenant_id ON announcements(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'announcements.manage')
INSERT INTO permissions (code, module, description) VALUES
    ('announcements.manage', 'announcements', 'Create and retire company announcements shown on every dashboard');
GO

-- Everyone can read announcements (no permission gate on GET); only HR and
-- super_admin can author/retire them.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'announcements.manage'
  AND r.code IN ('hr', 'super_admin')
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO
