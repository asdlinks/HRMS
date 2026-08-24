const { one, many, run, sql } = require('../db/sql');

// enabled_modules is stored as a JSON array (NVARCHAR(MAX)) — parsed here so
// every caller gets a real array, never a string to re-parse itself.
function parsePlan(row) {
    if (!row) return row;
    return { ...row, enabled_modules: JSON.parse(row.enabled_modules) };
}

async function listPlans(activeOnly = false) {
    const rows = await many(
        `SELECT * FROM subscription_plans ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY name`,
        {}
    );
    return rows.map(parsePlan);
}

async function getPlan(id) {
    const row = await one('SELECT * FROM subscription_plans WHERE id = @id', { id: { type: sql.Int, value: id } });
    return parsePlan(row);
}

// The plan currently assigned to a tenant — null if somehow unassigned
// (shouldn't happen post-044, every tenant is backfilled).
async function getPlanForTenant(tenantId) {
    const row = await one(
        `SELECT sp.* FROM subscription_plans sp
         JOIN tenants t ON t.subscription_plan_id = sp.id
         WHERE t.id = @tenantId`,
        { tenantId: { type: sql.Int, value: tenantId } }
    );
    return parsePlan(row);
}

async function createPlan(data) {
    const result = await run(
        `INSERT INTO subscription_plans
            (name, max_employees, storage_limit_mb, support_level, trial_days, enabled_modules, monthly_price, annual_price, is_active)
         OUTPUT INSERTED.id
         VALUES (@name, @maxEmployees, @storageLimitMb, @supportLevel, @trialDays, @enabledModules, @monthlyPrice, @annualPrice, @isActive)`,
        {
            name: { type: sql.NVarChar(100), value: data.name },
            maxEmployees: { type: sql.Int, value: data.max_employees ?? null },
            storageLimitMb: { type: sql.Int, value: data.storage_limit_mb ?? null },
            supportLevel: { type: sql.NVarChar(50), value: data.support_level ?? null },
            trialDays: { type: sql.Int, value: data.trial_days ?? null },
            enabledModules: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(data.enabled_modules || []) },
            monthlyPrice: { type: sql.Decimal(10, 2), value: data.monthly_price ?? null },
            annualPrice: { type: sql.Decimal(10, 2), value: data.annual_price ?? null },
            isActive: { type: sql.Bit, value: data.is_active ?? true },
        }
    );
    return result.recordset[0].id;
}

// No delete — tenants may already reference a plan; soft-disable via
// is_active instead so it drops out of the "assign to a company" picker
// without breaking anything already on it.
function updatePlan(id, data) {
    return run(
        `UPDATE subscription_plans SET
            name = @name, max_employees = @maxEmployees, storage_limit_mb = @storageLimitMb,
            support_level = @supportLevel, trial_days = @trialDays, enabled_modules = @enabledModules,
            monthly_price = @monthlyPrice, annual_price = @annualPrice, is_active = @isActive,
            updated_at = SYSUTCDATETIME()
         WHERE id = @id`,
        {
            id: { type: sql.Int, value: id },
            name: { type: sql.NVarChar(100), value: data.name },
            maxEmployees: { type: sql.Int, value: data.max_employees ?? null },
            storageLimitMb: { type: sql.Int, value: data.storage_limit_mb ?? null },
            supportLevel: { type: sql.NVarChar(50), value: data.support_level ?? null },
            trialDays: { type: sql.Int, value: data.trial_days ?? null },
            enabledModules: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(data.enabled_modules || []) },
            monthlyPrice: { type: sql.Decimal(10, 2), value: data.monthly_price ?? null },
            annualPrice: { type: sql.Decimal(10, 2), value: data.annual_price ?? null },
            isActive: { type: sql.Bit, value: data.is_active ?? true },
        }
    );
}

module.exports = { listPlans, getPlan, getPlanForTenant, createPlan, updatePlan };
