-- ============================================================
-- Mywe HR — Phase 8 Security & Business Rule Hardening.
--
-- Adds: account-lockout tracking (users, kiosk_devices), a persisted
-- face-match confidence on attendance, payroll run actor tracking for
-- future audit-log work (processed_by/paid_by), and fixes the payroll
-- run period unique constraint so a Cancelled run no longer permanently
-- occupies its pay period.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'failed_login_attempts')
ALTER TABLE users ADD failed_login_attempts INT NOT NULL CONSTRAINT DF_users_failed_login_attempts DEFAULT (0);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'locked_until')
ALTER TABLE users ADD locked_until DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('kiosk_devices') AND name = 'failed_login_attempts')
ALTER TABLE kiosk_devices ADD failed_login_attempts INT NOT NULL CONSTRAINT DF_kiosk_devices_failed_login_attempts DEFAULT (0);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('kiosk_devices') AND name = 'locked_until')
ALTER TABLE kiosk_devices ADD locked_until DATETIME2 NULL;
GO

-- Server-side-validated face match confidence (0..1), persisted at
-- check-in time so match quality is visible even before a full audit log
-- exists. Nullable since only Face-method check-ins populate it.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance') AND name = 'confidence')
ALTER TABLE attendance ADD confidence DECIMAL(4,3) NULL;
GO

-- Payroll run actor tracking (log-only maker-checker per Phase 8 decision —
-- no enforcement yet, just enough columns for the future Audit Log phase to
-- answer "who processed vs. approved vs. paid this run").
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payroll_runs') AND name = 'processed_by')
ALTER TABLE payroll_runs ADD processed_by INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_payroll_runs_processed_by')
ALTER TABLE payroll_runs ADD CONSTRAINT FK_payroll_runs_processed_by FOREIGN KEY (processed_by) REFERENCES users(id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payroll_runs') AND name = 'paid_by')
ALTER TABLE payroll_runs ADD paid_by INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_payroll_runs_paid_by')
ALTER TABLE payroll_runs ADD CONSTRAINT FK_payroll_runs_paid_by FOREIGN KEY (paid_by) REFERENCES users(id);
GO

-- A Cancelled run previously occupied its (tenant, year, month) forever
-- because of a plain UNIQUE constraint. Replace it with a filtered unique
-- index that excludes Cancelled rows, so the period can be re-created.
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_payroll_runs_tenant_period')
ALTER TABLE payroll_runs DROP CONSTRAINT UQ_payroll_runs_tenant_period;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_payroll_runs_tenant_period_active' AND object_id = OBJECT_ID('payroll_runs'))
CREATE UNIQUE INDEX UQ_payroll_runs_tenant_period_active ON payroll_runs(tenant_id, period_year, period_month) WHERE status <> 'Cancelled';
GO
