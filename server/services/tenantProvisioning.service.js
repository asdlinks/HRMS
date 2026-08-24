const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { transaction, sql } = require('../db/sql');
const provisioningRepo = require('../repositories/provisioning.repository');
const subscriptionPlansRepo = require('../repositories/subscriptionPlans.repository');
const menuRepo = require('../repositories/menu.repository');
const { HttpError } = require('../middleware/errorHandler');
const { getEnv } = require('../config/env');

// Permission sets for the default roles every tenant gets — the *current*
// cumulative end-state of every role_permissions grant across all
// migrations, reproduced here as one final table since a brand-new tenant
// needs the end result, not a replay of every migration in order. As of
// Phase 10A (030_org_admin_core.sql): HR Administrator and Manager are
// tightened to their actual business responsibility (payroll processing,
// attendance-infrastructure config, and org/system-admin permissions moved
// out to Payroll Administrator / Attendance Administrator / Organization
// Administrator), and users.unlock joins users.password.reset's existing
// distribution (hr + super_admin only).
const ROLE_PERMISSIONS = {
    employee: [
        'leaves.view.own', 'leaves.apply.own', 'attendance.checkin',
        'users.view.directory', 'notifications.manage', 'voice.use',
        'leaves.notify_on_apply', 'payroll.view.own',
        'company.view', 'locations.view', 'holidays.view',
    ],
    manager: [
        'leaves.view.own', 'leaves.view.team', 'leaves.apply.own', 'leaves.approve', 'leaves.cancel.any',
        'attendance.checkin', 'attendance.view.team',
        'users.view.directory', 'users.view.team',
        'reports.view', 'notifications.manage', 'voice.use',
        'payroll.view.own', 'payroll.view.team', 'payroll.overtime.approve',
        'company.view', 'locations.view', 'holidays.view',
        'menu.view', 'roles.view',
        'attendance.settings.view',
        'general.settings.view',
    ],
    hr: [
        'leaves.view.own', 'leaves.view.all', 'leaves.apply.own', 'leaves.approve', 'leaves.cancel.any',
        'attendance.checkin', 'attendance.view.team',
        'users.view.directory', 'users.view.team', 'users.view.all', 'users.manage', 'users.password.reset', 'users.unlock',
        'users.pii.manage',
        'departments.manage', 'locations.manage', 'holidays.manage',
        'designations.manage', 'employment-types.manage',
        'reports.view', 'notifications.manage', 'voice.use',
        'leaves.notify_on_apply', 'announcements.manage',
        'payroll.view.own', 'payroll.view.all',
        'company.view', 'locations.view', 'holidays.view', 'shifts.view', 'payroll.settings.view',
        'menu.view', 'roles.view',
        'attendance.settings.view',
        'general.settings.view',
        'company-documents.view', 'company-documents.manage',
    ],
    payroll_admin: [
        'payroll.view.own', 'payroll.view.all', 'payroll.settings.view', 'payroll.settings.manage',
        'payroll.components.manage', 'payroll.structures.manage', 'payroll.assign', 'payroll.process', 'payroll.approve',
        'payroll.overtime.apply', 'payroll.overtime.approve', 'salary-grades.manage', 'users.pii.manage',
        'reports.view', 'company.view', 'locations.view', 'holidays.view', 'users.view.directory',
    ],
    attendance_admin: [
        'attendance.checkin', 'attendance.view.team',
        'shifts.view', 'shifts.manage', 'attendance.policy.manage', 'attendance.device.manage', 'attendance.face.enroll',
        'attendance.settings.view', 'attendance.settings.manage', 'work-modes.manage',
        'reports.view', 'company.view', 'locations.view', 'holidays.view', 'users.view.directory',
    ],
    super_admin: [
        'leaves.view.own', 'leaves.view.team', 'leaves.view.all', 'leaves.apply.own', 'leaves.apply.any',
        'leaves.approve', 'leaves.cancel.any',
        'attendance.checkin', 'attendance.view.team',
        'users.view.directory', 'users.view.team', 'users.view.all', 'users.manage', 'users.password.reset', 'users.unlock',
        'users.pii.manage',
        'departments.manage', 'locations.manage', 'holidays.manage',
        'designations.manage', 'employment-types.manage',
        'settings.manage', 'reports.view', 'notifications.manage', 'voice.use',
        'announcements.manage',
        'payroll.view.own', 'payroll.settings.manage', 'payroll.components.manage', 'payroll.structures.manage',
        'payroll.assign', 'payroll.process', 'payroll.approve', 'payroll.overtime.apply',
        'payroll.overtime.approve', 'payroll.view.all',
        'attendance.policy.manage', 'attendance.device.manage', 'attendance.face.enroll',
        'company.manage', 'shifts.manage', 'work-modes.manage', 'salary-grades.manage',
        'company.view', 'locations.view', 'holidays.view', 'shifts.view', 'payroll.settings.view',
        'menu.view', 'menu.manage', 'roles.view', 'roles.manage',
        'attendance.settings.view', 'attendance.settings.manage',
        'general.settings.view', 'general.settings.manage',
        'company-documents.view', 'company-documents.manage',
    ],
};

