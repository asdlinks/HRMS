-- ============================================================
-- Mywe HR — Phase 10A: Organization Structure module.
--
-- Branches: `locations` already exists (id, tenant_id, name) and is used by
-- users.location_id, holiday scoping, and dropdown filters — rather than
-- add a parallel `branches` table, this extends `locations` in place with
-- richer fields and the UI relabels it "Branch". The table/column/FK names
-- (`locations`/`location_id`) are UNCHANGED so every existing reference
-- (attendance, holidays, payroll, reports) keeps working untouched.
--
-- Designations: `users.designation` has been free text since day one. This
-- adds a proper `designations` master table + `users.designation_id` FK,
-- backfilled from the existing text values (one designations row per
-- distinct non-blank value, per tenant). The old text column is left in the
-- schema untouched — the app stops writing to it going forward and reads
-- through the FK join instead (users.repository.js aliases
-- `designations.name AS designation` so existing consumers of the `.designation`
-- field keep working unchanged).
--
-- Cost Centers, Employment Types, Employee Categories: brand new, flat
-- lookup tables — identical shape to `departments`/`locations` (id,
-- tenant_id, name, code, description, is_active). None are hierarchical
-- per the Phase 10A org-structure decision.
--
-- Reporting Hierarchy: no schema change — `users.manager_id` (self-FK) +
-- the existing OrgTree UI already cover it; this migration only makes sure
-- the new FK columns ride along on the same `users` row those views read.
-- ============================================================

-- ---- 1. Branches: extend `locations` ----

IF COL_LENGTH('locations', 'code') IS NULL
    ALTER TABLE locations ADD code NVARCHAR(20) NULL;
GO
IF COL_LENGTH('locations', 'address') IS NULL
    ALTER TABLE locations ADD address NVARCHAR(500) NULL;
GO
IF COL_LENGTH('locations', 'city') IS NULL
    ALTER TABLE locations ADD city NVARCHAR(100) NULL;
GO
IF COL_LENGTH('locations', 'state') IS NULL
    ALTER TABLE locations ADD state NVARCHAR(100) NULL;
GO
IF COL_LENGTH('locations', 'country') IS NULL
    ALTER TABLE locations ADD country NVARCHAR(100) NULL;
GO
IF COL_LENGTH('locations', 'is_active') IS NULL
    ALTER TABLE locations ADD is_active BIT NOT NULL CONSTRAINT DF_locations_is_active DEFAULT (1);
GO

