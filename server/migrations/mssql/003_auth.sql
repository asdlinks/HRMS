-- ============================================================
-- Mywe HR — Authentication (Milestone 1)
-- Refresh-token storage for JWT access + refresh auth. Access tokens are
-- stateless (verified by signature only); refresh tokens are opaque values
-- whose hash is stored here so they can be looked up, rotated, and revoked.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'refresh_tokens')
CREATE TABLE refresh_tokens (
    id             INT IDENTITY(1,1) NOT NULL,
    user_id        INT NOT NULL,
    tenant_id      INT NOT NULL,
    token_hash     NVARCHAR(255) NOT NULL,
    expires_at     DATETIME2 NOT NULL,
    revoked_at     DATETIME2 NULL,
    replaced_by    INT NULL,
    created_at     DATETIME2 NOT NULL CONSTRAINT DF_refresh_tokens_created_at DEFAULT (SYSUTCDATETIME()),
    created_by_ip  NVARCHAR(64) NULL,
    user_agent     NVARCHAR(255) NULL,
    CONSTRAINT PK_refresh_tokens PRIMARY KEY (id),
    CONSTRAINT FK_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT FK_refresh_tokens_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT FK_refresh_tokens_replaced_by FOREIGN KEY (replaced_by) REFERENCES refresh_tokens(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_refresh_tokens_user_id' AND object_id = OBJECT_ID('refresh_tokens'))
CREATE INDEX IX_refresh_tokens_user_id ON refresh_tokens(user_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_refresh_tokens_token_hash' AND object_id = OBJECT_ID('refresh_tokens'))
CREATE INDEX IX_refresh_tokens_token_hash ON refresh_tokens(token_hash);
GO