const ROLE_NAMES = {
    employee: 'Employee',
    manager: 'Manager',
    hr: 'HR Administrator',
    payroll_admin: 'Payroll Administrator',
    attendance_admin: 'Attendance Administrator',
    super_admin: 'Organization Administrator',
};

// "Simple Organization" template (Part 2 of the Phase 10 spec) — the 4 core
// roles. "Enterprise Organization" adds Payroll/Attendance Administrator as
// dedicated roles instead of folding their responsibilities into HR/Org
// Admin. Only `super_admin` is marked is_system (non-deletable) — every
// other default is a starting template a customer may freely edit or delete.
const SIMPLE_ROLE_CODES = ['employee', 'manager', 'hr', 'super_admin'];
const ENTERPRISE_ROLE_CODES = [...SIMPLE_ROLE_CODES, 'payroll_admin', 'attendance_admin'];

// Reproduces the current end-state of menu_items (spread across
// 006_menu_items.sql, 021_menu_items_hierarchy.sql, 022_shifts.sql,
// 023_work_modes.sql, 024_salary_grades.sql) as one consolidated tree, since
// a brand-new tenant needs it in its final shape, not replayed migration by
// migration.
const MENU_TREE = [
    { name: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard', module: 'dashboard', sort_order: 0 },
    {
        name: 'Time & Leave', path: '/attendance', icon: 'ClipboardList', module: 'time', sort_order: 10,
        children: [
            { name: 'Leaves', path: '/leaves', icon: 'CalendarClock', module: 'time', sort_order: 40 },
            { name: 'Leave Cancellation', path: '/cancellation', icon: 'XSquare', module: 'time', sort_order: 50 },
            { name: 'Holiday Calendar', path: '/holidays', icon: 'CalendarDays', module: 'time', sort_order: 60 },
            { name: 'Attendance Policies', path: '/attendance/policies', icon: 'ShieldCheck', module: 'time', permission: 'attendance.policy.manage', sort_order: 65 },
            { name: 'Kiosk Devices', path: '/attendance/kiosk-devices', icon: 'MonitorSmartphone', module: 'time', permission: 'attendance.device.manage', sort_order: 66 },
            { name: 'Face Enrollment', path: '/attendance/face-enrollment', icon: 'ScanFace', module: 'time', permission: 'attendance.face.enroll', sort_order: 67 },
            { name: 'Shifts', path: '/shifts', icon: 'Clock9', module: 'time', any_permission: 'shifts.view,shifts.manage', sort_order: 68 },
        ],
    },
    {
        name: 'Employees', path: '/employees', icon: 'Users', module: 'people', any_permission: 'users.view.team,users.view.all', sort_order: 20,
        children: [
            { name: 'Department', path: '/department', icon: 'Building2', module: 'people', permission: 'departments.manage', sort_order: 30 },
            {
                name: 'Organization Structure', path: '/organization', icon: 'Network', module: 'people',
                any_permission: 'designations.manage,employment-types.manage', sort_order: 35,
            },
            { name: 'My Team', path: '/my-team', icon: 'Users', module: 'people', sort_order: 70 },
        ],
    },
    { name: 'Reports', path: '/reports', icon: 'FileText', module: 'reports', permission: 'reports.view', sort_order: 80 },
    {
        name: 'Payroll', path: '/payroll', icon: 'Wallet', module: 'payroll', any_permission: 'payroll.view.own,payroll.view.team,payroll.view.all', sort_order: 90,
        children: [
            { name: 'Salary Components', path: '/payroll/components', icon: 'ListChecks', module: 'payroll', permission: 'payroll.components.manage', sort_order: 91 },
            { name: 'Salary Structures', path: '/payroll/structures', icon: 'FileStack', module: 'payroll', permission: 'payroll.structures.manage', sort_order: 92 },
            // Config screen most SMB admins touch once and forget — kept out of the
            // always-visible Payroll list (is_active: false) and surfaced instead as
            // a Settings > Advanced link (SettingsPage.tsx); route/permission unchanged.
            { name: 'Salary Grades', path: '/payroll/grades', icon: 'Layers', module: 'payroll', permission: 'salary-grades.manage', sort_order: 89, is_active: false },
            { name: 'Employee Assignments', path: '/payroll/assignments', icon: 'UserCog', module: 'payroll', permission: 'payroll.assign', sort_order: 93 },
            { name: 'Payroll Runs', path: '/payroll/runs', icon: 'Banknote', module: 'payroll', any_permission: 'payroll.process,payroll.approve', sort_order: 94 },
            { name: 'Overtime', path: '/payroll/overtime', icon: 'Clock', module: 'payroll', any_permission: 'payroll.overtime.apply,payroll.overtime.approve,payroll.view.own', sort_order: 95 },
            { name: 'Payslips', path: '/payroll/payslips', icon: 'Receipt', module: 'payroll', any_permission: 'payroll.view.own,payroll.view.team,payroll.view.all', sort_order: 96 },
            { name: 'Reports', path: '/payroll/reports', icon: 'BarChart3', module: 'payroll', permission: 'payroll.view.all', sort_order: 97 },
            { name: 'Settings', path: '/payroll/settings', icon: 'Settings2', module: 'payroll', any_permission: 'payroll.settings.view,payroll.settings.manage', sort_order: 98 },
        ],
    },
    // Stub/coming-soon modules — disabled by default so a brand-new tenant's
    // nav isn't cluttered with dead ends; an admin turns one on from
    // Settings > Advanced > Menu Management when it's actually needed.
    { name: 'Recruitment', path: '/recruitment', icon: 'UserSearch', module: 'recruitment', permission: 'settings.manage', sort_order: 100, is_placeholder: true, is_feature_enabled: false },
    { name: 'Performance', path: '/performance', icon: 'Target', module: 'performance', permission: 'settings.manage', sort_order: 110, is_placeholder: true, is_feature_enabled: false },
    { name: 'Assets', path: '/assets', icon: 'Boxes', module: 'assets', permission: 'settings.manage', sort_order: 120, is_placeholder: true, is_feature_enabled: false },
    // Visible to everyone (no permission) — employees need this for shared/company
    // documents, so it's a top-level peer of Payroll/Reports rather than a Settings
    // child (which employees have no other reason to open).
    { name: 'Documents', path: '/company-documents', icon: 'FolderOpen', module: 'company-documents', sort_order: 125 },
    // No `children`: Settings is a direct-nav leaf. Work Modes/Payroll Settings/
    // Salary Grades/Audit are reachable via the Settings page's own grouped
    // sidebar (SettingsPage.tsx) instead of a second, ContextSidebar-driven layer.
    { name: 'Settings', path: '/settings', icon: 'Settings', module: 'settings', sort_order: 130 },
];

// From 016_attendance_policies.sql — the 4 policy examples every existing
// tenant already has.
const ATTENDANCE_POLICIES = [
    { name: 'Office Only', policy_type: 'OfficeOnly', allowed_methods: ['Face'], config: null },
    { name: 'Hybrid', policy_type: 'Hybrid', allowed_methods: ['Face', 'WFH', 'ClientVisit', 'FieldWork'], config: null },
    { name: 'Remote', policy_type: 'Remote', allowed_methods: ['WFH'], config: null },
    { name: 'Field Staff', policy_type: 'FieldStaff', allowed_methods: ['FieldWork', 'ClientVisit'], config: { geofence_radius_meters: 200 } },
];

// From 023_work_modes.sql.
const WORK_MODES = [
    { code: 'Office', name: 'Office', description: 'Working from a company office location', sort_order: 0 },
    { code: 'WFH', name: 'Work From Home', description: 'Remote work from home', sort_order: 10 },
    { code: 'Hybrid', name: 'Hybrid', description: 'Split between office and remote days', sort_order: 20 },
    { code: 'ClientVisit', name: 'Client Visit', description: 'On-site at a client location', sort_order: 30 },
    { code: 'FieldWork', name: 'Field Work', description: 'Field/on-location work with no fixed site', sort_order: 40 },
];

// No existing seed template for shifts/salary grades (022_shifts.sql /
// 024_salary_grades.sql only create the tables) — these are new, minimal,
// illustrative defaults, not derived from any product spec.
const DEFAULT_SHIFT = {
    name: 'General Shift', shift_type: 'General', start_time: '09:00:00', end_time: '18:00:00',
    expected_work_minutes: 480, grace_period_minutes: 10, break_type: 'unpaid_duration', break_duration_minutes: 60,
};

// From 031_org_structure.sql — the same defaults every existing tenant got
// seeded. Designations are org-specific and deliberately NOT seeded here,
// same as for existing tenants.
const DEFAULT_EMPLOYMENT_TYPES = [
    { name: 'Full-Time', code: 'FT' },
    { name: 'Part-Time', code: 'PT' },
    { name: 'Contract', code: 'CON' },
    { name: 'Intern', code: 'INT' },
    { name: 'Consultant', code: 'CNS' },
];

const DEFAULT_SALARY_GRADES = [
    { code: 'L1', name: 'Junior', min_amount: 300000, mid_amount: 400000, max_amount: 500000 },
    { code: 'L2', name: 'Mid', min_amount: 500000, mid_amount: 700000, max_amount: 900000 },
    { code: 'L3', name: 'Senior', min_amount: 900000, mid_amount: 1200000, max_amount: 1500000 },
];

// From SettingsPage.tsx's own client-side fallback defaults, so a freshly
// provisioned tenant lands on the same values an existing tenant sees before
// it has ever saved Settings.
const DEFAULT_LEAVE_ALLOCATIONS = [
    { type: 'casual', days: 10 },
    { type: 'sick', days: 5 },
    { type: 'paid', days: 15 },
];
// required_for_roles (Phase 12B) — every role except super_admin (Organization
// Administrator) participates in attendance by default; an org can opt the
// Organization Administrator in via Settings > Attendance Rules.
const DEFAULT_ATTENDANCE_RULES = {
    weekly_off_days: [0],
    nth_saturdays_off: [2],
    required_for_roles: ['employee', 'manager', 'hr', 'payroll_admin', 'attendance_admin'],
};

function generateInitialPassword() {
    // High-entropy random core (12 chars from a URL-safe alphabet) plus a
    // fixed suffix guaranteeing upper/lower/digit/symbol diversity for any
    // password-strength UI — this is a one-time credential shown once and
    // meant to be changed on first login, not a long-lived password.
    return `${crypto.randomBytes(9).toString('base64url')}!Aa1`;
}

// Currency/date format/financial year are no longer collected at creation
// (Phase 13E, Part 9) — every new tenant gets these same defaults, and its
// own Organization Administrator configures them afterward via the existing
// self-service PUT /company. `status` defaults to 'trial' but a Platform
// Admin can provision straight to 'active' (e.g. an already-paid customer).
async function createTenantRow(tx, input) {
    const result = await tx.run(
        `INSERT INTO tenants (name, slug, status, timezone, currency, date_format, financial_year_start_month, billing_email, phone, subscription_plan_id)
         OUTPUT INSERTED.id
         VALUES (@name, @slug, @status, @timezone, @currency, @dateFormat, @fyStartMonth, @billingEmail, @phone, @subscriptionPlanId)`,
        {
            name: { type: sql.NVarChar(255), value: input.name },
            slug: { type: sql.NVarChar(100), value: input.slug },
            status: { type: sql.NVarChar(20), value: input.status || 'trial' },
            timezone: { type: sql.NVarChar(50), value: input.timezone || 'UTC' },
            currency: { type: sql.NVarChar(10), value: 'INR' },
            dateFormat: { type: sql.NVarChar(20), value: 'DD/MM/YYYY' },
            fyStartMonth: { type: sql.Int, value: 4 },
            billingEmail: { type: sql.NVarChar(255), value: input.billing_email || null },
            phone: { type: sql.NVarChar(30), value: input.phone },
            subscriptionPlanId: { type: sql.Int, value: input.subscription_plan_id },
        }
    );
    return result.recordset[0].id;
}

async function seedRolesAndPermissions(tx, tenantId, roleTemplate) {
    const permissions = await tx.many('SELECT id, code FROM permissions');
    const permissionIdByCode = new Map(permissions.map((p) => [p.code, p.id]));
    const roleCodes = roleTemplate === 'simple' ? SIMPLE_ROLE_CODES : ENTERPRISE_ROLE_CODES;

    const roleIdByCode = {};
    for (const roleCode of roleCodes) {
        const inserted = await tx.run(
            `INSERT INTO roles (tenant_id, code, name, is_system) OUTPUT INSERTED.id VALUES (@tenantId, @code, @name, @isSystem)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                code: { type: sql.NVarChar(50), value: roleCode },
                name: { type: sql.NVarChar(100), value: ROLE_NAMES[roleCode] },
                isSystem: { type: sql.Bit, value: roleCode === 'super_admin' ? 1 : 0 },
            }
        );
        const roleId = inserted.recordset[0].id;
        roleIdByCode[roleCode] = roleId;

        for (const code of ROLE_PERMISSIONS[roleCode]) {
            const permissionId = permissionIdByCode.get(code);
            if (!permissionId) continue; // tolerate a permission catalogue that hasn't caught up yet, same as 005's seed script
            await tx.run('INSERT INTO role_permissions (role_id, permission_id) VALUES (@roleId, @permissionId)', {
                roleId: { type: sql.Int, value: roleId },
                permissionId: { type: sql.Int, value: permissionId },
            });
        }
    }
    return roleIdByCode;
}

async function insertMenuItem(tx, tenantId, parentId, item) {
    const result = await tx.run(
        `INSERT INTO menu_items (tenant_id, parent_id, name, path, icon, module, permission, any_permission, sort_order, is_active, is_placeholder, is_feature_enabled)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @parentId, @name, @path, @icon, @module, @permission, @anyPermission, @sortOrder, @isActive, @isPlaceholder, @isFeatureEnabled)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            parentId: { type: sql.Int, value: parentId },
            name: { type: sql.NVarChar(100), value: item.name },
            path: { type: sql.NVarChar(200), value: item.path },
            icon: { type: sql.NVarChar(50), value: item.icon },
            module: { type: sql.NVarChar(50), value: item.module || null },
            permission: { type: sql.NVarChar(100), value: item.permission || null },
            anyPermission: { type: sql.NVarChar(400), value: item.any_permission || null },
            sortOrder: { type: sql.Int, value: item.sort_order },
            isActive: { type: sql.Bit, value: item.is_active === false ? 0 : 1 },
            isPlaceholder: { type: sql.Bit, value: item.is_placeholder ? 1 : 0 },
            isFeatureEnabled: { type: sql.Bit, value: item.is_feature_enabled === false ? 0 : 1 },
        }
    );
    return result.recordset[0].id;
}

