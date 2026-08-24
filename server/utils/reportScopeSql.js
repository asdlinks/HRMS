const { sql } = require('../db/sql');

// Builds a self-contained subquery yielding user ids visible at `scope`.
// 'team' calls dbo.fn_report_team_scope (033_report_team_scope_function.sql)
// — a recursive CTE nested directly inside a bare IN(...) subquery is NOT
// valid T-SQL (a WITH clause must lead its own statement, verified against
// the real dev DB during Phase 10B testing: "Incorrect syntax near ')'");
// an inline table-valued FUNCTION CALL is valid in any subquery position,
// and its body is free to use the same recursive-CTE direct+indirect-reports
// walk as users.repository.js's listUsers({scope:'team'}).
function scopeUserIdSubquery(scope, params, { tenantId, requesterId }) {
    params.tenantId = { type: sql.Int, value: tenantId };
    params.requesterId = { type: sql.Int, value: requesterId };

    if (scope === 'own') return '(SELECT @requesterId)';

    if (scope === 'team') {
        return '(SELECT id FROM dbo.fn_report_team_scope(@requesterId, @tenantId))';
    }

    return null; // 'all' — no restriction
}

// Appends "AND <userIdColumn> IN (...)" to whereParts when scope narrows
// visibility; leaves whereParts untouched for scope === 'all'.
function applyScope(whereParts, params, scope, ctx, userIdColumn = 'u.id') {
    const subquery = scopeUserIdSubquery(scope, params, ctx);
    if (subquery) whereParts.push(`${userIdColumn} IN ${subquery}`);
}

module.exports = { applyScope, scopeUserIdSubquery };
