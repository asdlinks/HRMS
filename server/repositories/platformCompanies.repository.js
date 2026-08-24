const { one, many, run, sql } = require('../db/sql');
const menuRepo = require('./menu.repository');

// Qualified with t. — getCompanyById joins the users table twice (uc/admin),
// both of which also have created_at/updated_at columns, so an unqualified
// name here is ambiguous the moment that join is present. subscription_plan_*
// columns come from the joined catalog row (Phase 13E) — plan/seat_limit/
// license_type/feature_package (the old unenforced, overlapping fields) are
// gone; renewal_date/expiry_date/payment_status are a separate billing-
// lifecycle concept the spec never asked to remove, so those stay.
const PROFILE_COLUMNS = `t.id, t.name, t.slug, t.status, t.subscription_plan_id, t.billing_email, t.timezone, t.logo_url,
    t.address_line1, t.address_line2, t.city, t.state, t.country, t.postal_code, t.phone, t.contact_email, t.website,
    t.currency, t.date_format, t.financial_year_start_month, t.theme_primary_color, t.theme_secondary_color,
    t.renewal_date, t.expiry_date, t.payment_status,
    t.primary_admin_user_id, t.created_at, t.updated_at,
    sp.name as subscription_plan_name, sp.max_employees, sp.storage_limit_mb, sp.enabled_modules as subscription_enabled_modules`;

// Employee/active-user counts and last-login are aggregated from `users` at
// query time rather than denormalized onto `tenants` — these are the only
// per-company numbers Platform Admin is allowed to see (Part 10: counts and
// timestamps only, never row-level HR data). Primary admin's org admin name
// is joined in separately (getPrimaryAdmin already exists for this).
const LIST_COLUMNS = `t.id, t.name, t.slug, t.status, t.subscription_plan_id, t.billing_email, t.timezone,
    t.currency, t.phone, t.contact_email, t.created_at,
    sp.name as subscription_plan_name, sp.max_employees,
    admin.name AS org_admin_name,
    ISNULL(uc.employee_count, 0) AS employee_count,
    ISNULL(uc.active_user_count, 0) AS active_user_count,
    uc.last_login_at`;

const USER_COUNTS_JOIN = `LEFT JOIN (
        SELECT tenant_id, COUNT(*) AS employee_count,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_user_count,
            MAX(last_login_at) AS last_login_at
        FROM users
        GROUP BY tenant_id
    ) uc ON uc.tenant_id = t.id
    LEFT JOIN users admin ON admin.id = t.primary_admin_user_id
    LEFT JOIN subscription_plans sp ON sp.id = t.subscription_plan_id`;

// search matches name or slug (case-insensitive via LIKE); status is an
// exact filter. OFFSET/FETCH requires an ORDER BY, hence the fixed sort.
async function listCompanies({ search, status, page = 1, pageSize = 20 } = {}) {
    const conditions = [];
    const params = {
        offset: { type: sql.Int, value: (page - 1) * pageSize },
        pageSize: { type: sql.Int, value: pageSize },
    };

    if (search) {
        conditions.push('(t.name LIKE @search OR t.slug LIKE @search)');
        params.search = { type: sql.NVarChar(255), value: `%${search}%` };
    }
    if (status) {
        conditions.push('t.status = @status');
        params.status = { type: sql.NVarChar(20), value: status };
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countRow] = await Promise.all([
        many(
            `SELECT ${LIST_COLUMNS} FROM tenants t ${USER_COUNTS_JOIN} ${where}
             ORDER BY t.created_at DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
            params
        ),
        one(`SELECT COUNT(*) as total FROM tenants t ${where}`, params),
    ]);

    return { items: rows, total: countRow.total, page, pageSize };
}

// subscription_enabled_modules comes back as a raw JSON string column —
// parsed here so every caller gets a real array, same precedent as
// subscriptionPlans.repository.js's own parsePlan.
function parseCompany(row) {
    if (!row) return row;
    return {
        ...row,
        subscription_enabled_modules: row.subscription_enabled_modules ? JSON.parse(row.subscription_enabled_modules) : [],
    };
}

async function getCompanyById(tenantId) {
    const row = await one(
        `SELECT ${PROFILE_COLUMNS},
            ISNULL(uc.employee_count, 0) AS employee_count,
            ISNULL(uc.active_user_count, 0) AS active_user_count,
            uc.last_login_at
         FROM tenants t ${USER_COUNTS_JOIN}
         WHERE t.id = @tenantId`,
        { tenantId: { type: sql.Int, value: tenantId } }
    );
    return parseCompany(row);
}

function getCompanyBySlug(slug) {
    return one('SELECT id FROM tenants WHERE slug = @slug', {
        slug: { type: sql.NVarChar(100), value: slug },
    });
}

// Same field set as company.repository.js's updateCompanyProfile
// (companyProfileUpdateSchema), just addressed by an explicit tenantId
// rather than trusting req.auth.tenantId — the platform-admin variant of
// "Edit Company" can target any tenant, not just the caller's own.
function updateCompany(tenantId, data) {
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

// Assigns a Subscription Plan to a company (Phase 13E) — replaces the old
// "(Preview)" updateSubscription (free-text plan/seat_limit/license_type/
// feature_package with nothing behind them). Re-applies the plan's
// enabled_modules to the tenant's menu_items in the same call, so "changing
// a company's subscription automatically updates ... Available Modules"
// (Part 8) holds for existing tenants exactly like it does at provisioning.
async function assignSubscriptionPlan(tenantId, subscriptionPlanId, enabledModules) {
    await run(
        `UPDATE tenants SET subscription_plan_id = @subscriptionPlanId, updated_at = SYSUTCDATETIME() WHERE id = @tenantId`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            subscriptionPlanId: { type: sql.Int, value: subscriptionPlanId },
        }
    );
    await menuRepo.applyPlanModules(tenantId, enabledModules);
}

function setStatus(tenantId, status) {
    return run('UPDATE tenants SET status = @status, updated_at = SYSUTCDATETIME() WHERE id = @tenantId', {
        tenantId: { type: sql.Int, value: tenantId },
        status: { type: sql.NVarChar(20), value: status },
    });
}

function getPrimaryAdmin(tenantId) {
    return one(
        `SELECT u.id, u.name, u.email
         FROM tenants t JOIN users u ON u.id = t.primary_admin_user_id
         WHERE t.id = @tenantId`,
        { tenantId: { type: sql.Int, value: tenantId } }
    );
}

module.exports = {
    listCompanies, getCompanyById, getCompanyBySlug, updateCompany, assignSubscriptionPlan, setStatus, getPrimaryAdmin,
};
