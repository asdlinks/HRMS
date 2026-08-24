-- ============================================================
-- Mywe HR — Phase 11 follow-up: move "Company Documents" from its own
-- top-level nav module (035_company_documents.sql) into a child of
-- Settings, so it sits alongside Work Modes instead of crowding the top
-- nav bar with a standalone item. Same corrective-migration pattern as
-- 034_reports_nav_admin_only.sql (a follow-up adjustment on top of an
-- earlier migration's menu seed, rather than editing already-applied SQL).
--
-- Handles both cases in one pass:
--   - A tenant whose 035 already inserted the top-level row: re-parent it.
--   - A tenant that somehow has no company-documents row at all: insert it
--     fresh as a Settings child (keeps this migration idempotent and safe
--     to run standalone regardless of what state 035 left things in).
-- No permission/any_permission — still visible to every authenticated
-- user, same as before, since employees need this to view shared documents.
-- ============================================================

UPDATE mi
SET mi.parent_id = parent.id, mi.sort_order = 15
FROM menu_items mi
JOIN menu_items parent ON parent.tenant_id = mi.tenant_id AND parent.path = '/settings' AND parent.parent_id IS NULL
WHERE mi.path = '/company-documents' AND mi.parent_id IS NULL;
GO

INSERT INTO menu_items (tenant_id, parent_id, name, path, icon, module, permission, any_permission, sort_order, is_active, is_placeholder)
SELECT parent.tenant_id, parent.id, 'Company Documents', '/company-documents', 'FolderOpen', 'company-documents', NULL, NULL, 15, 1, 0
FROM menu_items parent
WHERE parent.path = '/settings' AND parent.parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.tenant_id = parent.tenant_id AND mi.path = '/company-documents');
GO
