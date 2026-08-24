-- ============================================================
-- Mywe HR — Phase 10B Analytics Center: narrow the Reports & Analytics
-- nav item to admin-facing roles only.
--
-- 032_reports_platform.sql gated the /reports menu item on the FULL
-- reports.* permission list, including every own/team scoped permission.
-- Since `manager` holds reports.*.view.team and `employee` holds
-- reports.*.view.own, both currently unlock the Reports nav item — but the
-- Analytics Center redesign moves manager/employee reporting into
-- Team Analytics / Employee Self-Service surfaces instead (a later phase),
-- not the Reports module. Narrow the gate to only the .all-scope and flat
-- org-wide permissions, which only super_admin/hr/payroll_admin/
-- attendance_admin hold.
-- ============================================================

UPDATE menu_items
SET any_permission = 'reports.employee.view.all,reports.attendance.view.all,reports.leave.view.all,' +
                      'reports.payroll.view.all,reports.organization.view,reports.compliance.view,reports.audit.view'
WHERE path = '/reports';
GO
