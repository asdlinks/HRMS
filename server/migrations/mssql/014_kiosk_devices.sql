-- ============================================================
-- Mywe HR — Face Recognition Attendance (Phase 6), part 1: kiosk devices.
--
-- A kiosk is a physical device (tablet/PC) running the separate
-- face-attendance PWA. It authenticates as its own principal — not as an
-- employee — via POST /api/auth/kiosk-login, so it needs its own identity
-- (kiosk_devices) and its own refresh-session store (device_sessions).
-- Kept deliberately separate from `refresh_tokens`/`users` rather than
-- reusing them: that table's rotation/theft-detection logic is
-- security-critical and assumes a real user_id throughout, and overloading
-- it with a nullable device_id would fork every line of that logic.
-- Device access tokens are short-lived (5 minutes) so a revoked device
-- (status set to 'Revoked') is locked out quickly without needing to
-- blocklist already-issued stateless JWTs.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'kiosk_devices')
CREATE TABLE kiosk_devices (
    id                INT IDENTITY(1,1) NOT NULL,
    tenant_id         INT NOT NULL,
    device_name       NVARCHAR(150) NOT NULL,
    location_id       INT NULL,
    device_key_hash   NVARCHAR(255) NOT NULL,
    status            NVARCHAR(20) NOT NULL CONSTRAINT DF_kiosk_devices_status DEFAULT ('Active'),
    last_sync_at      DATETIME2 NULL,
    created_at        DATETIME2 NOT NULL CONSTRAINT DF_kiosk_devices_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_kiosk_devices PRIMARY KEY (id),
    CONSTRAINT UQ_kiosk_devices_tenant_name UNIQUE (tenant_id, device_name),
    CONSTRAINT CK_kiosk_devices_status CHECK (status IN ('Active', 'Revoked')),
    CONSTRAINT FK_kiosk_devices_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT FK_kiosk_devices_location FOREIGN KEY (location_id) REFERENCES locations(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_kiosk_devices_tenant_id' AND object_id = OBJECT_ID('kiosk_devices'))
CREATE INDEX IX_kiosk_devices_tenant_id ON kiosk_devices(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'device_sessions')
CREATE TABLE device_sessions (
    id             INT IDENTITY(1,1) NOT NULL,
    device_id      INT NOT NULL,
    token_hash     NVARCHAR(255) NOT NULL,
    expires_at     DATETIME2 NOT NULL,
    revoked_at     DATETIME2 NULL,
    replaced_by    INT NULL,
    created_at     DATETIME2 NOT NULL CONSTRAINT DF_device_sessions_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_device_sessions PRIMARY KEY (id),
    CONSTRAINT FK_device_sessions_device FOREIGN KEY (device_id) REFERENCES kiosk_devices(id) ON DELETE CASCADE,
    CONSTRAINT FK_device_sessions_replaced_by FOREIGN KEY (replaced_by) REFERENCES device_sessions(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_device_sessions_device_id' AND object_id = OBJECT_ID('device_sessions'))
CREATE INDEX IX_device_sessions_device_id ON device_sessions(device_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_device_sessions_token_hash' AND object_id = OBJECT_ID('device_sessions'))
CREATE INDEX IX_device_sessions_token_hash ON device_sessions(token_hash);
GO
