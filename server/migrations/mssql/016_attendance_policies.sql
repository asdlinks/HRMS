-- ============================================================
-- Mywe HR — Face Recognition Attendance (Phase 6), part 3: attendance policies.
--
-- Configurable per-employee attendance policy: which capture methods an
-- employee is allowed to use (Office Only -> Face only; Hybrid -> Face or
-- WFH/ClientVisit/FieldWork; Remote -> WFH only; Field Staff -> GPS-based
-- methods only). Nothing about method eligibility is hardcoded in route
-- code — attendanceEngine.service.js reads `allowed_methods` off whichever
-- policy a user is assigned.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'attendance_policies')
CREATE TABLE attendance_policies (
    id               INT IDENTITY(1,1) NOT NULL,
    tenant_id        INT NOT NULL,
    name             NVARCHAR(150) NOT NULL,
    policy_type      NVARCHAR(20) NOT NULL,
    allowed_methods  NVARCHAR(MAX) NOT NULL, -- JSON array, e.g. ["Face"], ["Face","WFH","ClientVisit","FieldWork"]
    config           NVARCHAR(MAX) NULL,     -- JSON, e.g. {"geofence_radius_meters":200}
    is_active        BIT NOT NULL CONSTRAINT DF_attendance_policies_is_active DEFAULT (1),
    created_at       DATETIME2 NOT NULL CONSTRAINT DF_attendance_policies_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_attendance_policies PRIMARY KEY (id),
    CONSTRAINT UQ_attendance_policies_tenant_name UNIQUE (tenant_id, name),
    CONSTRAINT CK_attendance_policies_type CHECK (policy_type IN ('OfficeOnly', 'Hybrid', 'Remote', 'FieldStaff')),
    CONSTRAINT FK_attendance_policies_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_attendance_policies_tenant_id' AND object_id = OBJECT_ID('attendance_policies'))
CREATE INDEX IX_attendance_policies_tenant_id ON attendance_policies(tenant_id);
GO

IF COL_LENGTH('users', 'attendance_policy_id') IS NULL
BEGIN
    ALTER TABLE users ADD attendance_policy_id INT NULL;
    ALTER TABLE users ADD CONSTRAINT FK_users_attendance_policy FOREIGN KEY (attendance_policy_id) REFERENCES attendance_policies(id);
END
GO

-- Seed the four policy examples from the spec for every existing tenant.
-- Idempotent per-tenant: only inserted if that tenant has no policy of that name yet.
INSERT INTO attendance_policies (tenant_id, name, policy_type, allowed_methods, config)
SELECT t.id, x.name, x.policy_type, x.allowed_methods, x.config
FROM tenants t
CROSS APPLY (VALUES
    ('Office Only', 'OfficeOnly', '["Face"]', NULL),
    ('Hybrid',       'Hybrid',     '["Face","WFH","ClientVisit","FieldWork"]', NULL),
    ('Remote',       'Remote',     '["WFH"]', NULL),
    ('Field Staff',  'FieldStaff', '["FieldWork","ClientVisit"]', '{"geofence_radius_meters":200}')
) AS x(name, policy_type, allowed_methods, config)
WHERE NOT EXISTS (
    SELECT 1 FROM attendance_policies p WHERE p.tenant_id = t.id AND p.name = x.name
);
GO
