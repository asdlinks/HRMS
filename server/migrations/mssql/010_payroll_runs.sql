-- ============================================================
-- Mywe HR — Payroll (Phase 4), part 2: payroll runs.
--
-- payroll_runs / payroll_run_lines / payroll_run_line_components are the
-- immutable financial record of a processed pay cycle. Everything that
-- feeds a number into a finalized payslip is SNAPSHOTTED here at process
-- time (including component name/code/type, not just an FK) so a run
-- already Approved/Paid can never silently change value because a salary
-- component, structure or employee assignment is edited afterwards — a
-- correction is always a new future-cycle run, never a retroactive edit.
-- Only Draft/Processing runs are recomputed from live configuration.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'payroll_runs')
CREATE TABLE payroll_runs (
    id                  INT IDENTITY(1,1) NOT NULL,
    tenant_id           INT NOT NULL,
    period_year         INT NOT NULL,
    period_month        INT NOT NULL,
    cycle_start_date    DATE NOT NULL,
    cycle_end_date      DATE NOT NULL,
    status              NVARCHAR(20) NOT NULL CONSTRAINT DF_payroll_runs_status DEFAULT ('Draft'),
    notes               NVARCHAR(MAX) NULL,
    created_by          INT NOT NULL,
    created_at          DATETIME2 NOT NULL CONSTRAINT DF_payroll_runs_created_at DEFAULT (SYSUTCDATETIME()),
    processed_at        DATETIME2 NULL,
    approved_by         INT NULL,
    approved_at         DATETIME2 NULL,
    paid_at             DATETIME2 NULL,
    CONSTRAINT PK_payroll_runs PRIMARY KEY (id),
    CONSTRAINT UQ_payroll_runs_tenant_period UNIQUE (tenant_id, period_year, period_month),
    CONSTRAINT FK_payroll_runs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT FK_payroll_runs_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT FK_payroll_runs_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
    CONSTRAINT CK_payroll_runs_status CHECK (status IN ('Draft', 'Processing', 'Approved', 'Paid', 'Cancelled')),
    CONSTRAINT CK_payroll_runs_month CHECK (period_month BETWEEN 1 AND 12)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_payroll_runs_tenant_id' AND object_id = OBJECT_ID('payroll_runs'))
CREATE INDEX IX_payroll_runs_tenant_id ON payroll_runs(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'payroll_run_lines')
CREATE TABLE payroll_run_lines (
    id                  INT IDENTITY(1,1) NOT NULL,
    tenant_id           INT NOT NULL,
    run_id              INT NOT NULL,
    user_id             INT NOT NULL,
    structure_id        INT NULL,
    working_days        DECIMAL(5,2) NOT NULL CONSTRAINT DF_payroll_run_lines_working_days DEFAULT (0),
    present_days        DECIMAL(5,2) NOT NULL CONSTRAINT DF_payroll_run_lines_present_days DEFAULT (0),
    paid_leave_days     DECIMAL(5,2) NOT NULL CONSTRAINT DF_payroll_run_lines_paid_leave_days DEFAULT (0),
    lop_days            DECIMAL(5,2) NOT NULL CONSTRAINT DF_payroll_run_lines_lop_days DEFAULT (0),
    ot_hours            DECIMAL(6,2) NOT NULL CONSTRAINT DF_payroll_run_lines_ot_hours DEFAULT (0),
    ot_amount           DECIMAL(18,2) NOT NULL CONSTRAINT DF_payroll_run_lines_ot_amount DEFAULT (0),
    gross_earnings      DECIMAL(18,2) NOT NULL CONSTRAINT DF_payroll_run_lines_gross_earnings DEFAULT (0),
    total_deductions    DECIMAL(18,2) NOT NULL CONSTRAINT DF_payroll_run_lines_total_deductions DEFAULT (0),
    net_pay             DECIMAL(18,2) NOT NULL CONSTRAINT DF_payroll_run_lines_net_pay DEFAULT (0),
    line_status         NVARCHAR(20) NOT NULL CONSTRAINT DF_payroll_run_lines_line_status DEFAULT ('Pending'),
    remarks             NVARCHAR(MAX) NULL,
    created_at          DATETIME2 NOT NULL CONSTRAINT DF_payroll_run_lines_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at          DATETIME2 NOT NULL CONSTRAINT DF_payroll_run_lines_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_payroll_run_lines PRIMARY KEY (id),
    CONSTRAINT UQ_payroll_run_lines_run_user UNIQUE (tenant_id, run_id, user_id),
    CONSTRAINT FK_payroll_run_lines_run FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
    CONSTRAINT FK_payroll_run_lines_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT FK_payroll_run_lines_structure FOREIGN KEY (structure_id) REFERENCES salary_structures(id) ON DELETE SET NULL,
    CONSTRAINT CK_payroll_run_lines_status CHECK (line_status IN ('Pending', 'Computed', 'Excluded'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_payroll_run_lines_run_id' AND object_id = OBJECT_ID('payroll_run_lines'))
CREATE INDEX IX_payroll_run_lines_run_id ON payroll_run_lines(run_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_payroll_run_lines_user_id' AND object_id = OBJECT_ID('payroll_run_lines'))
CREATE INDEX IX_payroll_run_lines_user_id ON payroll_run_lines(user_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'payroll_run_line_components')
CREATE TABLE payroll_run_line_components (
    id                INT IDENTITY(1,1) NOT NULL,
    tenant_id         INT NOT NULL,
    run_line_id       INT NOT NULL,
    component_id      INT NULL,
    component_code    NVARCHAR(50)  NOT NULL,
    component_name    NVARCHAR(150) NOT NULL,
    component_type    NVARCHAR(20)  NOT NULL,
    amount            DECIMAL(18,2) NOT NULL,
    sort_order        INT NOT NULL CONSTRAINT DF_payroll_run_line_components_sort_order DEFAULT (0),
    CONSTRAINT PK_payroll_run_line_components PRIMARY KEY (id),
    CONSTRAINT FK_payroll_run_line_components_line FOREIGN KEY (run_line_id) REFERENCES payroll_run_lines(id) ON DELETE CASCADE,
    CONSTRAINT FK_payroll_run_line_components_component FOREIGN KEY (component_id) REFERENCES salary_components(id) ON DELETE SET NULL,
    CONSTRAINT CK_payroll_run_line_components_type CHECK (component_type IN ('earning', 'deduction'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_payroll_run_line_components_run_line_id' AND object_id = OBJECT_ID('payroll_run_line_components'))
CREATE INDEX IX_payroll_run_line_components_run_line_id ON payroll_run_line_components(run_line_id);
GO

-- Decouples "payroll has been processed" from "the employee is allowed to
-- see it" (HR may finalize days before payday), and gives free view
-- analytics without touching the immutable financial rows above.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'payslips')
CREATE TABLE payslips (
    id                 INT IDENTITY(1,1) NOT NULL,
    tenant_id          INT NOT NULL,
    run_line_id        INT NOT NULL,
    user_id            INT NOT NULL,
    is_published       BIT NOT NULL CONSTRAINT DF_payslips_is_published DEFAULT (0),
    published_at       DATETIME2 NULL,
    published_by       INT NULL,
    first_viewed_at    DATETIME2 NULL,
    view_count         INT NOT NULL CONSTRAINT DF_payslips_view_count DEFAULT (0),
    CONSTRAINT PK_payslips PRIMARY KEY (id),
    CONSTRAINT UQ_payslips_run_line UNIQUE (tenant_id, run_line_id),
    CONSTRAINT FK_payslips_run_line FOREIGN KEY (run_line_id) REFERENCES payroll_run_lines(id) ON DELETE CASCADE,
    CONSTRAINT FK_payslips_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT FK_payslips_published_by FOREIGN KEY (published_by) REFERENCES users(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_payslips_user_id' AND object_id = OBJECT_ID('payslips'))
CREATE INDEX IX_payslips_user_id ON payslips(user_id);
GO
