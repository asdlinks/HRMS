const { one, run, sql } = require('../db/sql');

// `[plan]` (free-text) was replaced by subscription_plan_id in Phase 13E —
// the tenant's own Company Profile now surfaces the real plan name/limits
// via a join, not a bare string.
const PROFILE_COLUMNS = `t.id, t.name, t.slug, t.status, t.timezone, t.logo_url, t.address_line1, t.address_line2,
    t.city, t.state, t.country, t.postal_code, t.phone, t.contact_email, t.website, t.currency, t.date_format,
    t.financial_year_start_month, t.theme_primary_color, t.theme_secondary_color,
    sp.name as subscription_plan_name, sp.max_employees, sp.storage_limit_mb,
    sp.enabled_modules as subscription_enabled_modules`;

async function getCompanyProfile(tenantId) {
    const row = await one(
        `SELECT ${PROFILE_COLUMNS} FROM tenants t LEFT JOIN subscription_plans sp ON sp.id = t.subscription_plan_id WHERE t.id = @tenantId`,
        { tenantId: { type: sql.Int, value: tenantId } }
    );
    if (!row) return row;
    return { ...row, subscription_enabled_modules: row.subscription_enabled_modules ? JSON.parse(row.subscription_enabled_modules) : [] };
}

function updateCompanyProfile(tenantId, data) {
    return run(
        `UPDATE tenants SET
            name = @name,
            logo_url = @logoUrl,
            address_line1 = @addressLine1,
            address_line2 = @addressLine2,
            city = @city,
            state = @state,
            country = @country,
            postal_code = @postalCode,
            phone = @phone,
            contact_email = @contactEmail,
            website = @website,
            currency = @currency,
            date_format = @dateFormat,
            financial_year_start_month = @financialYearStartMonth,
            theme_primary_color = @themePrimaryColor,
            theme_secondary_color = @themeSecondaryColor,
            updated_at = SYSUTCDATETIME()
         WHERE id = @tenantId`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            name: { type: sql.NVarChar(255), value: data.name },
            logoUrl: { type: sql.NVarChar(sql.MAX), value: data.logo_url ?? null },
            addressLine1: { type: sql.NVarChar(255), value: data.address_line1 ?? null },
            addressLine2: { type: sql.NVarChar(255), value: data.address_line2 ?? null },
            city: { type: sql.NVarChar(100), value: data.city ?? null },
            state: { type: sql.NVarChar(100), value: data.state ?? null },
            country: { type: sql.NVarChar(100), value: data.country ?? null },
            postalCode: { type: sql.NVarChar(20), value: data.postal_code ?? null },
            phone: { type: sql.NVarChar(30), value: data.phone ?? null },
            contactEmail: { type: sql.NVarChar(255), value: data.contact_email ?? null },
            website: { type: sql.NVarChar(255), value: data.website ?? null },
            currency: { type: sql.NVarChar(10), value: data.currency },
            dateFormat: { type: sql.NVarChar(20), value: data.date_format },
            financialYearStartMonth: { type: sql.Int, value: data.financial_year_start_month },
            themePrimaryColor: { type: sql.NVarChar(9), value: data.theme_primary_color ?? null },
            themeSecondaryColor: { type: sql.NVarChar(9), value: data.theme_secondary_color ?? null },
        }
    );
}

module.exports = { getCompanyProfile, updateCompanyProfile };
