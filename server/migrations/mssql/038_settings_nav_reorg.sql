-- ============================================================
-- Mywe HR — Phase 11A: Navigation & Settings simplification (part 2).
--
-- 1. "Company Documents" is currently a child of Settings
--    (036_company_documents_menu_under_settings.sql), even though its route
--    has no permission gate (App.tsx `/company-documents`) — every employee
--    can open it, but today they can only find it via a "Settings" tab that
--    is otherwise irrelevant to them. Promote it back to a top-level module
--    (peer of Payroll/Reports), renamed "Documents" to match. This reverses
--    036, but 036's stated reason was top-nav crowding from Recruitment/
--    Performance/Assets always being visible — 037 just fixed that by
--    disabling those three by default, so there's room again.
--
-- 2. "Salary Grades" is a rarely-touched Payroll config screen sitting
--    alongside Payroll Runs/Payslips that employees/managers use constantly.
--    Soft-disable it as a Payroll nav child (is_active = 0, existing column
--    — the route/permission at /payroll/grades is untouched) now that it's
--    surfaced instead as a Settings > Advanced link (SettingsPage.tsx).
--
-- 3. "Work Modes" (a Settings child today) becomes reachable via the
--    Settings page's own grouped sidebar instead of ContextSidebar, so
--    Settings has zero nav children and stops being a second, overlapping
--    layer of sub-navigation. Soft-disable its menu row the same way;
--    /work-modes access is unaffected (ProtectedRoute, not menu-item-gated).
-- ============================================================

UPDATE menu_items
SET parent_id = NULL, name = 'Documents', module = 'company-documents', sort_order = 125
WHERE path = '/company-documents' AND parent_id IS NOT NULL;
GO

UPDATE menu_items
SET is_active = 0
WHERE path = '/payroll/grades';
GO

UPDATE menu_items
SET is_active = 0
WHERE path = '/work-modes' AND parent_id IS NOT NULL;
GO
