-- ============================================================
-- Mywe HR — Face Recognition Attendance (Phase 6), part 2: attendance methods.
--
-- Turns `attendance` into the unified write target for every capture
-- method (Face, WFH, ClientVisit, FieldWork, Manual, and future
-- Biometric/QRCode/API). All columns are additive/nullable — the existing
-- one-row-per-(tenant,user,date) invariant (UQ_attendance_tenant_user_date)
-- is untouched, because Payroll (payrollCalculation.service.js) and
-- reports.routes.js both compute "present days" as a row-count over this
-- table. Check-out/breaks/work-summary always UPDATE the same day's row or
-- write to the child `attendance_breaks` table — never a second row per day.
-- ============================================================

IF COL_LENGTH('attendance', 'check_out_time') IS NULL
ALTER TABLE attendance ADD check_out_time DATETIME2 NULL;
GO

IF COL_LENGTH('attendance', 'method') IS NULL
ALTER TABLE attendance ADD method NVARCHAR(30) NOT NULL CONSTRAINT DF_attendance_method DEFAULT ('Manual');
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_attendance_method')
ALTER TABLE attendance ADD CONSTRAINT CK_attendance_method
    CHECK (method IN ('Face', 'WFH', 'ClientVisit', 'FieldWork', 'Manual', 'Biometric', 'QRCode', 'API'));
GO

IF COL_LENGTH('attendance', 'work_mode') IS NULL
ALTER TABLE attendance ADD work_mode NVARCHAR(20) NULL;
GO

IF COL_LENGTH('attendance', 'device_id') IS NULL
BEGIN
    ALTER TABLE attendance ADD device_id INT NULL;
    ALTER TABLE attendance ADD CONSTRAINT FK_attendance_device FOREIGN KEY (device_id) REFERENCES kiosk_devices(id);
END
GO

IF COL_LENGTH('attendance', 'location_lat') IS NULL
ALTER TABLE attendance ADD location_lat DECIMAL(9,6) NULL;
GO

IF COL_LENGTH('attendance', 'location_lng') IS NULL
ALTER TABLE attendance ADD location_lng DECIMAL(9,6) NULL;
GO

IF COL_LENGTH('attendance', 'location_address') IS NULL
ALTER TABLE attendance ADD location_address NVARCHAR(255) NULL;
GO

IF COL_LENGTH('attendance', 'client_name') IS NULL
ALTER TABLE attendance ADD client_name NVARCHAR(200) NULL;
GO

IF COL_LENGTH('attendance', 'notes') IS NULL
ALTER TABLE attendance ADD notes NVARCHAR(1000) NULL;
GO

IF COL_LENGTH('attendance', 'work_summary') IS NULL
ALTER TABLE attendance ADD work_summary NVARCHAR(MAX) NULL;
GO

-- WFH break/resume timer — a child table so a day with multiple breaks
-- never needs a second `attendance` row.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'attendance_breaks')
CREATE TABLE attendance_breaks (
    id             INT IDENTITY(1,1) NOT NULL,
    tenant_id      INT NOT NULL,
    attendance_id  INT NOT NULL,
    break_start    DATETIME2 NOT NULL CONSTRAINT DF_attendance_breaks_start DEFAULT (SYSUTCDATETIME()),
    break_end      DATETIME2 NULL,
    CONSTRAINT PK_attendance_breaks PRIMARY KEY (id),
    CONSTRAINT FK_attendance_breaks_attendance FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE,
    CONSTRAINT FK_attendance_breaks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_attendance_breaks_attendance_id' AND object_id = OBJECT_ID('attendance_breaks'))
CREATE INDEX IX_attendance_breaks_attendance_id ON attendance_breaks(attendance_id);
GO
