-- ============================================================
-- Mywe HR — Multi-tenancy (Phase 1b)
-- Converts the single-org schema from 001_initial_schema.sql into a
-- shared-schema, shared-database multi-tenant model: one `tenants` row
-- per customer organization, a `tenant_id` column (and FK) on every
-- tenant-owned table, and per-tenant uniqueness instead of global.
--
-- Written as ALTER statements (not DROP/CREATE) because that's the
-- pattern real migrations need once tables hold data — even though today
-- these tables are still empty, so every ADD ... NOT NULL below is safe
-- without a backfill step.
-- ============================================================

-- ---------------- tenants ----------------
-- One row per customer organization. `slug` is the subdomain / tenant
-- key used to resolve which tenant a request belongs to before any
-- other query runs (e.g. acme.mywehr.app -> slug = 'acme').
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tenants')
CREATE TABLE tenants (
    id               INT IDENTITY(1,1) NOT NULL,
    name             NVARCHAR(255) NOT NULL,
    slug             NVARCHAR(100) NOT NULL,
    status           NVARCHAR(20) NOT NULL CONSTRAINT DF_tenants_status DEFAULT ('trial'),
    [plan]           NVARCHAR(50) NOT NULL CONSTRAINT DF_tenants_plan DEFAULT ('trial'),
    seat_limit       INT NULL,
    billing_email    NVARCHAR(255) NULL,
    timezone         NVARCHAR(50) NOT NULL CONSTRAINT DF_tenants_timezone DEFAULT ('UTC'),
    trial_ends_at    DATETIME2 NULL,
    created_at       DATETIME2 NOT NULL CONSTRAINT DF_tenants_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at       DATETIME2 NOT NULL CONSTRAINT DF_tenants_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_tenants PRIMARY KEY (id),
    CONSTRAINT UQ_tenants_slug UNIQUE (slug),
    CONSTRAINT CK_tenants_status CHECK (status IN ('trial', 'active', 'suspended', 'cancelled'))
);
GO