async function seedNavigation(tx, tenantId) {
    for (const parent of MENU_TREE) {
        const parentId = await insertMenuItem(tx, tenantId, null, parent);
        for (const child of parent.children || []) {
            await insertMenuItem(tx, tenantId, parentId, child);
        }
    }
}

async function seedAttendancePolicies(tx, tenantId) {
    for (const p of ATTENDANCE_POLICIES) {
        await tx.run(
            `INSERT INTO attendance_policies (tenant_id, name, policy_type, allowed_methods, config)
             VALUES (@tenantId, @name, @policyType, @allowedMethods, @config)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                name: { type: sql.NVarChar(150), value: p.name },
                policyType: { type: sql.NVarChar(20), value: p.policy_type },
                allowedMethods: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(p.allowed_methods) },
                config: { type: sql.NVarChar(sql.MAX), value: p.config ? JSON.stringify(p.config) : null },
            }
        );
    }
}

async function seedWorkModes(tx, tenantId) {
    for (const wm of WORK_MODES) {
        await tx.run(
            `INSERT INTO work_modes (tenant_id, code, name, description, sort_order)
             VALUES (@tenantId, @code, @name, @description, @sortOrder)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                code: { type: sql.NVarChar(30), value: wm.code },
                name: { type: sql.NVarChar(100), value: wm.name },
                description: { type: sql.NVarChar(255), value: wm.description },
                sortOrder: { type: sql.Int, value: wm.sort_order },
            }
        );
    }
}

