-- ============================================================
-- Mywe HR — Payroll (Phase 4), part 5: menu + default settings.
--
-- Flips the existing "Payroll" placeholder menu_items row (seeded as
-- is_placeholder=1 in 006_menu_items.sql) to a real, permission-gated nav
-- entry, and seeds a default payroll_settings JSON key into `settings` for
-- every existing tenant so the calculation engine always has values to
-- read (pay cycle day, OT multiplier, rounding, currency, FY start month).
-- ============================================================

UPDATE menu_items
SET is_placeholder = 0,
    permission = NULL,
    any_permission = 'payroll.view.own,payroll.view.team,payroll.view.all'
WHERE path = '/payroll';
GO

INSERT INTO settings (tenant_id, [key], value)
SELECT t.id, 'payroll_settings',
    '{"pay_cycle_day":1,"financial_year_start_month":4,"currency":"INR","ot_rate_multiplier":1.5,"ot_hourly_base_component_code":null,"standard_monthly_hours":208,"rounding_rule":"nearest_1"}'
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM settings s WHERE s.tenant_id = t.id AND s.[key] = 'payroll_settings'
);
GO
