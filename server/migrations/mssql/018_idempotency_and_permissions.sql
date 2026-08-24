-- ============================================================
-- Mywe HR — Face Recognition Attendance (Phase 6), part 5: idempotency + permissions.
--
-- idempotency_keys: protects every mutating kiosk/remote-workflow call from
-- double-submission — the unique-constraint-on-attendance catch alone only
-- guards against a second check-in on the same day, not an offline-queued
-- event replayed twice after reconnect (e.g. a flaky kiosk retry, or a
-- WFH check-out resubmitted by the browser).
--
-- New permission codes follow the pattern in 012_payroll_permissions.sql.
-- attendance.checkin.kiosk / attendance.face.sync are NOT granted here —
-- they're issued directly inside a device JWT at kiosk-login time (a kiosk
-- has no user row to hold a role_permissions grant).
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'idempotency_keys')
CREATE TABLE idempotency_keys (
    id                 INT IDENTITY(1,1) NOT NULL,
    tenant_id          INT NOT NULL,
    idempotency_key    NVARCHAR(200) NOT NULL,
    response_json      NVARCHAR(MAX) NULL,
    created_at         DATETIME2 NOT NULL CONSTRAINT DF_idempotency_keys_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_idempotency_keys PRIMARY KEY (id),
    CONSTRAINT UQ_idempotency_keys_tenant_key UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT FK_idempotency_keys_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'attendance.policy.manage')
INSERT INTO permissions (code, module, description) VALUES
    ('attendance.policy.manage', 'attendance', 'Create and edit attendance policies and their allowed methods'),
    ('attendance.device.manage', 'attendance', 'Register, rotate keys for, and revoke kiosk devices'),
    ('attendance.face.enroll',   'attendance', 'Enroll or update an employee''s face recognition data');
GO

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code IN ('attendance.policy.manage', 'attendance.device.manage', 'attendance.face.enroll')
  AND r.code IN ('hr', 'super_admin')
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO
