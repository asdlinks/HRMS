-- ============================================================
-- Phase 13E — Subscription Unification.
--
-- Replaces four unreconciled, unenforced tenants columns (plan, seat_limit,
-- license_type, feature_package — migrations 002/039) with one real,
-- enforced concept: a subscription_plans catalog assigned per tenant that
-- actually drives employee limit, enabled modules and storage allocation
-- (Part 8), rather than three free-text fields with nothing behind them.
--
-- enabled_modules is a JSON array of module codes (e.g. '["payroll",
-- "reports"]') — same precedent as attendance_policies.config/settings.value
-- elsewhere in this schema. Only 5 modules are ever plan-gated (payroll,
-- reports, recruitment, performance, assets) — Dashboard/Time & Leave/
-- Employees/Settings/Company Documents stay always-on for every tenant
-- regardless of plan (core product, not an add-on).
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'subscription_plans')
CREATE TABLE subscription_plans (
    id                INT IDENTITY(1,1) NOT NULL,
    name              NVARCHAR(100) NOT NULL,
    max_employees     INT NULL,
    storage_limit_mb  INT NULL,
    support_level     NVARCHAR(50) NULL,
    trial_days        INT NULL,
    enabled_modules   NVARCHAR(MAX) NOT NULL CONSTRAINT DF_subscription_plans_enabled_modules DEFAULT ('[]'),
    monthly_price     DECIMAL(10,2) NULL,
    annual_price      DECIMAL(10,2) NULL,
    is_active         BIT NOT NULL CONSTRAINT DF_subscription_plans_is_active DEFAULT (1),
    created_at        DATETIME2 NOT NULL CONSTRAINT DF_subscription_plans_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at        DATETIME2 NOT NULL CONSTRAINT DF_subscription_plans_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_subscription_plans PRIMARY KEY (id),
    CONSTRAINT UQ_subscription_plans_name UNIQUE (name)
);
GO

IF NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Starter')
INSERT INTO subscription_plans (name, max_employees, storage_limit_mb, support_level, trial_days, enabled_modules) VALUES
    ('Starter', 25, 1024, 'Basic', 14, '[]');
GO

IF NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Professional')
INSERT INTO subscription_plans (name, max_employees, storage_limit_mb, support_level, trial_days, enabled_modules) VALUES
    ('Professional', 100, 10240, 'Standard', 14, '["payroll","reports"]');
GO

IF NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Enterprise')
INSERT INTO subscription_plans (name, max_employees, storage_limit_mb, support_level, trial_days, enabled_modules) VALUES
    ('Enterprise', NULL, NULL, 'Priority', NULL, '["payroll","reports","recruitment","performance","assets"]');
GO

IF COL_LENGTH('tenants', 'subscription_plan_id') IS NULL
BEGIN
    ALTER TABLE tenants ADD subscription_plan_id INT NULL;
    ALTER TABLE tenants ADD CONSTRAINT FK_tenants_subscription_plan FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id);
END
GO

-- Backfill every existing tenant to Professional — a permissive middle
-- default so no existing tenant is accidentally locked below its current
-- usage; Platform Admin can reassign per-tenant afterward.
UPDATE tenants
SET subscription_plan_id = (SELECT id FROM subscription_plans WHERE name = 'Professional')
WHERE subscription_plan_id IS NULL;
GO

-- `plan` (and possibly the others) may carry a DEFAULT constraint whose
-- actual name doesn't match what its origin migration declared (this dev
-- database's `plan` default is named `tenants_plan_df`, not
-- 002_multitenancy.sql's stated `DF_tenants_plan`) — SQL Server won't drop a
-- column that still has one, so look the constraint up by column instead of
-- trusting a hardcoded name.
DECLARE @dropPlanDefault NVARCHAR(200);
SELECT @dropPlanDefault = dc.name
FROM sys.default_constraints dc JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('tenants') AND c.name = 'plan';
IF @dropPlanDefault IS NOT NULL EXEC('ALTER TABLE tenants DROP CONSTRAINT ' + @dropPlanDefault);
GO

IF COL_LENGTH('tenants', 'plan') IS NOT NULL
    ALTER TABLE tenants DROP COLUMN [plan];
GO

DECLARE @dropSeatLimitDefault NVARCHAR(200);
SELECT @dropSeatLimitDefault = dc.name
FROM sys.default_constraints dc JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('tenants') AND c.name = 'seat_limit';
IF @dropSeatLimitDefault IS NOT NULL EXEC('ALTER TABLE tenants DROP CONSTRAINT ' + @dropSeatLimitDefault);
GO

IF COL_LENGTH('tenants', 'seat_limit') IS NOT NULL
    ALTER TABLE tenants DROP COLUMN seat_limit;
GO

DECLARE @dropLicenseTypeDefault NVARCHAR(200);
SELECT @dropLicenseTypeDefault = dc.name
FROM sys.default_constraints dc JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('tenants') AND c.name = 'license_type';
IF @dropLicenseTypeDefault IS NOT NULL EXEC('ALTER TABLE tenants DROP CONSTRAINT ' + @dropLicenseTypeDefault);
GO

IF COL_LENGTH('tenants', 'license_type') IS NOT NULL
    ALTER TABLE tenants DROP COLUMN license_type;
GO

DECLARE @dropFeaturePackageDefault NVARCHAR(200);
SELECT @dropFeaturePackageDefault = dc.name
FROM sys.default_constraints dc JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('tenants') AND c.name = 'feature_package';
IF @dropFeaturePackageDefault IS NOT NULL EXEC('ALTER TABLE tenants DROP CONSTRAINT ' + @dropFeaturePackageDefault);
GO

IF COL_LENGTH('tenants', 'feature_package') IS NOT NULL
    ALTER TABLE tenants DROP COLUMN feature_package;
GO
