// Resolves the highest report-visibility scope a requester holds for a given
// permission prefix (e.g. 'reports.employee.view' -> 'all'|'team'|'own'|null),
// replacing the inline ternary chain duplicated across reports.routes.js and
// leaves.routes.js before this phase.
const SCOPE_PRECEDENCE = ['all', 'team', 'own'];

function resolveScope(permissions, prefix) {
    const granted = permissions || [];
    for (const scope of SCOPE_PRECEDENCE) {
        if (granted.includes(`${prefix}.${scope}`)) return scope;
    }
    return null;
}

module.exports = { resolveScope };