async function seedShiftDefaults(tx, tenantId) {
    await tx.run(
        `INSERT INTO shifts (tenant_id, name, shift_type, start_time, end_time, expected_work_minutes, grace_period_minutes, break_type, break_duration_minutes)
         VALUES (@tenantId, @name, @shiftType, @startTime, @endTime, @expectedWorkMinutes, @gracePeriodMinutes, @breakType, @breakDurationMinutes)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            name: { type: sql.NVarChar(150), value: DEFAULT_SHIFT.name },
            shiftType: { type: sql.NVarChar(20), value: DEFAULT_SHIFT.shift_type },
            startTime: { type: sql.VarChar(8), value: DEFAULT_SHIFT.start_time },
            endTime: { type: sql.VarChar(8), value: DEFAULT_SHIFT.end_time },
            expectedWorkMinutes: { type: sql.Int, value: DEFAULT_SHIFT.expected_work_minutes },
            gracePeriodMinutes: { type: sql.Int, value: DEFAULT_SHIFT.grace_period_minutes },
            breakType: { type: sql.NVarChar(20), value: DEFAULT_SHIFT.break_type },
            breakDurationMinutes: { type: sql.Int, value: DEFAULT_SHIFT.break_duration_minutes },
        }
    );
}

async function seedOrgStructureDefaults(tx, tenantId) {
    for (const et of DEFAULT_EMPLOYMENT_TYPES) {
        await tx.run(
            `INSERT INTO employment_types (tenant_id, name, code) VALUES (@tenantId, @name, @code)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                name: { type: sql.NVarChar(150), value: et.name },
                code: { type: sql.NVarChar(20), value: et.code },
            }
        );
    }
}

async function seedSalaryGrades(tx, tenantId) {
    for (const g of DEFAULT_SALARY_GRADES) {
        await tx.run(
            `INSERT INTO salary_grades (tenant_id, code, name, min_amount, mid_amount, max_amount)
             VALUES (@tenantId, @code, @name, @minAmount, @midAmount, @maxAmount)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                code: { type: sql.NVarChar(50), value: g.code },
                name: { type: sql.NVarChar(150), value: g.name },
                minAmount: { type: sql.Decimal(18, 2), value: g.min_amount },
                midAmount: { type: sql.Decimal(18, 2), value: g.mid_amount },
                maxAmount: { type: sql.Decimal(18, 2), value: g.max_amount },
            }
        );
    }
}

// Same single kiosk deployment for every tenant — see config/env.js's
// kioskAppUrl comment. Skipped entirely (tenant just gets no row, same as
// today) when KIOSK_APP_URL isn't configured on this server.
async function seedKioskAppConfig(tx, tenantId) {
    const { kioskAppUrl } = getEnv();
    if (!kioskAppUrl) return;
    await tx.run('INSERT INTO kiosk_app_config (tenant_id, kiosk_app_url) VALUES (@tenantId, @kioskAppUrl)', {
        tenantId: { type: sql.Int, value: tenantId },
        kioskAppUrl: { type: sql.NVarChar(500), value: kioskAppUrl },
    });
}

async function upsertSetting(tx, tenantId, key, value) {
    await tx.run(
        `INSERT INTO settings (tenant_id, [key], value) VALUES (@tenantId, @key, @value)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            key: { type: sql.NVarChar(100), value: key },
            value: { type: sql.NVarChar(sql.MAX), value: typeof value === 'string' ? value : JSON.stringify(value) },
        }
    );
}

