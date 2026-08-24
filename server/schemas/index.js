const { z } = require('zod');
const { GATEABLE_MODULES } = require('../utils/planModules');

// Request-body schemas for every mutating route. Kept in one file since each
// is small and route modules only need one or two of them — validateBody()
// (middleware/validate.js) applies these before a request reaches a
// repository, so repositories can keep trusting their inputs are shaped.

const leaveApplySchema = z.object({
    user_id: z.union([z.string(), z.number()]),
    type: z.string().min(1),
    start_date: z.string().min(1),
    end_date: z.string().min(1),
    reason: z.string().optional().nullable(),
    is_half_day: z.union([z.boolean(), z.number()]).optional(),
    half_day_session: z.string().optional().nullable(),
});

const leaveStatusUpdateSchema = z.object({
    // 'Pending' is deliberately not settable here — reverting a decided
    // leave back to Pending was never an intentional workflow through this
    // endpoint and would bypass every apply-time validation above.
    status: z.enum(['Approved', 'Rejected', 'Cancelled']),
    cancellation_reason: z.string().optional().nullable(),
});

// Aadhaar (12 digits) and PAN (5 letters, 4 digits, 1 letter — e.g.
// ABCDE1234F) formats are fixed by the issuing government bodies, so a
// regex is a real validation, not a guess at an internal convention.
const AADHAAR_PATTERN = /^\d{12}$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const userCreateSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.string().min(1),
    designation: z.string().optional().nullable(),
    department_id: z.union([z.string(), z.number()]).optional().nullable(),
    manager_id: z.union([z.string(), z.number()]).optional().nullable(),
    employee_id: z.string().optional().nullable(),
    probation_period: z.union([z.string(), z.number()]).optional().nullable(),
    joining_date: z.string().optional().nullable(),
    // Mandatory going forward (Phase 13A) — enforced here and in the form,
    // not as a DB NOT NULL constraint, since existing employee rows may
    // still have it blank.
    date_of_birth: z.string().min(1, 'Date of birth is required'),
    profile_photo: z.string().optional().nullable(),
    location_id: z.union([z.string(), z.number()]).optional().nullable(),
    designation_id: z.union([z.string(), z.number()]).optional().nullable(),
    employment_type_id: z.union([z.string(), z.number()]).optional().nullable(),
    aadhaar_number: z.union([z.string().regex(AADHAAR_PATTERN, 'Aadhaar must be 12 digits'), z.literal(''), z.null()]).optional(),
    pan_number: z.union([z.string().regex(PAN_PATTERN, 'Enter a valid PAN (e.g. ABCDE1234F)'), z.literal(''), z.null()]).optional(),
    roleId: z.union([z.string(), z.number()]).optional().nullable(),
}).passthrough();

// Deliberately excludes `role` — role changes must go through
// PUT /users/:id/roles (requires roles.manage), not this general-purpose
// edit endpoint. `.passthrough()` lets the client keep sending UI-echo
// fields (department_name, etc.) that the route already strips before this
// runs; the security boundary is `role`'s absence here plus its removal
// from users.repository.js's UPDATABLE_COLUMNS.
const userUpdateSchema = z.object({
    employee_id: z.string().optional().nullable(),
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    designation: z.string().optional().nullable(),
    department_id: z.union([z.string(), z.number()]).optional().nullable(),
    manager_id: z.union([z.string(), z.number()]).optional().nullable(),
    probation_period: z.union([z.string(), z.number()]).optional().nullable(),
    joining_date: z.string().optional().nullable(),
    date_of_birth: z.string().optional().nullable(),
    profile_photo: z.string().optional().nullable(),
    location_id: z.union([z.string(), z.number()]).optional().nullable(),
    designation_id: z.union([z.string(), z.number(), z.null()]).optional(),
    employment_type_id: z.union([z.string(), z.number(), z.null()]).optional(),
    probation_message_shown: z.union([z.boolean(), z.number()]).optional(),
}).passthrough();

// Aadhaar/PAN — deliberately its own schema/route (PATCH /users/:id/pii,
// gated by users.pii.manage), never folded into userUpdateSchema — same
// separation as userBankingUpdateSchema below: the general users.manage
// edit endpoint must never be able to touch these two fields.
const userPiiUpdateSchema = z.object({
    aadhaar_number: z.union([z.string().regex(AADHAAR_PATTERN, 'Aadhaar must be 12 digits'), z.literal(''), z.null()]).optional(),
    pan_number: z.union([z.string().regex(PAN_PATTERN, 'Enter a valid PAN (e.g. ABCDE1234F)'), z.literal(''), z.null()]).optional(),
});

const resetPasswordSchema = z.object({ password: z.string().min(6) });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) });

const settingsBulkSchema = z.record(z.string(), z.unknown());

const holidayCreateSchema = z.object({
    name: z.string().min(1),
    date: z.string().min(1),
    location_id: z.union([z.string(), z.number()]).optional().nullable(),
    location_ids: z.array(z.union([z.string(), z.number()])).optional(),
});

const nameOnlySchema = z.object({ name: z.string().min(1) });

// Shared shape for the flat org-structure lookup modules (designations,
// employment types, employee categories) — same fields as
// departments/locations plus an optional code/description/is_active.
const lookupSchema = z.object({
    name: z.string().min(1),
    code: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    is_active: z.union([z.boolean(), z.number()]).optional(),
});

// Locations/Branches — nameOnlySchema plus the address fields added in
// 031_org_structure.sql.
const branchSchema = z.object({
    name: z.string().min(1),
    code: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    is_active: z.union([z.boolean(), z.number()]).optional(),
});

const checkInSchema = z.object({ date: z.string().min(1) });

const roleCreateSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    cloneFromRoleId: z.union([z.string(), z.number()]).optional().nullable(),
});
const rolePermissionsSchema = z.object({ permissionCodes: z.array(z.string()) });
const userRolesAssignSchema = z.object({ roleIds: z.array(z.union([z.string(), z.number()])) });

const userStatusUpdateSchema = z.object({
    status: z.enum(['active', 'disabled', 'exited']),
    exit_date: z.string().optional().nullable(),
});

const menuItemSchema = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    parent_id: z.union([z.string(), z.number(), z.null()]).optional(),
    name: z.string().min(1),
    path: z.string().min(1),
    icon: z.string().min(1),
    module: z.string().optional().nullable(),
    permission: z.string().optional().nullable(),
    anyPermission: z.array(z.string()).optional(),
    sort_order: z.number().optional(),
    is_active: z.boolean().optional(),
    is_placeholder: z.boolean().optional(),
    is_feature_enabled: z.boolean().optional(),
});
const menuReplaceSchema = z.object({ items: z.array(menuItemSchema) });

const announcementCreateSchema = z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1),
});

// ---------------- payroll ----------------

const payrollComponentSchema = z.object({
    code: z.string().min(1).max(50),
    name: z.string().min(1).max(150),
    component_type: z.enum(['earning', 'deduction']),
    calculation_type: z.enum(['fixed', 'percent_ctc', 'percent_gross', 'percent_of_component', 'slab']),
    value: z.union([z.string(), z.number()]).optional().nullable(),
    base_component_id: z.union([z.string(), z.number()]).optional().nullable(),
    config: z.record(z.string(), z.unknown()).optional().nullable(),
    is_prorated_on_lop: z.boolean().optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().optional(),
});

const payrollStructureSchema = z.object({
    name: z.string().min(1).max(150),
    description: z.string().optional().nullable(),
    is_active: z.boolean().optional(),
    grade_id: z.union([z.string(), z.number()]).optional().nullable(),
});

const structureComponentsReplaceSchema = z.object({
    items: z.array(z.object({
        component_id: z.union([z.string(), z.number()]),
        override_value: z.union([z.string(), z.number()]).optional().nullable(),
        sort_order: z.number().optional(),
    })),
});

const payrollAssignmentSchema = z.object({
    user_id: z.union([z.string(), z.number()]),
    structure_id: z.union([z.string(), z.number()]),
    grade_id: z.union([z.string(), z.number()]).optional().nullable(),
    ctc_annual: z.union([z.string(), z.number()]),
    effective_from: z.string().min(1),
});

