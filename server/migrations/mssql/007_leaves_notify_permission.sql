-- ============================================================
-- Mywe HR — Explicit permission for "notify manager/admin on leave request"
--
-- routes/leaves.routes.js used to gate this notification on a raw
-- `user.role === 'employee' || user.role === 'hr'` check — the last
-- hardcoded role string left in the RBAC-migrated backend. That behavior
-- (employee/HR requests notify someone; manager/super_admin requests do
-- not) is a real, intentional business rule, so instead of just deleting
-- the check it becomes a first-class, admin-configurable permission.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'leaves.notify_on_apply')
INSERT INTO permissions (code, module, description) VALUES
    ('leaves.notify_on_apply', 'leaves', 'Notify a manager/admin when this user applies for leave');
GO

-- Grant it to every tenant's 'employee' and 'hr' roles (the two legacy
-- roles that previously triggered this notification), skipping roles that
-- already have it so this file can be re-run safely.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'leaves.notify_on_apply'
  AND r.code IN ('employee', 'hr')
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO
