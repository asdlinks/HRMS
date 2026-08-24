-- ============================================================
-- Mywe HR — Configurable RBAC (Milestone 1)
--
-- Replaces the hardcoded 4-role string model (users.role) with a real,
-- database-driven RBAC system a System Administrator can reconfigure
-- without a code deploy:
--   permissions       -- fixed code-level vocabulary (what a route can check)
--   roles             -- tenant-scoped, editable, named bundles
--   role_permissions  -- the actual configurable lever: which permissions a role grants
--   user_roles        -- many-to-many, so a user can hold more than one role
--
-- users.role is left in place untouched as a one-milestone rollback safety
-- net; nothing in the new code reads it.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'permissions')
CREATE TABLE permissions (
    id            INT IDENTITY(1,1) NOT NULL,
    code          NVARCHAR(100) NOT NULL,
    module        NVARCHAR(50) NOT NULL,
    description   NVARCHAR(255) NULL,
    CONSTRAINT PK_permissions PRIMARY KEY (id),
    CONSTRAINT UQ_permissions_code UNIQUE (code)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'roles')
CREATE TABLE roles (
    id           INT IDENTITY(1,1) NOT NULL,
    tenant_id    INT NOT NULL,
    code         NVARCHAR(50) NOT NULL,
    name         NVARCHAR(100) NOT NULL,
    is_system    BIT NOT NULL CONSTRAINT DF_roles_is_system DEFAULT (0),
    created_at   DATETIME2 NOT NULL CONSTRAINT DF_roles_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_roles PRIMARY KEY (id),
    CONSTRAINT UQ_roles_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT FK_roles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_roles_tenant_id' AND object_id = OBJECT_ID('roles'))
CREATE INDEX IX_roles_tenant_id ON roles(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'role_permissions')
CREATE TABLE role_permissions (
    role_id        INT NOT NULL,
    permission_id  INT NOT NULL,
    CONSTRAINT PK_role_permissions PRIMARY KEY (role_id, permission_id),
    CONSTRAINT FK_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT FK_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'user_roles')
CREATE TABLE user_roles (
    user_id   INT NOT NULL,
    role_id   INT NOT NULL,
    CONSTRAINT PK_user_roles PRIMARY KEY (user_id, role_id),
    CONSTRAINT FK_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT FK_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);
GO

-- ---------------- permission catalogue seed ----------------
-- Derived from every role-string check found in the pre-Milestone-1 app.
-- This is the permanent vocabulary routes check against; which roles grant
-- which of these is configured entirely through role_permissions below/later.
IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'leaves.view.own')
INSERT INTO permissions (code, module, description) VALUES
    ('leaves.view.own',      'leaves',        'View your own leave requests'),
    ('leaves.view.team',     'leaves',        'View leave requests for your direct/indirect reports'),
    ('leaves.view.all',      'leaves',        'View leave requests for everyone in the organization'),
    ('leaves.apply.own',     'leaves',        'Apply for your own leave'),
    ('leaves.apply.any',     'leaves',        'Apply for leave on behalf of another employee'),
    ('leaves.approve',       'leaves',        'Approve or reject leave requests'),
    ('leaves.cancel.any',    'leaves',        'Cancel any employee''s leave request'),
    ('attendance.checkin',   'attendance',    'Check in for daily attendance'),
    ('attendance.view.team', 'attendance',    'View attendance for your team'),
    ('users.view.directory', 'users',         'View the basic company directory (name, department) — no management actions'),
    ('users.view.team',      'users',         'View your direct/indirect reports in the employee directory'),
    ('users.view.all',       'users',         'View everyone in the employee directory'),
    ('users.manage',         'users',         'Create, edit and deactivate employees'),
    ('users.password.reset', 'users',         'Reset another user''s password (does not grant users.view)'),
    ('departments.manage',   'departments',   'Create and delete departments'),
    ('locations.manage',     'locations',     'Create and delete locations'),
    ('holidays.manage',      'holidays',      'Create and delete holidays and flexi-holidays'),
    ('settings.manage',      'settings',      'Edit organization settings (leave allocations, etc.)'),
    ('reports.view',         'reports',       'View monthly attendance/leave reports'),
    ('notifications.manage', 'notifications', 'Read and clear notifications'),
    ('voice.use',            'voice',         'Use the AI voice assistant');
GO