// Banking Information (Phase 13B) — lives on Employee Master now, not the
// salary assignment; its own schema/route (PATCH /users/:id/banking, gated
// by payroll.assign — the same permission that always gated bank details),
// kept out of userUpdateSchema so the general users.manage edit endpoint
// can never touch it. Entry is deliberately progressive (all optional) —
// completeness is enforced only at payroll-processing time, not at save
// time (see payrollCalculation.service.js).
const userBankingUpdateSchema = z.object({
    bank_account_holder_name: z.string().optional().nullable(),
    bank_name: z.string().optional().nullable(),
    bank_branch: z.string().optional().nullable(),
    bank_account_number: z.string().optional().nullable(),
    bank_ifsc_code: z.string().optional().nullable(),
    bank_upi_id: z.string().optional().nullable(),
});

const payrollRunCreateSchema = z.object({
    period_year: z.union([z.string(), z.number()]),
    period_month: z.union([z.string(), z.number()]),
});

const overtimeEntrySchema = z.object({
    user_id: z.union([z.string(), z.number()]),
    work_date: z.string().min(1),
    hours: z.union([z.string(), z.number()]),
    reason: z.string().optional().nullable(),
});

const overtimeStatusSchema = z.object({
    status: z.enum(['Approved', 'Rejected']),
    rejection_reason: z.string().optional().nullable(),
});

// ---------------- face recognition attendance (Phase 6) ----------------

const ATTENDANCE_METHODS = ['Face', 'WFH', 'ClientVisit', 'FieldWork', 'Manual', 'Biometric', 'QRCode', 'API'];

const kioskLoginSchema = z.object({
    tenantCode: z.string().min(1),
    deviceName: z.string().min(1),
    deviceKey: z.string().min(1),
});

const locationSchema = z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional().nullable(),
});

const workModeSelectSchema = z.object({
    date: z.string().min(1),
    workMode: z.enum(['WFH', 'ClientVisit', 'FieldWork']),
    location: locationSchema.optional().nullable(),
    clientName: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    idempotencyKey: z.string().optional().nullable(),
});

const attendanceCheckOutSchema = z.object({
    date: z.string().min(1),
    workSummary: z.string().optional().nullable(),
    idempotencyKey: z.string().optional().nullable(),
});

const attendanceBreakActionSchema = z.object({ date: z.string().min(1) });

const faceCheckInSchema = z.object({
    userId: z.union([z.string(), z.number()]),
    date: z.string().min(1),
    // Required, not optional — the kiosk always computes this (1 - euclidean
    // distance); making it mandatory here is what actually enforces a
    // server-side match-quality floor instead of trusting the kiosk's own
    // (locally overridable) threshold decision.
    confidence: z.number().min(0).max(1),
    idempotencyKey: z.string().min(1),
});

const faceEnrollSchema = z.object({
    userId: z.union([z.string(), z.number()]),
    embedding: z.array(z.number()).min(1),
    modelVersion: z.string().min(1),
});

const attendancePolicySchema = z.object({
    name: z.string().min(1).max(150),
    policy_type: z.enum(['OfficeOnly', 'Hybrid', 'Remote', 'FieldStaff']),
    allowed_methods: z.array(z.enum(ATTENDANCE_METHODS)).min(1),
    config: z.record(z.string(), z.unknown()).optional().nullable(),
    is_active: z.boolean().optional(),
});

const policyAssignSchema = z.object({ policyId: z.union([z.string(), z.number(), z.null()]) });

const kioskDeviceCreateSchema = z.object({
    device_name: z.string().min(1).max(150),
    location_id: z.union([z.string(), z.number()]).optional().nullable(),
});

const kioskAppConfigSchema = z.object({
    kioskAppUrl: z.union([z.string().max(500), z.null()]),
});

const kioskDeviceStatusSchema = z.object({ status: z.enum(['Active', 'Revoked']) });

// ---------------- company profile (Phase 7) ----------------

const companyProfileUpdateSchema = z.object({
    name: z.string().min(1).max(255),
    logo_url: z.string().max(5_000_000).optional().nullable(),
    address_line1: z.string().max(255).optional().nullable(),
    address_line2: z.string().max(255).optional().nullable(),
    city: z.string().max(100).optional().nullable(),
    state: z.string().max(100).optional().nullable(),
    country: z.string().max(100).optional().nullable(),
    postal_code: z.string().max(20).optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    contact_email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
    website: z.string().max(255).optional().nullable(),
    currency: z.string().min(1).max(10),
    date_format: z.string().min(1).max(20),
    financial_year_start_month: z.number().int().min(1).max(12),
    theme_primary_color: z.union([z.string().regex(/^#[0-9A-Fa-f]{6,8}$/), z.null()]).optional(),
    theme_secondary_color: z.union([z.string().regex(/^#[0-9A-Fa-f]{6,8}$/), z.null()]).optional(),
});

// ---------------- shift management (Phase 7) ----------------

const SHIFT_TYPES = ['General', 'Flexible', 'Night', 'Rotational', 'Split'];
const BREAK_TYPES = ['none', 'unpaid_duration', 'paid_duration', 'fixed_window'];

const shiftTimeWindowSchema = z.object({ start: z.string().min(1), end: z.string().min(1) });

const shiftSchema = z.object({
    name: z.string().min(1).max(150),
    shift_type: z.enum(SHIFT_TYPES),
    start_time: z.string().optional().nullable(),
    end_time: z.string().optional().nullable(),
    is_overnight: z.boolean().optional(),
    time_windows: z.array(shiftTimeWindowSchema).optional().nullable(),
    expected_work_minutes: z.number().int().min(0).optional(),
    grace_period_minutes: z.number().int().min(0).optional(),
    early_exit_threshold_minutes: z.number().int().min(0).optional(),
    break_type: z.enum(BREAK_TYPES).optional(),
    break_duration_minutes: z.number().int().min(0).optional().nullable(),
    break_window_start: z.string().optional().nullable(),
    break_window_end: z.string().optional().nullable(),
    ot_enabled: z.boolean().optional(),
    ot_trigger_after_minutes: z.number().int().min(0).optional().nullable(),
    ot_requires_approval: z.boolean().optional(),
    rotation_note: z.string().max(500).optional().nullable(),
    is_active: z.boolean().optional(),
});

const shiftAssignmentSchema = z.object({
    user_id: z.union([z.string(), z.number()]),
    shift_id: z.union([z.string(), z.number()]),
    effective_from: z.string().min(1),
});

// ---------------- work modes (Phase 7) ----------------

const workModeSchema = z.object({
    code: z.string().min(1).max(30),
    name: z.string().min(1).max(100),
    description: z.string().optional().nullable(),
    sort_order: z.number().optional(),
    is_active: z.boolean().optional(),
});

const workModeAssignSchema = z.object({ workModeId: z.union([z.string(), z.number(), z.null()]) });

// ---------------- salary grades (Phase 7) ----------------

const salaryGradeSchema = z.object({
    code: z.string().min(1).max(50),
    name: z.string().min(1).max(150),
    description: z.string().optional().nullable(),
    min_amount: z.union([z.string(), z.number()]).optional().nullable(),
    mid_amount: z.union([z.string(), z.number()]).optional().nullable(),
    max_amount: z.union([z.string(), z.number()]).optional().nullable(),
    default_structure_id: z.union([z.string(), z.number()]).optional().nullable(),
    is_active: z.boolean().optional(),
});

// ---------------- RBAC user-creation fix (Phase 7) ----------------

const userRoleIdOptionalSchema = z.union([z.string(), z.number()]).optional().nullable();

// ---------------- Platform Administration (Phase 9) ----------------

const platformAdminLoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

const platformAdminChangePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
});

// Slug is the "Company Code" typed at HRMS login (auth.routes.js's
// tenantCode) — lowercase/digits/hyphen only, matching how existing slugs
// (e.g. "mywe") look, and kept short since it's a user-facing login field.
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,49}$/;

// Currency/date format/financial year are deliberately NOT collected here
// (Phase 13E, Part 9) — a brand-new tenant gets sensible defaults at
// provisioning time (see tenantProvisioning.service.js) and its own
// Organization Administrator configures them after first login via the
// existing self-service PUT /company (companyProfileUpdateSchema below).
const createCompanySchema = z.object({
    name: z.string().min(1).max(255),
    slug: z.string().regex(SLUG_PATTERN, 'Lowercase letters, numbers and hyphens only'),
    timezone: z.string().min(1).max(50).optional(),
    phone: z.string().min(1).max(30),
    billing_email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
    adminName: z.string().min(1).max(255),
    adminEmail: z.string().email(),
    roleTemplate: z.enum(['simple', 'enterprise']).optional().default('enterprise'),
    subscription_plan_id: z.union([z.string(), z.number()]),
    status: z.enum(['trial', 'active']).optional().default('trial'),
});

const platformSetStatusSchema = z.object({
    status: z.enum(['trial', 'active', 'suspended', 'cancelled']),
});

// ---------------- Subscription Plans (Phase 13E, Parts 7-8) ----------------

const subscriptionPlanSchema = z.object({
    name: z.string().min(1).max(100),
    max_employees: z.union([z.number().int().min(1), z.null()]).optional(),
    storage_limit_mb: z.union([z.number().int().min(1), z.null()]).optional(),
    support_level: z.string().max(50).optional().nullable(),
    trial_days: z.union([z.number().int().min(0), z.null()]).optional(),
    enabled_modules: z.array(z.enum(GATEABLE_MODULES)).optional().default([]),
    monthly_price: z.union([z.number().min(0), z.null()]).optional(),
    annual_price: z.union([z.number().min(0), z.null()]).optional(),
    is_active: z.boolean().optional().default(true),
});

// Assigning a plan to a company (Phase 13E) — replaces the old "(Preview)"
// platformSubscriptionUpdateSchema (plan/seat_limit/license_type/
// feature_package free-text fields with nothing enforcing them). A single
// FK id, validated against the real subscription_plans catalog at the
// route layer (does the plan exist / is it active), not just shape-checked
// here.
const subscriptionAssignSchema = z.object({
    subscription_plan_id: z.union([z.string(), z.number()]),
});

// ---------------- Company Documents (Phase 11) ----------------

const DOCUMENT_CATEGORIES = [
    'Leave Policies', 'HR Policies', 'Employee Handbook', 'Code of Conduct', 'IT Policies',
    'Payroll Policies', 'Holiday Lists', 'Insurance Documents', 'Company Forms', 'Templates', 'Other Documents',
];

// Sent alongside the multipart file on create, or alone (JSON) on metadata-only
// update — `visibility` describes the union of share rows to write: "all" on
// its own means every employee, otherwise any combination of the 3 id lists.
const documentVisibilitySchema = z.object({
    allEmployees: z.boolean().optional(),
    roleIds: z.array(z.union([z.string(), z.number()])).optional(),
    departmentIds: z.array(z.union([z.string(), z.number()])).optional(),
    locationIds: z.array(z.union([z.string(), z.number()])).optional(),
});

const companyDocumentMetadataSchema = z.object({
    title: z.string().min(1).max(255),
    category: z.enum(DOCUMENT_CATEGORIES),
    description: z.string().optional().nullable(),
    effective_date: z.string().min(1),
    expiry_date: z.string().optional().nullable(),
    visibility: documentVisibilitySchema,
});

module.exports = {
    leaveApplySchema,
    leaveStatusUpdateSchema,
    userCreateSchema,
    userUpdateSchema,
    userPiiUpdateSchema,
    resetPasswordSchema,
    changePasswordSchema,
    settingsBulkSchema,
    holidayCreateSchema,
    nameOnlySchema,
    lookupSchema,
    branchSchema,
    checkInSchema,
    roleCreateSchema,
    rolePermissionsSchema,
    userRolesAssignSchema,
    userStatusUpdateSchema,
    menuReplaceSchema,
    announcementCreateSchema,
    payrollComponentSchema,
    payrollStructureSchema,
    structureComponentsReplaceSchema,
    payrollAssignmentSchema,
    userBankingUpdateSchema,
    payrollRunCreateSchema,
    overtimeEntrySchema,
    overtimeStatusSchema,
    kioskLoginSchema,
    workModeSelectSchema,
    attendanceCheckOutSchema,
    attendanceBreakActionSchema,
    faceCheckInSchema,
    faceEnrollSchema,
    attendancePolicySchema,
    policyAssignSchema,
    kioskDeviceCreateSchema,
    kioskAppConfigSchema,
    kioskDeviceStatusSchema,
    companyProfileUpdateSchema,
    shiftSchema,
    shiftAssignmentSchema,
    workModeSchema,
    workModeAssignSchema,
    salaryGradeSchema,
    userRoleIdOptionalSchema,
    platformAdminLoginSchema,
    platformAdminChangePasswordSchema,
    createCompanySchema,
    platformSetStatusSchema,
    subscriptionPlanSchema,
    subscriptionAssignSchema,
    DOCUMENT_CATEGORIES,
    companyDocumentMetadataSchema,
};
