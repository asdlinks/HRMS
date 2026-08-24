-- ============================================================
-- Mywe HR — Payroll (Phase 4), part 3: overtime.
--
-- Attendance today only records a check-in (no check-out/worked-hours), so
-- overtime cannot be derived automatically. Instead it is a manual
-- entry+approval flow, structurally similar to leaves: an employee/HR
-- submits hours worked on a given date, a manager/HR approves it, and only
-- Approved hours not yet stamped with a payroll_run_id are picked up by the
-- next payroll run (see payrollCalculation.service.js).
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'overtime_entries')
CREATE TABLE overtime_entries (
    id                  INT IDENTITY(1,1) NOT NULL,
    tenant_id           INT NOT NULL,
    user_id             INT NOT NULL,
    work_date           DATE NOT NULL,
    hours               DECIMAL(5,2) NOT NULL,
    reason              NVARCHAR(255) NULL,
    status              NVARCHAR(20) NOT NULL CONSTRAINT DF_overtime_entries_status DEFAULT ('Pending'),
    submitted_by        INT NOT NULL,
    submitted_at        DATETIME2 NOT NULL CONSTRAINT DF_overtime_entries_submitted_at DEFAULT (SYSUTCDATETIME()),
    approved_by         INT NULL,
    approved_at         DATETIME2 NULL,
    rejection_reason    NVARCHAR(255) NULL,
    payroll_run_id      INT NULL,
    CONSTRAINT PK_overtime_entries PRIMARY KEY (id),
    CONSTRAINT UQ_overtime_entries_user_date UNIQUE (tenant_id, user_id, work_date),
    CONSTRAINT FK_overtime_entries_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT FK_overtime_entries_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id),
    CONSTRAINT FK_overtime_entries_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
    CONSTRAINT FK_overtime_entries_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id),
    CONSTRAINT CK_overtime_entries_status CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    CONSTRAINT CK_overtime_entries_hours CHECK (hours > 0 AND hours <= 24)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_overtime_entries_tenant_id' AND object_id = OBJECT_ID('overtime_entries'))
CREATE INDEX IX_overtime_entries_tenant_id ON overtime_entries(tenant_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_overtime_entries_user_id' AND object_id = OBJECT_ID('overtime_entries'))
CREATE INDEX IX_overtime_entries_user_id ON overtime_entries(user_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_overtime_entries_status' AND object_id = OBJECT_ID('overtime_entries'))
CREATE INDEX IX_overtime_entries_status ON overtime_entries(status);
GO
