-- ============================================================
-- Remove Cost Centers from the product (user decision — no prior removal
-- record existed in project memory, confirmed this session).
--
-- Non-destructive: the `cost_centers` table and `users.cost_center_id`
-- column/FK are deliberately left in place, unused — same precedent this
-- codebase already used for the legacy `users.designation` text column
-- (031_org_structure.sql) when Designation became FK-backed. Only the
-- application-level wiring (permission, its grants, and its mention in the
-- Organization Structure menu item's any_permission list) is removed here;
-- all app code (routes, repositories, client UI, reports) was already
-- updated to stop referencing Cost Centers.
-- ============================================================

DELETE FROM role_permissions
WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'cost-centers.manage');
GO

DELETE FROM permissions WHERE code = 'cost-centers.manage';
GO

-- Strip 'cost-centers.manage' out of the Organization Structure menu item's
-- any_permission CSV list, wherever it appears in the list (leading,
-- trailing, middle, or as the sole entry) across every tenant.
UPDATE menu_items
SET any_permission = REPLACE(REPLACE(any_permission, 'cost-centers.manage,', ''), ',cost-centers.manage', '')
WHERE path = '/organization' AND any_permission LIKE '%cost-centers.manage%';
GO

UPDATE menu_items
SET any_permission = NULL
WHERE path = '/organization' AND any_permission = 'cost-centers.manage';
GO