-- ---------------- platform_admins ----------------
-- Vendor-side staff (Mywe's own team) who manage tenants, plans and
-- billing. Deliberately outside the tenant model — not scoped by
-- tenant_id, not visible to any tenant's own users.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'platform_admins')
CREATE TABLE platform_admins (
    id            INT IDENTITY(1,1) NOT NULL,
    name          NVARCHAR(255) NOT NULL,
    email         NVARCHAR(255) NOT NULL,
    password      NVARCHAR(255) NOT NULL,
    created_at    DATETIME2 NOT NULL CONSTRAINT DF_platform_admins_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_platform_admins PRIMARY KEY (id),
    CONSTRAINT UQ_platform_admins_email UNIQUE (email)
);
GO

-- ---------------- departments ----------------
IF COL_LENGTH('departments', 'tenant_id') IS NULL
BEGIN
    ALTER TABLE departments ADD tenant_id INT NOT NULL CONSTRAINT FK_departments_tenant REFERENCES tenants(id);
    ALTER TABLE departments DROP CONSTRAINT UQ_departments_name;
    ALTER TABLE departments ADD CONSTRAINT UQ_departments_tenant_name UNIQUE (tenant_id, name);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_departments_tenant_id' AND object_id = OBJECT_ID('departments'))
CREATE INDEX IX_departments_tenant_id ON departments(tenant_id);
GO

-- ---------------- locations ----------------
IF COL_LENGTH('locations', 'tenant_id') IS NULL
BEGIN
    ALTER TABLE locations ADD tenant_id INT NOT NULL CONSTRAINT FK_locations_tenant REFERENCES tenants(id);
    ALTER TABLE locations DROP CONSTRAINT UQ_locations_name;
    ALTER TABLE locations ADD CONSTRAINT UQ_locations_tenant_name UNIQUE (tenant_id, name);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_locations_tenant_id' AND object_id = OBJECT_ID('locations'))
CREATE INDEX IX_locations_tenant_id ON locations(tenant_id);
GO

-- ---------------- users ----------------
-- Email uniqueness moves from global to per-tenant: two different
-- customer organizations can each have their own user on the same
-- email address, since login always happens inside a resolved tenant.
IF COL_LENGTH('users', 'tenant_id') IS NULL
BEGIN
    ALTER TABLE users ADD tenant_id INT NOT NULL CONSTRAINT FK_users_tenant REFERENCES tenants(id);
    ALTER TABLE users DROP CONSTRAINT UQ_users_email;
    ALTER TABLE users ADD CONSTRAINT UQ_users_tenant_email UNIQUE (tenant_id, email);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_users_tenant_id' AND object_id = OBJECT_ID('users'))
CREATE INDEX IX_users_tenant_id ON users(tenant_id);
GO

-- employee_id uniqueness also moves per-tenant (still nullable, still a
-- filtered index for the same reason as 001: SQL Server UNIQUE
-- constraints only tolerate a single NULL).
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_users_employee_id' AND object_id = OBJECT_ID('users'))
DROP INDEX UX_users_employee_id ON users;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_users_tenant_employee_id' AND object_id = OBJECT_ID('users'))
CREATE UNIQUE INDEX UX_users_tenant_employee_id ON users(tenant_id, employee_id) WHERE employee_id IS NOT NULL;
GO

-- ---------------- leaves ----------------
IF COL_LENGTH('leaves', 'tenant_id') IS NULL
BEGIN
    ALTER TABLE leaves ADD tenant_id INT NOT NULL CONSTRAINT FK_leaves_tenant REFERENCES tenants(id);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leaves_tenant_id' AND object_id = OBJECT_ID('leaves'))
CREATE INDEX IX_leaves_tenant_id ON leaves(tenant_id);
GO

-- ---------------- settings ----------------
-- Every tenant gets its own key/value settings row, so the primary key
-- becomes composite instead of `key` alone.
IF COL_LENGTH('settings', 'tenant_id') IS NULL
BEGIN
    ALTER TABLE settings DROP CONSTRAINT PK_settings;
    ALTER TABLE settings ADD tenant_id INT NOT NULL CONSTRAINT FK_settings_tenant REFERENCES tenants(id);
    ALTER TABLE settings ADD CONSTRAINT PK_settings PRIMARY KEY (tenant_id, [key]);
END
GO

-- ---------------- holidays ----------------
IF COL_LENGTH('holidays', 'tenant_id') IS NULL
BEGIN
    ALTER TABLE holidays ADD tenant_id INT NOT NULL CONSTRAINT FK_holidays_tenant REFERENCES tenants(id);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_holidays_tenant_id' AND object_id = OBJECT_ID('holidays'))
CREATE INDEX IX_holidays_tenant_id ON holidays(tenant_id);
GO

-- ---------------- flexi_holidays ----------------
IF COL_LENGTH('flexi_holidays', 'tenant_id') IS NULL
BEGIN
    ALTER TABLE flexi_holidays ADD tenant_id INT NOT NULL CONSTRAINT FK_flexi_holidays_tenant REFERENCES tenants(id);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_flexi_holidays_tenant_id' AND object_id = OBJECT_ID('flexi_holidays'))
CREATE INDEX IX_flexi_holidays_tenant_id ON flexi_holidays(tenant_id);
GO

-- ---------------- notifications ----------------
IF COL_LENGTH('notifications', 'tenant_id') IS NULL
BEGIN
    ALTER TABLE notifications ADD tenant_id INT NOT NULL CONSTRAINT FK_notifications_tenant REFERENCES tenants(id);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_notifications_tenant_id' AND object_id = OBJECT_ID('notifications'))
CREATE INDEX IX_notifications_tenant_id ON notifications(tenant_id);
GO

-- ---------------- attendance ----------------
IF COL_LENGTH('attendance', 'tenant_id') IS NULL
BEGIN
    ALTER TABLE attendance ADD tenant_id INT NOT NULL CONSTRAINT FK_attendance_tenant REFERENCES tenants(id);
    ALTER TABLE attendance DROP CONSTRAINT UQ_attendance_user_date;
    ALTER TABLE attendance ADD CONSTRAINT UQ_attendance_tenant_user_date UNIQUE (tenant_id, user_id, date);
END
GO
