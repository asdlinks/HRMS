-- ============================================================
-- Mywe HR — Phase 12A: Platform Admin SaaS Management Console.
--
-- Adds subscription placeholder columns to `tenants` (Part 7 of the spec —
-- Plan/License Type/Renewal/Expiry/Payment Status/Feature Package). These
-- are display/edit-only fields with no billing/payment-gateway logic behind
-- them yet; `plan` already existed (002_multitenancy.sql) and is reused as
-- "Subscription Plan" rather than duplicated.
--
-- Everything else the new Platform Admin dashboard/tenant-health/usage/
-- system-health surfaces need (employee counts, last login, storage used,
-- payroll/attendance/document configuration state) is derived from existing
-- tables at query time — no new tables required for this migration.
-- ============================================================

IF COL_LENGTH('tenants', 'license_type') IS NULL
ALTER TABLE tenants ADD license_type NVARCHAR(50) NULL;
GO

IF COL_LENGTH('tenants', 'renewal_date') IS NULL
ALTER TABLE tenants ADD renewal_date DATE NULL;
GO

IF COL_LENGTH('tenants', 'expiry_date') IS NULL
ALTER TABLE tenants ADD expiry_date DATE NULL;
GO

IF COL_LENGTH('tenants', 'payment_status') IS NULL
ALTER TABLE tenants ADD payment_status NVARCHAR(20) NOT NULL CONSTRAINT DF_tenants_payment_status DEFAULT ('not_configured');
GO

IF COL_LENGTH('tenants', 'feature_package') IS NULL
ALTER TABLE tenants ADD feature_package NVARCHAR(50) NULL;
GO
