const { one, sql } = require('../db/sql');

// One high-level KPI set for the Platform Admin dashboard (Part 1) — every
// number here is a cross-tenant COUNT, never a row-level HR record, per the
// "Platform Administrator is not an HR user" boundary (Part 10).
async function getDashboardKpis() {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));

    const [tenantCounts, userCounts] = await Promise.all([
        one(
            `SELECT
                COUNT(*) AS total_companies,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_companies,
                SUM(CASE WHEN status = 'trial' THEN 1 ELSE 0 END) AS trial_companies,
                SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended_companies,
                SUM(CASE WHEN created_at >= @monthStart THEN 1 ELSE 0 END) AS new_companies_this_month
             FROM tenants`,
            { monthStart: { type: sql.DateTime2, value: monthStart } }
        ),
        one(
            `SELECT
                COUNT(*) AS total_employees,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS total_active_users,
                SUM(CASE WHEN created_at >= @monthStart THEN 1 ELSE 0 END) AS new_employees_this_month
             FROM users`,
            { monthStart: { type: sql.DateTime2, value: monthStart } }
        ),
    ]);

    return {
        totalCompanies: tenantCounts.total_companies || 0,
        activeCompanies: tenantCounts.active_companies || 0,
        trialCompanies: tenantCounts.trial_companies || 0,
        suspendedCompanies: tenantCounts.suspended_companies || 0,
        newCompaniesThisMonth: tenantCounts.new_companies_this_month || 0,
        totalEmployees: userCounts.total_employees || 0,
        totalActiveUsers: userCounts.total_active_users || 0,
        newEmployeesThisMonth: userCounts.new_employees_this_month || 0,
    };
}

module.exports = { getDashboardKpis };
