-- ============================================================
-- Mywe HR — Phase 7, part 3: Shift Management.
--
-- `shifts`: General/Flexible/Night/Rotational/Split shift definitions.
-- Split shifts store their multiple work windows as a JSON array in
-- `time_windows` (read-whole-and-evaluated-in-JS, like attendance_policies
-- .config — not queried by SQL, so no child table is warranted). Rotational
-- shifts need no separate structure: they're just short-lived, chained
-- `employee_shift_assignments` rows across ordinary shifts.
--
-- `employee_shift_assignments` mirrors employee_salary_assignments'
-- effective-dated pattern exactly: exactly one open (effective_to IS NULL)
-- assignment per employee, full history preserved.
--
-- Additive nullable columns on `attendance` persist the facts computed at
-- check-in/out time (late_minutes, worked_minutes, etc.) so Reports/Payroll
-- never need to recompute them from raw timestamps. All nullable — an
-- employee with no shift assigned keeps today's exact behavior (status
-- always 'Present', no late/OT computation).
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'shifts')
CREATE TABLE shifts (
    id                            INT IDENTITY(1,1) NOT NULL,
    tenant_id                     INT NOT NULL,
    name                          NVARCHAR(150) NOT NULL,
    shift_type                    NVARCHAR(20) NOT NULL,
    start_time                    TIME NULL,
    end_time                      TIME NULL,
    is_overnight                  BIT NOT NULL CONSTRAINT DF_shifts_is_overnight DEFAULT (0),
    time_windows                  NVARCHAR(MAX) NULL,
    expected_work_minutes         INT NOT NULL CONSTRAINT DF_shifts_expected_work_minutes DEFAULT (480),
    grace_period_minutes          INT NOT NULL CONSTRAINT DF_shifts_grace_period_minutes DEFAULT (0),
    early_exit_threshold_minutes  INT NOT NULL CONSTRAINT DF_shifts_early_exit_threshold_minutes DEFAULT (0),
    break_type                    NVARCHAR(20) NOT NULL CONSTRAINT DF_shifts_break_type DEFAULT ('none'),
    break_duration_minutes        INT NULL,
    break_window_start            TIME NULL,
    break_window_end              TIME NULL,
    ot_enabled                    BIT NOT NULL CONSTRAINT DF_shifts_ot_enabled DEFAULT (0),
    ot_trigger_after_minutes      INT NULL,
    ot_requires_approval          BIT NOT NULL CONSTRAINT DF_shifts_ot_requires_approval DEFAULT (1),
    rotation_note                 NVARCHAR(500) NULL,
    is_active                     BIT NOT NULL CONSTRAINT DF_shifts_is_active DEFAULT (1),
    created_at                    DATETIME2 NOT NULL CONSTRAINT DF_shifts_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at                    DATETIME2 NOT NULL CONSTRAINT DF_shifts_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_shifts PRIMARY KEY (id),
    CONSTRAINT UQ_shifts_tenant_name UNIQUE (tenant_id, name),
    CONSTRAINT FK_shifts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT CK_shifts_type CHECK (shift_type IN ('General', 'Flexible', 'Night', 'Rotational', 'Split')),
    CONSTRAINT CK_shifts_break_type CHECK (break_type IN ('none', 'unpaid_duration', 'paid_duration', 'fixed_window'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_shifts_tenant_id' AND object_id = OBJECT_ID('shifts'))
    CREATE INDEX IX_shifts_tenant_id ON shifts(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'employee_shift_assignments')
CREATE TABLE employee_shift_assignments (
    id              INT IDENTITY(1,1) NOT NULL,
    tenant_id       INT NOT NULL,
    user_id         INT NOT NULL,
    shift_id        INT NOT NULL,
    effective_from  DATE NOT NULL,
    effective_to    DATE NULL,
    created_by      INT NOT NULL,
    created_at      DATETIME2 NOT NULL CONSTRAINT DF_employee_shift_assignments_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_employee_shift_assignments PRIMARY KEY (id),
    CONSTRAINT FK_esa_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT FK_esa_shift FOREIGN KEY (shift_id) REFERENCES shifts(id),
    CONSTRAINT FK_esa_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT CK_esa_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employee_shift_assignments_tenant_id' AND object_id = OBJECT_ID('employee_shift_assignments'))
    CREATE INDEX IX_employee_shift_assignments_tenant_id ON employee_shift_assignments(tenant_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employee_shift_assignments_user_id' AND object_id = OBJECT_ID('employee_shift_assignments'))
    CREATE INDEX IX_employee_shift_assignments_user_id ON employee_shift_assignments(user_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_employee_shift_assignments_user_open' AND object_id = OBJECT_ID('employee_shift_assignments'))
    CREATE UNIQUE INDEX UX_employee_shift_assignments_user_open
        ON employee_shift_assignments(tenant_id, user_id) WHERE effective_to IS NULL;
GO

IF COL_LENGTH('attendance', 'shift_id') IS NULL
BEGIN
    ALTER TABLE attendance ADD shift_id INT NULL;
    ALTER TABLE attendance ADD CONSTRAINT FK_attendance_shift FOREIGN KEY (shift_id) REFERENCES shifts(id);
END
GO
IF COL_LENGTH('attendance', 'late_minutes') IS NULL
    ALTER TABLE attendance ADD late_minutes INT NULL;
GO
IF COL_LENGTH('attendance', 'is_early_exit') IS NULL
    ALTER TABLE attendance ADD is_early_exit BIT NULL;
GO
IF COL_LENGTH('attendance', 'worked_minutes') IS NULL
    ALTER TABLE attendance ADD worked_minutes INT NULL;
GO
IF COL_LENGTH('attendance', 'overtime_minutes') IS NULL
    ALTER TABLE attendance ADD overtime_minutes INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'shifts.manage')
INSERT INTO permissions (code, module, description) VALUES
    ('shifts.manage', 'shifts', 'Create and edit shifts and assign them to employees');
GO

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'shifts.manage'
  AND r.code IN ('hr', 'super_admin')
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO

-- Seed a "Shifts" child under the Time & Leave menu group for every tenant.
INSERT INTO menu_items (tenant_id, parent_id, name, path, icon, module, permission, any_permission, sort_order, is_active, is_placeholder)
SELECT parent.tenant_id, parent.id, 'Shifts', '/shifts', 'Clock9', 'time', 'shifts.manage', NULL, 68, 1, 0
FROM menu_items parent
WHERE parent.path = '/attendance' AND parent.parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.tenant_id = parent.tenant_id AND mi.path = '/shifts');
GO