-- ---- 2. New flat lookup tables ----

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'designations')
CREATE TABLE designations (
    id            INT IDENTITY(1,1) NOT NULL,
    tenant_id     INT NOT NULL,
    name          NVARCHAR(150) NOT NULL,
    code          NVARCHAR(20) NULL,
    description   NVARCHAR(500) NULL,
    is_active     BIT NOT NULL CONSTRAINT DF_designations_is_active DEFAULT (1),
    created_at    DATETIME2 NOT NULL CONSTRAINT DF_designations_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at    DATETIME2 NOT NULL CONSTRAINT DF_designations_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_designations PRIMARY KEY (id),
    CONSTRAINT UQ_designations_tenant_name UNIQUE (tenant_id, name),
    CONSTRAINT FK_designations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_designations_tenant_id' AND object_id = OBJECT_ID('designations'))
    CREATE INDEX IX_designations_tenant_id ON designations(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'cost_centers')
CREATE TABLE cost_centers (
    id            INT IDENTITY(1,1) NOT NULL,
    tenant_id     INT NOT NULL,
    name          NVARCHAR(150) NOT NULL,
    code          NVARCHAR(20) NULL,
    description   NVARCHAR(500) NULL,
    is_active     BIT NOT NULL CONSTRAINT DF_cost_centers_is_active DEFAULT (1),
    created_at    DATETIME2 NOT NULL CONSTRAINT DF_cost_centers_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at    DATETIME2 NOT NULL CONSTRAINT DF_cost_centers_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_cost_centers PRIMARY KEY (id),
    CONSTRAINT UQ_cost_centers_tenant_name UNIQUE (tenant_id, name),
    CONSTRAINT FK_cost_centers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cost_centers_tenant_id' AND object_id = OBJECT_ID('cost_centers'))
    CREATE INDEX IX_cost_centers_tenant_id ON cost_centers(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'employment_types')
CREATE TABLE employment_types (
    id            INT IDENTITY(1,1) NOT NULL,
    tenant_id     INT NOT NULL,
    name          NVARCHAR(150) NOT NULL,
    code          NVARCHAR(20) NULL,
    description   NVARCHAR(500) NULL,
    is_active     BIT NOT NULL CONSTRAINT DF_employment_types_is_active DEFAULT (1),
    created_at    DATETIME2 NOT NULL CONSTRAINT DF_employment_types_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at    DATETIME2 NOT NULL CONSTRAINT DF_employment_types_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_employment_types PRIMARY KEY (id),
    CONSTRAINT UQ_employment_types_tenant_name UNIQUE (tenant_id, name),
    CONSTRAINT FK_employment_types_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employment_types_tenant_id' AND object_id = OBJECT_ID('employment_types'))
    CREATE INDEX IX_employment_types_tenant_id ON employment_types(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'employee_categories')
CREATE TABLE employee_categories (
    id            INT IDENTITY(1,1) NOT NULL,
    tenant_id     INT NOT NULL,
    name          NVARCHAR(150) NOT NULL,
    code          NVARCHAR(20) NULL,
    description   NVARCHAR(500) NULL,
    is_active     BIT NOT NULL CONSTRAINT DF_employee_categories_is_active DEFAULT (1),
    created_at    DATETIME2 NOT NULL CONSTRAINT DF_employee_categories_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at    DATETIME2 NOT NULL CONSTRAINT DF_employee_categories_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_employee_categories PRIMARY KEY (id),
    CONSTRAINT UQ_employee_categories_tenant_name UNIQUE (tenant_id, name),
    CONSTRAINT FK_employee_categories_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employee_categories_tenant_id' AND object_id = OBJECT_ID('employee_categories'))
    CREATE INDEX IX_employee_categories_tenant_id ON employee_categories(tenant_id);
GO

-- ---- 3. New FK columns on `users` ----

IF COL_LENGTH('users', 'designation_id') IS NULL
BEGIN
    ALTER TABLE users ADD designation_id INT NULL;
    ALTER TABLE users ADD CONSTRAINT FK_users_designation FOREIGN KEY (designation_id) REFERENCES designations(id);
END
GO
IF COL_LENGTH('users', 'cost_center_id') IS NULL
BEGIN
    ALTER TABLE users ADD cost_center_id INT NULL;
    ALTER TABLE users ADD CONSTRAINT FK_users_cost_center FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id);
END
GO
IF COL_LENGTH('users', 'employment_type_id') IS NULL
BEGIN
    ALTER TABLE users ADD employment_type_id INT NULL;
    ALTER TABLE users ADD CONSTRAINT FK_users_employment_type FOREIGN KEY (employment_type_id) REFERENCES employment_types(id);
END
GO
IF COL_LENGTH('users', 'employee_category_id') IS NULL
BEGIN
    ALTER TABLE users ADD employee_category_id INT NULL;
    ALTER TABLE users ADD CONSTRAINT FK_users_employee_category FOREIGN KEY (employee_category_id) REFERENCES employee_categories(id);
END
GO

-- ---- 4. Designation backfill (existing tenants, one-time) ----

INSERT INTO designations (tenant_id, name)
SELECT DISTINCT u.tenant_id, LTRIM(RTRIM(u.designation))
FROM users u
WHERE u.designation IS NOT NULL AND LTRIM(RTRIM(u.designation)) <> ''
  AND NOT EXISTS (
      SELECT 1 FROM designations d WHERE d.tenant_id = u.tenant_id AND d.name = LTRIM(RTRIM(u.designation))
  );
GO

UPDATE u
SET u.designation_id = d.id
FROM users u
JOIN designations d ON d.tenant_id = u.tenant_id AND d.name = LTRIM(RTRIM(u.designation))
WHERE u.designation_id IS NULL AND u.designation IS NOT NULL AND LTRIM(RTRIM(u.designation)) <> '';
GO

-- ---- 5. Default seed rows (existing tenants) ----
-- Cost Centers and Designations are org-specific and intentionally NOT
-- seeded with placeholder data beyond the backfill above.

INSERT INTO employment_types (tenant_id, name, code)
SELECT t.id, v.name, v.code
FROM tenants t
CROSS JOIN (VALUES ('Full-Time', 'FT'), ('Part-Time', 'PT'), ('Contract', 'CON'), ('Intern', 'INT'), ('Consultant', 'CNS')) AS v(name, code)
WHERE NOT EXISTS (SELECT 1 FROM employment_types et WHERE et.tenant_id = t.id AND et.name = v.name);
GO

INSERT INTO employee_categories (tenant_id, name, code)
SELECT t.id, v.name, v.code
FROM tenants t
CROSS JOIN (VALUES ('Staff', 'STF'), ('Management', 'MGT'), ('Workman', 'WRK')) AS v(name, code)
WHERE NOT EXISTS (SELECT 1 FROM employee_categories ec WHERE ec.tenant_id = t.id AND ec.name = v.name);
GO

-- ---- 6. Permissions ----

IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'designations.manage')
INSERT INTO permissions (code, module, description) VALUES
    ('designations.manage', 'designations', 'Create, edit and delete designations');
GO
IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'cost-centers.manage')
INSERT INTO permissions (code, module, description) VALUES
    ('cost-centers.manage', 'cost-centers', 'Create, edit and delete cost centers');
GO
IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'employment-types.manage')
INSERT INTO permissions (code, module, description) VALUES
    ('employment-types.manage', 'employment-types', 'Create, edit and delete employment types');
GO
IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'employee-categories.manage')
INSERT INTO permissions (code, module, description) VALUES
    ('employee-categories.manage', 'employee-categories', 'Create, edit and delete employee categories');
GO

-- Same distribution as departments.manage/locations.manage — hr + super_admin only.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('hr', 'super_admin')
  AND p.code IN ('designations.manage', 'cost-centers.manage', 'employment-types.manage', 'employee-categories.manage')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
GO

-- ---- 7. Menu seed: "Organization Structure" under the Employees (People) group ----

INSERT INTO menu_items (tenant_id, parent_id, name, path, icon, module, permission, any_permission, sort_order, is_active, is_placeholder)
SELECT parent.tenant_id, parent.id, 'Organization Structure', '/organization', 'Network', 'people', NULL,
       'designations.manage,cost-centers.manage,employment-types.manage,employee-categories.manage', 35, 1, 0
FROM menu_items parent
WHERE parent.path = '/employees' AND parent.parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.tenant_id = parent.tenant_id AND mi.path = '/organization');
GO
