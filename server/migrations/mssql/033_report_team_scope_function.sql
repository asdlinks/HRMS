-- ============================================================
-- Mywe HR — Phase 10B follow-up: fix invalid 'team' scope SQL.
--
-- server/utils/reportScopeSql.js originally nested a recursive CTE directly
-- inside a bare `IN (...)` subquery — e.g.
--   WHERE u.id IN (WITH descendants AS (...) SELECT id FROM descendants)
-- This is NOT valid T-SQL (a WITH clause must lead its own top-level
-- statement, it cannot start a subquery expression) and was caught during
-- Phase 10B verification: every report at 'team' scope failed with
-- "Incorrect syntax near ')'". An inline table-valued function's body IS
-- allowed to be a single CTE + SELECT statement, and a function CALL (unlike
-- a bare CTE) is valid in any subquery position — so this replaces the
-- inline CTE with a callable function or the same shape.
-- ============================================================

IF OBJECT_ID('dbo.fn_report_team_scope', 'IF') IS NOT NULL
    DROP FUNCTION dbo.fn_report_team_scope;
GO

CREATE FUNCTION dbo.fn_report_team_scope (@requesterId INT, @tenantId INT)
RETURNS TABLE
AS
RETURN (
    WITH descendants AS (
        SELECT id FROM users WHERE id = @requesterId AND tenant_id = @tenantId
        UNION ALL
        SELECT u.id FROM users u JOIN descendants d ON u.manager_id = d.id WHERE u.tenant_id = @tenantId
    )
    SELECT id FROM descendants
);
GO
