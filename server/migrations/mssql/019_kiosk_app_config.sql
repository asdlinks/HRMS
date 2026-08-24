-- ============================================================
-- Mywe HR — Face Recognition Attendance (Phase 6), part 5: kiosk app config.
--
-- Deliberately its own table, NOT a row in the shared `settings` table —
-- GET /api/settings is readable by every authenticated user (employees rely
-- on it for things like leave_allocations), so storing an admin-only value
-- there would leak it to everyone. This table is only ever read/written
-- through /api/kiosk-devices/config, gated by attendance.device.manage —
-- the same permission that already guards kiosk device management.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'kiosk_app_config')
CREATE TABLE kiosk_app_config (
    tenant_id      INT NOT NULL,
    kiosk_app_url  NVARCHAR(500) NULL,
    updated_at     DATETIME2 NOT NULL CONSTRAINT DF_kiosk_app_config_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_kiosk_app_config PRIMARY KEY (tenant_id),
    CONSTRAINT FK_kiosk_app_config_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
GO
