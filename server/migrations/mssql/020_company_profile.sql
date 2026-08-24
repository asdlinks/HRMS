-- ============================================================
-- Mywe HR — Phase 7, part 1: Company Management.
--
-- Extends `tenants` into a real company profile (name/logo/address/contact/
-- currency/date format/financial year/branding) so a System Administrator
-- can configure it instead of it being hardcoded in the UI. Backfills
-- currency/financial_year_start_month FROM the existing per-tenant
-- `payroll_settings` JSON key so no tenant's values silently change —
-- payroll_settings itself is left in place untouched as a one-release
-- rollback safety net (same pattern as users.role in 004_rbac.sql).
-- ============================================================

IF COL_LENGTH('tenants', 'logo_url') IS NULL
    ALTER TABLE tenants ADD logo_url NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('tenants', 'address_line1') IS NULL
    ALTER TABLE tenants ADD address_line1 NVARCHAR(255) NULL;
GO
IF COL_LENGTH('tenants', 'address_line2') IS NULL
    ALTER TABLE tenants ADD address_line2 NVARCHAR(255) NULL;
GO
IF COL_LENGTH('tenants', 'city') IS NULL
    ALTER TABLE tenants ADD city NVARCHAR(100) NULL;
GO
IF COL_LENGTH('tenants', 'state') IS NULL
    ALTER TABLE tenants ADD state NVARCHAR(100) NULL;
GO
IF COL_LENGTH('tenants', 'country') IS NULL
    ALTER TABLE tenants ADD country NVARCHAR(100) NULL;
GO
IF COL_LENGTH('tenants', 'postal_code') IS NULL
    ALTER TABLE tenants ADD postal_code NVARCHAR(20) NULL;
GO
IF COL_LENGTH('tenants', 'phone') IS NULL
    ALTER TABLE tenants ADD phone NVARCHAR(30) NULL;
GO
IF COL_LENGTH('tenants', 'contact_email') IS NULL
    ALTER TABLE tenants ADD contact_email NVARCHAR(255) NULL;
GO
IF COL_LENGTH('tenants', 'website') IS NULL
    ALTER TABLE tenants ADD website NVARCHAR(255) NULL;
GO
IF COL_LENGTH('tenants', 'currency') IS NULL
    ALTER TABLE tenants ADD currency NVARCHAR(10) NOT NULL CONSTRAINT DF_tenants_currency DEFAULT ('INR');
GO
IF COL_LENGTH('tenants', 'date_format') IS NULL
    ALTER TABLE tenants ADD date_format NVARCHAR(20) NOT NULL CONSTRAINT DF_tenants_date_format DEFAULT ('DD/MM/YYYY');
GO
IF COL_LENGTH('tenants', 'financial_year_start_month') IS NULL
    ALTER TABLE tenants ADD financial_year_start_month INT NOT NULL CONSTRAINT DF_tenants_fy_start_month DEFAULT (4);
GO
IF COL_LENGTH('tenants', 'theme_primary_color') IS NULL
    ALTER TABLE tenants ADD theme_primary_color NVARCHAR(9) NULL;
GO
IF COL_LENGTH('tenants', 'theme_secondary_color') IS NULL
    ALTER TABLE tenants ADD theme_secondary_color NVARCHAR(9) NULL;
GO

-- Backfill currency / financial_year_start_month from the existing
-- payroll_settings JSON blob (013_payroll_menu_and_settings.sql) so upgrading
-- tenants keep the values they already configured, instead of resetting to
-- the column defaults above. Safe to run unconditionally: this file only
-- ever executes once per environment (tracked by __migrations).
UPDATE t
SET t.currency = COALESCE(JSON_VALUE(s.value, '$.currency'), t.currency),
    t.financial_year_start_month = COALESCE(TRY_CAST(JSON_VALUE(s.value, '$.financial_year_start_month') AS INT), t.financial_year_start_month)
FROM tenants t
LEFT JOIN settings s ON s.tenant_id = t.id AND s.[key] = 'payroll_settings';
GO

IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'company.manage')
INSERT INTO permissions (code, module, description) VALUES
    ('company.manage', 'company', 'Edit company profile, branding, locale and financial year settings');
GO

-- Grant to whichever roles already hold settings.manage, so existing admins
-- aren't locked out of the new Company Profile tab after upgrade.
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
FROM role_permissions rp
JOIN permissions sp ON sp.id = rp.permission_id AND sp.code = 'settings.manage'
JOIN permissions p ON p.code = 'company.manage'
WHERE NOT EXISTS (
    SELECT 1 FROM role_permissions rp2 WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p.id
);
GO
