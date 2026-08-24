-- ============================================================
-- Mywe HR — Phase 9: Platform Administration & Tenant Provisioning.
--
-- Activates the `platform_admins` table that has sat unused since
-- 002_multitenancy.sql (vendor-side staff, deliberately outside the tenant
-- model) with the lockout columns every other principal type already has,
-- plus its own refresh-token store (mirrors `refresh_tokens` but FK'd to
-- platform_admins, no tenant_id — a platform admin isn't tenant-scoped).
--
-- `provisioning_logs` records every create-company attempt (success or
-- failure) so Platform Admin's "View Provisioning History" has something to
-- show, and so a rolled-back (failed) provisioning attempt still leaves an
-- audit trail even though the data it describes was undone.
--
-- `tenants.primary_admin_user_id` is set once at provisioning time to the
-- first HR Administrator created for that tenant, giving "Reset Company
-- Admin Password" a deterministic target without a user-picker UI.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('platform_admins') AND name = 'is_active')
ALTER TABLE platform_admins ADD is_active BIT NOT NULL CONSTRAINT DF_platform_admins_is_active DEFAULT (1);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('platform_admins') AND name = 'failed_login_attempts')
ALTER TABLE platform_admins ADD failed_login_attempts INT NOT NULL CONSTRAINT DF_platform_admins_failed_login_attempts DEFAULT (0);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('platform_admins') AND name = 'locked_until')
ALTER TABLE platform_admins ADD locked_until DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('platform_admins') AND name = 'updated_at')
ALTER TABLE platform_admins ADD updated_at DATETIME2 NOT NULL CONSTRAINT DF_platform_admins_updated_at DEFAULT (SYSUTCDATETIME());
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'platform_admin_refresh_tokens')
CREATE TABLE platform_admin_refresh_tokens (
    id                 INT IDENTITY(1,1) NOT NULL,
    platform_admin_id  INT NOT NULL,
    token_hash         NVARCHAR(255) NOT NULL,
    expires_at         DATETIME2 NOT NULL,
    revoked_at         DATETIME2 NULL,
    replaced_by        INT NULL,
    created_at         DATETIME2 NOT NULL CONSTRAINT DF_platform_admin_refresh_tokens_created_at DEFAULT (SYSUTCDATETIME()),
    created_by_ip      NVARCHAR(64) NULL,
    user_agent         NVARCHAR(255) NULL,
    CONSTRAINT PK_platform_admin_refresh_tokens PRIMARY KEY (id),
    CONSTRAINT FK_platform_admin_refresh_tokens_admin FOREIGN KEY (platform_admin_id) REFERENCES platform_admins(id) ON DELETE CASCADE,
    CONSTRAINT FK_platform_admin_refresh_tokens_replaced_by FOREIGN KEY (replaced_by) REFERENCES platform_admin_refresh_tokens(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_platform_admin_refresh_tokens_admin_id' AND object_id = OBJECT_ID('platform_admin_refresh_tokens'))
CREATE INDEX IX_platform_admin_refresh_tokens_admin_id ON platform_admin_refresh_tokens(platform_admin_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_platform_admin_refresh_tokens_token_hash' AND object_id = OBJECT_ID('platform_admin_refresh_tokens'))
CREATE INDEX IX_platform_admin_refresh_tokens_token_hash ON platform_admin_refresh_tokens(token_hash);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'provisioning_logs')
CREATE TABLE provisioning_logs (
    id                       INT IDENTITY(1,1) NOT NULL,
    tenant_id                INT NULL, -- NULL if provisioning failed before the tenant row itself was created
    requested_company_name   NVARCHAR(255) NOT NULL,
    requested_slug           NVARCHAR(100) NOT NULL,
    platform_admin_id        INT NOT NULL,
    status                   NVARCHAR(20) NOT NULL,
    steps                    NVARCHAR(MAX) NOT NULL, -- JSON array of {step, status, detail?}; never contains a plaintext password
    error_message            NVARCHAR(MAX) NULL,
    started_at               DATETIME2 NOT NULL,
    finished_at              DATETIME2 NOT NULL,
    created_at               DATETIME2 NOT NULL CONSTRAINT DF_provisioning_logs_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_provisioning_logs PRIMARY KEY (id),
    CONSTRAINT FK_provisioning_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT FK_provisioning_logs_admin FOREIGN KEY (platform_admin_id) REFERENCES platform_admins(id),
    CONSTRAINT CK_provisioning_logs_status CHECK (status IN ('success', 'failed'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_provisioning_logs_tenant_id' AND object_id = OBJECT_ID('provisioning_logs'))
CREATE INDEX IX_provisioning_logs_tenant_id ON provisioning_logs(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_provisioning_logs_platform_admin_id' AND object_id = OBJECT_ID('provisioning_logs'))
CREATE INDEX IX_provisioning_logs_platform_admin_id ON provisioning_logs(platform_admin_id);
GO

IF COL_LENGTH('tenants', 'primary_admin_user_id') IS NULL
BEGIN
    ALTER TABLE tenants ADD primary_admin_user_id INT NULL;
    ALTER TABLE tenants ADD CONSTRAINT FK_tenants_primary_admin_user FOREIGN KEY (primary_admin_user_id) REFERENCES users(id);
END
GO