// Mirrors 013_payroll_menu_and_settings.sql's default payroll_settings JSON,
// but with currency/financial_year_start_month taken from the create-company
// input so this stays consistent with the tenants row itself.
async function seedPayrollSettings(tx, tenantId, input) {
    await upsertSetting(tx, tenantId, 'payroll_settings', {
        pay_cycle_day: 1,
        financial_year_start_month: input.financial_year_start_month || 4,
        currency: input.currency || 'INR',
        ot_rate_multiplier: 1.5,
        ot_hourly_base_component_code: null,
        standard_monthly_hours: 208,
        rounding_rule: 'nearest_1',
    });
}

// The three generic `settings` keys SettingsPage.tsx reads today beyond
// payroll_settings (leave allocations, attendance rules, the external
// attendance link) — "company settings" per the provisioning requirement.
async function seedCompanySettings(tx, tenantId) {
    await upsertSetting(tx, tenantId, 'leave_allocations', DEFAULT_LEAVE_ALLOCATIONS);
    await upsertSetting(tx, tenantId, 'attendance_rules', DEFAULT_ATTENDANCE_RULES);
    await upsertSetting(tx, tenantId, 'attendance_link', '');
}

// The Platform Administrator provisions the company and creates its first
// Organization Administrator — the tenant's own root/owner account, not an
// HR-specific one. `role` here is the legacy pre-RBAC column (still used to
// exclude this account from regular employee-directory listings elsewhere,
// same as every existing tenant's super_admin); real permissions come from
// the user_roles grant below.
async function createFirstAdminUser(tx, tenantId, input, passwordHash) {
    const result = await tx.run(
        `INSERT INTO users (tenant_id, name, email, password, role, designation, joining_date)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @name, @email, @password, 'super_admin', @designation, CAST(SYSUTCDATETIME() AS DATE))`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            name: { type: sql.NVarChar(255), value: input.adminName },
            email: { type: sql.NVarChar(255), value: input.adminEmail },
            password: { type: sql.NVarChar(255), value: passwordHash },
            designation: { type: sql.NVarChar(255), value: 'Organization Administrator' },
        }
    );
    return result.recordset[0].id;
}

function step(name, status, detail) {
    return { step: name, status, ...(detail ? { detail } : {}) };
}

// Provisions a brand-new company end to end, in one DB transaction — any
// step throwing (duplicate slug, bad FK, etc.) propagates to db/sql.js's
// transaction(), which rolls back everything already written before
// rethrowing. `steps` is accumulated in memory (not written to the DB until
// after the transaction settles), so it accurately reflects exactly which
// step failed even though the rows it describes were undone.
async function provisionCompany(input, platformAdminId) {
    const plan = await subscriptionPlansRepo.getPlan(input.subscription_plan_id);
    if (!plan || !plan.is_active) throw new HttpError(400, 'Select a valid, active subscription plan');

    const steps = [];
    const startedAt = new Date();
    let tenantId = null;
    let adminUserId = null;
    let generatedPassword = null;

    try {
        await transaction(async (tx) => {
            tenantId = await createTenantRow(tx, input);
            steps.push(step('create_tenant', 'success', { tenantId }));

            const roleIdByCode = await seedRolesAndPermissions(tx, tenantId, input.roleTemplate);
            steps.push(step('seed_roles_permissions', 'success'));

            await seedNavigation(tx, tenantId);
            steps.push(step('seed_navigation', 'success'));

            await menuRepo.applyPlanModules(tenantId, plan.enabled_modules, tx.run);
            steps.push(step('apply_subscription_plan_modules', 'success'));

            await seedAttendancePolicies(tx, tenantId);
            steps.push(step('seed_attendance_policies', 'success'));

            await seedWorkModes(tx, tenantId);
            steps.push(step('seed_work_modes', 'success'));

            await seedShiftDefaults(tx, tenantId);
            steps.push(step('seed_shift_defaults', 'success'));

            await seedSalaryGrades(tx, tenantId);
            steps.push(step('seed_salary_grades', 'success'));

            await seedOrgStructureDefaults(tx, tenantId);
            steps.push(step('seed_org_structure_defaults', 'success'));

            await seedPayrollSettings(tx, tenantId, input);
            steps.push(step('seed_payroll_settings', 'success'));

            await seedCompanySettings(tx, tenantId);
            steps.push(step('seed_company_settings', 'success'));

            await seedKioskAppConfig(tx, tenantId);
            steps.push(step('seed_kiosk_app_config', 'success'));

            generatedPassword = generateInitialPassword();
            const passwordHash = await bcrypt.hash(generatedPassword, 10);
            adminUserId = await createFirstAdminUser(tx, tenantId, input, passwordHash);
            steps.push(step('create_admin_user', 'success', { adminUserId })); // never the password itself

            await tx.run('INSERT INTO user_roles (user_id, role_id) VALUES (@userId, @roleId)', {
                userId: { type: sql.Int, value: adminUserId },
                roleId: { type: sql.Int, value: roleIdByCode.super_admin },
            });
            steps.push(step('assign_admin_role', 'success'));

            await tx.run('UPDATE tenants SET primary_admin_user_id = @adminUserId WHERE id = @tenantId', {
                adminUserId: { type: sql.Int, value: adminUserId },
                tenantId: { type: sql.Int, value: tenantId },
            });
            steps.push(step('link_primary_admin', 'success'));
        });

        await provisioningRepo.writeProvisioningLog({
            tenantId,
            requestedCompanyName: input.name,
            requestedSlug: input.slug,
            platformAdminId,
            status: 'success',
            steps,
            startedAt,
            finishedAt: new Date(),
        });

        return { tenantId, adminUserId, adminEmail: input.adminEmail, generatedPassword };
    } catch (err) {
        steps.push(step('FAILED', 'failed', { message: err.message }));
        await provisioningRepo.writeProvisioningLog({
            tenantId,
            requestedCompanyName: input.name,
            requestedSlug: input.slug,
            platformAdminId,
            status: 'failed',
            steps,
            errorMessage: err.message,
            startedAt,
            finishedAt: new Date(),
        });
        throw err;
    }
}

module.exports = { provisionCompany };
