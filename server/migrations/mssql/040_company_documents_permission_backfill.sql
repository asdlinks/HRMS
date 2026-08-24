-- ============================================================
-- Backfill: company-documents.view/manage was granted to hr/super_admin
-- by migration 035_company_documents.sql, but only for roles that already
-- existed in the `roles` table at the moment 035 ran. tenantProvisioning
-- .service.js's ROLE_PERMISSIONS seed (used for every tenant provisioned
-- via the Platform Admin portal) was never updated to include these two
-- codes, so any tenant created after 035 — via the normal provisioning
-- flow, not a raw migration — never received them. This re-runs the exact
-- same tenant-agnostic, NOT-EXISTS-guarded grant from 035 to catch every
-- role created since, alongside the ROLE_PERMISSIONS fix in the service
-- itself so future tenants get it from the start.
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('hr', 'super_admin')
  AND p.code IN ('company-documents.view', 'company-documents.manage')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
GO
