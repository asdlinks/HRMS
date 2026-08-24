-- ============================================================
-- Mywe HR — Phase 11A: Navigation & Settings simplification.
--
-- Recruitment/Performance/Assets are Coming-Soon stubs (021_menu_items_
-- hierarchy.sql's is_placeholder flag) that TopNav already tucks into a
-- "More" overflow menu — but they still render by default for every tenant
-- because is_feature_enabled defaults to 1. A first-time SMB admin sees
-- three dead-end tabs with nothing behind them. Disable them by default;
-- the existing Menu Management switch (SettingsPage.tsx, is_feature_enabled)
-- lets an admin turn one back on the moment it's actually needed — nothing
-- is removed, just hidden until wanted, per the "hide by default, discover
-- when needed" pattern the rest of this phase follows.
-- ============================================================

UPDATE menu_items
SET is_feature_enabled = 0
WHERE module IN ('recruitment', 'performance', 'assets')
  AND parent_id IS NULL
  AND is_placeholder = 1;
GO
