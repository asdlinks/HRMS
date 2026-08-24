-- ============================================================
-- Mywe HR — Payroll (Phase 4), part 1: the configurable salary
-- component/structure catalogue + employee salary assignment.
--
-- Deliberately generic: no PF/ESI/Professional-Tax/TDS formulas are
-- hardcoded anywhere. A tenant admin defines every earning/deduction as a
-- `salary_components` row (fixed amount, % of CTC, % of gross, % of another
-- component, or a slab table), then groups components into a
-- `salary_structures` template, then assigns a structure + CTC to an
-- employee via `employee_salary_assignments`. Nothing here computes pay —
-- see server/services/payrollCalculation.service.js for that.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'salary_components')
CREATE TABLE salary_components (
    id                    INT IDENTITY(1,1) NOT NULL,
    tenant_id             INT NOT NULL,
    code                  NVARCHAR(50)  NOT NULL,
    name                  NVARCHAR(150) NOT NULL,
    component_type        NVARCHAR(20)  NOT NULL,
    calculation_type      NVARCHAR(30)  NOT NULL,
    value                 DECIMAL(18,4) NULL,
    base_component_id     INT NULL,
    config                NVARCHAR(MAX) NULL,
    is_prorated_on_lop    BIT NOT NULL CONSTRAINT DF_salary_components_is_prorated_on_lop DEFAULT (1),
    is_active             BIT NOT NULL CONSTRAINT DF_salary_components_is_active DEFAULT (1),
    sort_order            INT NOT NULL CONSTRAINT DF_salary_components_sort_order DEFAULT (0),
    created_at            DATETIME2 NOT NULL CONSTRAINT DF_salary_components_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at            DATETIME2 NOT NULL CONSTRAINT DF_salary_components_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_salary_components PRIMARY KEY (id),
    CONSTRAINT UQ_salary_components_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT FK_salary_components_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT FK_salary_components_base FOREIGN KEY (base_component_id) REFERENCES salary_components(id),
    CONSTRAINT CK_salary_components_component_type CHECK (component_type IN ('earning', 'deduction')),
    CONSTRAINT CK_salary_components_calculation_type CHECK (calculation_type IN ('fixed', 'percent_ctc', 'percent_gross', 'percent_of_component', 'slab')),
    CONSTRAINT CK_salary_components_base_required CHECK (calculation_type <> 'percent_of_component' OR base_component_id IS NOT NULL),
    CONSTRAINT CK_salary_components_config_required CHECK (calculation_type <> 'slab' OR config IS NOT NULL)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_salary_components_tenant_id' AND object_id = OBJECT_ID('salary_components'))
CREATE INDEX IX_salary_components_tenant_id ON salary_components(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'salary_structures')
CREATE TABLE salary_structures (
    id            INT IDENTITY(1,1) NOT NULL,
    tenant_id     INT NOT NULL,
    name          NVARCHAR(150) NOT NULL,
    description   NVARCHAR(500) NULL,
    is_active     BIT NOT NULL CONSTRAINT DF_salary_structures_is_active DEFAULT (1),
    created_at    DATETIME2 NOT NULL CONSTRAINT DF_salary_structures_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at    DATETIME2 NOT NULL CONSTRAINT DF_salary_structures_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_salary_structures PRIMARY KEY (id),
    CONSTRAINT UQ_salary_structures_tenant_name UNIQUE (tenant_id, name),
    CONSTRAINT FK_salary_structures_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_salary_structures_tenant_id' AND object_id = OBJECT_ID('salary_structures'))
CREATE INDEX IX_salary_structures_tenant_id ON salary_structures(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'salary_structure_components')
CREATE TABLE salary_structure_components (
    id                INT IDENTITY(1,1) NOT NULL,
    tenant_id         INT NOT NULL,
    structure_id      INT NOT NULL,
    component_id      INT NOT NULL,
    override_value    DECIMAL(18,4) NULL,
    sort_order        INT NOT NULL CONSTRAINT DF_salary_structure_components_sort_order DEFAULT (0),
    CONSTRAINT PK_salary_structure_components PRIMARY KEY (id),
    CONSTRAINT UQ_salary_structure_components_structure_component UNIQUE (tenant_id, structure_id, component_id),
    CONSTRAINT FK_salary_structure_components_structure FOREIGN KEY (structure_id) REFERENCES salary_structures(id) ON DELETE CASCADE,
    CONSTRAINT FK_salary_structure_components_component FOREIGN KEY (component_id) REFERENCES salary_components(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_salary_structure_components_structure_id' AND object_id = OBJECT_ID('salary_structure_components'))
CREATE INDEX IX_salary_structure_components_structure_id ON salary_structure_components(structure_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'employee_salary_assignments')
CREATE TABLE employee_salary_assignments (
    id                          INT IDENTITY(1,1) NOT NULL,
    tenant_id                   INT NOT NULL,
    user_id                     INT NOT NULL,
    structure_id                INT NOT NULL,
    ctc_annual                  DECIMAL(18,2) NOT NULL,
    effective_from              DATE NOT NULL,
    effective_to                DATE NULL,
    bank_account_holder_name    NVARCHAR(150) NULL,
    bank_account_number         NVARCHAR(50)  NULL,
    bank_name                   NVARCHAR(150) NULL,
    bank_routing_code           NVARCHAR(30)  NULL,
    created_by                  INT NOT NULL,
    created_at                  DATETIME2 NOT NULL CONSTRAINT DF_employee_salary_assignments_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_employee_salary_assignments PRIMARY KEY (id),
    CONSTRAINT FK_employee_salary_assignments_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT FK_employee_salary_assignments_structure FOREIGN KEY (structure_id) REFERENCES salary_structures(id),
    CONSTRAINT FK_employee_salary_assignments_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT CK_employee_salary_assignments_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT CK_employee_salary_assignments_ctc CHECK (ctc_annual >= 0)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employee_salary_assignments_tenant_id' AND object_id = OBJECT_ID('employee_salary_assignments'))
CREATE INDEX IX_employee_salary_assignments_tenant_id ON employee_salary_assignments(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employee_salary_assignments_user_id' AND object_id = OBJECT_ID('employee_salary_assignments'))
CREATE INDEX IX_employee_salary_assignments_user_id ON employee_salary_assignments(user_id);
GO

-- Exactly one currently-open assignment per employee.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_employee_salary_assignments_user_open' AND object_id = OBJECT_ID('employee_salary_assignments'))
CREATE UNIQUE INDEX UX_employee_salary_assignments_user_open
    ON employee_salary_assignments(tenant_id, user_id) WHERE effective_to IS NULL;
GO
