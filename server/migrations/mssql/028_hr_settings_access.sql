-- ============================================================
-- Mywe HR — Phase 9 follow-up: grant 'hr' role full settings self-service access.
--
-- SettingsPage.tsx's `isSuperAdminLike` gate (General Config, Locations /
-- Offices, Holiday Config, Attendance Rules, Menu Management, Roles &
-- Permissions tabs) requires BOTH users.view.team AND users.view.all.
-- 'hr' already had users.view.all but was missing users.view.team — an
-- oversight dating back to 005_seed_rbac_assignments.js's original hr
-- permission set — so even on existing tenants an hr-role user could never
-- see these tabs, only 'super_admin' could. Since 'hr' already sees every
-- employee via users.view.all, granting users.view.team too is not a new
-- visibility boundary, just unlocks the settings tabs gated on holding both.
-- Applied to every existing tenant's 'hr' role.
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'users.view.team'
  AND r.code = 'hr'
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO
