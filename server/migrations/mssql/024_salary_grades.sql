-- ============================================================
-- Mywe HR — Phase 7, part 5: Salary Grades.
--
-- Grade -> Structure -> Employee: `grade_id` is a nullable FK added to the
-- existing `salary_structures` table (a grade can own several candidate
-- structures), with `salary_grades.default_structure_id` for UX
-- auto-suggestion. `employee_salary_assignments.grade_id` is additive and
-- traceability-only — direct structure-only assignment (no grade picked)
-- keeps working exactly as before, and payrollCalculation.service.js never
-- reads grade_id, so payroll for ungraded employees is unaffected.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'salary_grades')
CREATE TABLE salary_grades (
    id                    INT IDENTITY(1,1) NOT NULL,
    tenant_id             INT NOT NULL,
    code                  NVARCHAR(50) NOT NULL,
    name                  NVARCHAR(150) NOT NULL,
    description           NVARCHAR(500) NULL,
    min_amount            DECIMAL(18,2) NULL,
    mid_amount            DECIMAL(18,2) NULL,
    max_amount            DECIMAL(18,2) NULL,
    default_structure_id  INT NULL,
    is_active             BIT NOT NULL CONSTRAINT DF_salary_grades_is_active DEFAULT (1),
    created_at            DATETIME2 NOT NULL CONSTRAINT DF_salary_grades_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at            DATETIME2 NOT NULL CONSTRAINT DF_salary_grades_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_salary_grades PRIMARY KEY (id),
    CONSTRAINT UQ_salary_grades_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT FK_salary_grades_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT FK_salary_grades_default_structure FOREIGN KEY (default_structure_id) REFERENCES salary_structures(id),
    CONSTRAINT CK_salary_grades_range CHECK (min_amount IS NULL OR max_amount IS NULL OR max_amount >= min_amount)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_salary_grades_tenant_id' AND object_id = OBJECT_ID('salary_grades'))
    CREATE INDEX IX_salary_grades_tenant_id ON salary_grades(tenant_id);
GO

IF COL_LENGTH('salary_structures', 'grade_id') IS NULL
BEGIN
    ALTER TABLE salary_structures ADD grade_id INT NULL;
    ALTER TABLE salary_structures ADD CONSTRAINT FK_salary_structures_grade FOREIGN KEY (grade_id) REFERENCES salary_grades(id);
END
GO

IF COL_LENGTH('employee_salary_assignments', 'grade_id') IS NULL
BEGIN
    ALTER TABLE employee_salary_assignments ADD grade_id INT NULL;
    ALTER TABLE employee_salary_assignments ADD CONSTRAINT FK_esa_grade FOREIGN KEY (grade_id) REFERENCES salary_grades(id);
END
GO

IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'salary-grades.manage')
INSERT INTO permissions (code, module, description) VALUES
    ('salary-grades.manage', 'payroll', 'Create and edit salary grades and link them to salary structures');
GO

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'salary-grades.manage'
  AND r.code IN ('hr', 'super_admin')
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO

-- Seed a "Salary Grades" child under the Payroll menu group for every tenant.
INSERT INTO menu_items (tenant_id, parent_id, name, path, icon, module, permission, any_permission, sort_order, is_active, is_placeholder)
SELECT parent.tenant_id, parent.id, 'Salary Grades', '/payroll/grades', 'Layers', 'payroll', 'salary-grades.manage', NULL, 89, 1, 0
FROM menu_items parent
WHERE parent.path = '/payroll' AND parent.parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.tenant_id = parent.tenant_id AND mi.path = '/payroll/grades');
GO
