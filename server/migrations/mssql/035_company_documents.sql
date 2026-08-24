-- ============================================================
-- Mywe HR — Phase 11: Company Documents Management.
--
-- Three new tables:
--   company_documents          -- logical document (title/category/metadata)
--   company_document_versions  -- one row per uploaded file revision
--   company_document_shares    -- visibility rules (all / role / department / branch)
--
-- company_documents.current_version_id is added via ALTER after
-- company_document_versions exists (same "add the FK column once the
-- referenced table exists" approach 031_org_structure.sql used for
-- users.designation_id) since the two tables reference each other.
--
-- Also adds notifications.link (nullable) so a document notification can
-- deep-link back into the module — the table has been message-only since
-- 001_initial_schema.sql.
-- ============================================================

-- ---- 1. company_documents ----

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_documents')
CREATE TABLE company_documents (
    id                  INT IDENTITY(1,1) NOT NULL,
    tenant_id           INT NOT NULL,
    title               NVARCHAR(255) NOT NULL,
    category            NVARCHAR(50) NOT NULL,
    description         NVARCHAR(MAX) NULL,
    effective_date      DATE NOT NULL,
    expiry_date         DATE NULL,
    status              NVARCHAR(20) NOT NULL CONSTRAINT DF_company_documents_status DEFAULT ('active'),
    created_by          INT NOT NULL,
    created_at          DATETIME2 NOT NULL CONSTRAINT DF_company_documents_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at          DATETIME2 NOT NULL CONSTRAINT DF_company_documents_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_company_documents PRIMARY KEY (id),
    CONSTRAINT CK_company_documents_status CHECK (status IN ('active', 'archived')),
    CONSTRAINT CK_company_documents_category CHECK (category IN (
        'Leave Policies', 'HR Policies', 'Employee Handbook', 'Code of Conduct', 'IT Policies',
        'Payroll Policies', 'Holiday Lists', 'Insurance Documents', 'Company Forms', 'Templates', 'Other Documents'
    )),
    CONSTRAINT FK_company_documents_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT FK_company_documents_created_by FOREIGN KEY (created_by) REFERENCES users(id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_company_documents_tenant_id' AND object_id = OBJECT_ID('company_documents'))
    CREATE INDEX IX_company_documents_tenant_id ON company_documents(tenant_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_company_documents_tenant_category' AND object_id = OBJECT_ID('company_documents'))
    CREATE INDEX IX_company_documents_tenant_category ON company_documents(tenant_id, category);
GO

-- ---- 2. company_document_versions ----

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_document_versions')
CREATE TABLE company_document_versions (
    id                    INT IDENTITY(1,1) NOT NULL,
    tenant_id             INT NOT NULL,
    document_id           INT NOT NULL,
    version_number        INT NOT NULL,
    original_file_name    NVARCHAR(255) NOT NULL,
    stored_file_name      NVARCHAR(255) NOT NULL,
    mime_type             NVARCHAR(100) NOT NULL,
    size_bytes            BIGINT NOT NULL,
    uploaded_by           INT NOT NULL,
    uploaded_at           DATETIME2 NOT NULL CONSTRAINT DF_company_document_versions_uploaded_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_company_document_versions PRIMARY KEY (id),
    CONSTRAINT UQ_company_document_versions_doc_version UNIQUE (document_id, version_number),
    CONSTRAINT FK_company_document_versions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT FK_company_document_versions_document FOREIGN KEY (document_id) REFERENCES company_documents(id),
    CONSTRAINT FK_company_document_versions_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_company_document_versions_document_id' AND object_id = OBJECT_ID('company_document_versions'))
    CREATE INDEX IX_company_document_versions_document_id ON company_document_versions(document_id);
GO

-- ---- 3. company_documents.current_version_id (added after versions table exists) ----

IF COL_LENGTH('company_documents', 'current_version_id') IS NULL
BEGIN
    ALTER TABLE company_documents ADD current_version_id INT NULL;
    ALTER TABLE company_documents ADD CONSTRAINT FK_company_documents_current_version FOREIGN KEY (current_version_id) REFERENCES company_document_versions(id);
END
GO

-- ---- 4. company_document_shares ----

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_document_shares')
CREATE TABLE company_document_shares (
    id                INT IDENTITY(1,1) NOT NULL,
    tenant_id         INT NOT NULL,
    document_id       INT NOT NULL,
    share_type        NVARCHAR(20) NOT NULL,
    role_id           INT NULL,
    department_id     INT NULL,
    location_id       INT NULL,
    created_at        DATETIME2 NOT NULL CONSTRAINT DF_company_document_shares_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_company_document_shares PRIMARY KEY (id),
    CONSTRAINT CK_company_document_shares_type CHECK (share_type IN ('all', 'role', 'department', 'branch')),
    CONSTRAINT FK_company_document_shares_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT FK_company_document_shares_document FOREIGN KEY (document_id) REFERENCES company_documents(id),
    CONSTRAINT FK_company_document_shares_role FOREIGN KEY (role_id) REFERENCES roles(id),
    CONSTRAINT FK_company_document_shares_department FOREIGN KEY (department_id) REFERENCES departments(id),
    CONSTRAINT FK_company_document_shares_location FOREIGN KEY (location_id) REFERENCES locations(id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_company_document_shares_document_id' AND object_id = OBJECT_ID('company_document_shares'))
    CREATE INDEX IX_company_document_shares_document_id ON company_document_shares(document_id);
GO

-- ---- 5. notifications.link (deep-link support) ----

IF COL_LENGTH('notifications', 'link') IS NULL
    ALTER TABLE notifications ADD link NVARCHAR(500) NULL;
GO

-- ---- 6. Permissions ----

IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'company-documents.view')
INSERT INTO permissions (code, module, description) VALUES
    ('company-documents.view', 'company-documents', 'View the company documents you have access to');
GO
IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'company-documents.manage')
INSERT INTO permissions (code, module, description) VALUES
    ('company-documents.manage', 'company-documents', 'Upload, version, archive and delete company documents');
GO

-- Same distribution as designations.manage/cost-centers.manage — hr + super_admin only.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('hr', 'super_admin')
  AND p.code IN ('company-documents.view', 'company-documents.manage')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
GO

-- ---- 7. Menu seed: top-level "Company Documents" (visible to every authenticated user — no permission/any_permission) ----

INSERT INTO menu_items (tenant_id, parent_id, name, path, icon, module, permission, any_permission, sort_order, is_active, is_placeholder)
SELECT t.id, NULL, 'Company Documents', '/company-documents', 'FolderOpen', 'company-documents', NULL, NULL, 45, 1, 0
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.tenant_id = t.id AND mi.path = '/company-documents');
GO
