-- ============================================================
-- Mywe HR — Face Recognition Attendance (Phase 6), part 4: face enrollments.
--
-- Stores face embeddings keyed off the existing `users.id` — no shadow
-- employee table, per face-attendance/README.md. Multiple active rows per
-- user are allowed (multi-angle samples improve match accuracy); the kiosk
-- PWA pulls every active embedding for the tenant via
-- GET /api/face-attendance/embeddings/sync and matches locally.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'face_enrollments')
CREATE TABLE face_enrollments (
    id             INT IDENTITY(1,1) NOT NULL,
    tenant_id      INT NOT NULL,
    user_id        INT NOT NULL,
    embedding      NVARCHAR(MAX) NOT NULL, -- JSON float array (face-api.js 128-d descriptor)
    model_version  NVARCHAR(50) NOT NULL,
    is_active      BIT NOT NULL CONSTRAINT DF_face_enrollments_is_active DEFAULT (1),
    created_at     DATETIME2 NOT NULL CONSTRAINT DF_face_enrollments_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at     DATETIME2 NOT NULL CONSTRAINT DF_face_enrollments_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_face_enrollments PRIMARY KEY (id),
    CONSTRAINT FK_face_enrollments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT FK_face_enrollments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_face_enrollments_tenant_id' AND object_id = OBJECT_ID('face_enrollments'))
CREATE INDEX IX_face_enrollments_tenant_id ON face_enrollments(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_face_enrollments_user_id' AND object_id = OBJECT_ID('face_enrollments'))
CREATE INDEX IX_face_enrollments_user_id ON face_enrollments(user_id);
GO
