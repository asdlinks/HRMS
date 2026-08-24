const { one, sql } = require('../db/sql');

// Tenant Health (Part 4) — a simple onboarding checklist for MYWE support to
// spot customers needing setup help. Every check is a boolean derived from a
// COUNT/EXISTS against tables the tenant already owns; no HR record content
// is ever read (Part 10).
async function getTenantHealth(tenantId) {
    const params = { tenantId: { type: sql.Int, value: tenantId } };

    const row = await one(
        `SELECT
            (SELECT CASE WHEN name IS NOT NULL AND address_line1 IS NOT NULL
                          AND phone IS NOT NULL AND contact_email IS NOT NULL
                     THEN 1 ELSE 0 END
             FROM tenants WHERE id = @tenantId) AS profile_completed,
            (SELECT COUNT(*) FROM departments WHERE tenant_id = @tenantId) AS department_count,
            (SELECT COUNT(*) FROM users WHERE tenant_id = @tenantId) AS employee_count,
            (SELECT COUNT(*) FROM holidays WHERE tenant_id = @tenantId) AS holiday_count,
            (SELECT COUNT(*) FROM attendance_policies WHERE tenant_id = @tenantId AND is_active = 1) AS active_attendance_policy_count,
            (SELECT COUNT(*) FROM salary_structures WHERE tenant_id = @tenantId) AS salary_structure_count,
            (SELECT COUNT(*) FROM face_enrollments WHERE tenant_id = @tenantId) AS face_enrollment_count,
            (SELECT COUNT(*) FROM company_documents WHERE tenant_id = @tenantId) AS document_count`,
        params
    );

    const checks = {
        companyProfileCompleted: !!row.profile_completed,
        departmentsConfigured: row.department_count > 0,
        employeesAdded: row.employee_count > 1, // more than just the seeded admin
        holidaysConfigured: row.holiday_count > 0,
        attendanceConfigured: row.active_attendance_policy_count > 0,
        payrollConfigured: row.salary_structure_count > 0,
        faceAttendanceConfigured: row.face_enrollment_count > 0,
        companyDocumentsPresent: row.document_count > 0,
    };

    const total = Object.keys(checks).length;
    const completed = Object.values(checks).filter(Boolean).length;

    return { checks, setupCompletionPercent: Math.round((completed / total) * 100) };
}

// Usage Summary (Part 5) — business-level metrics only, never attendance
// logs, leave records or payroll line items.
async function getTenantUsage(tenantId) {
    const params = { tenantId: { type: sql.Int, value: tenantId } };

    const [counts, lastPayroll, lastAttendance] = await Promise.all([
        one(
            `SELECT
                (SELECT COUNT(*) FROM users WHERE tenant_id = @tenantId) AS employee_count,
                (SELECT COUNT(*) FROM users WHERE tenant_id = @tenantId AND status = 'active') AS active_user_count,
                (SELECT MAX(last_login_at) FROM users WHERE tenant_id = @tenantId) AS last_login_at,
                (SELECT COUNT(*) FROM company_documents WHERE tenant_id = @tenantId) AS documents_uploaded,
                (SELECT ISNULL(SUM(v.size_bytes), 0)
                 FROM company_document_versions v WHERE v.tenant_id = @tenantId) AS storage_used_bytes`,
            params
        ),
        one(`SELECT MAX(created_at) AS last_run_at FROM payroll_runs WHERE tenant_id = @tenantId`, params),
        one(
            `SELECT MAX(a.date) AS last_date
             FROM attendance a JOIN users u ON u.id = a.user_id
             WHERE u.tenant_id = @tenantId`,
            params
        ),
    ]);

    return {
        employeeCount: counts.employee_count || 0,
        activeUserCount: counts.active_user_count || 0,
        lastLoginAt: counts.last_login_at,
        documentsUploaded: counts.documents_uploaded || 0,
        storageUsedBytes: counts.storage_used_bytes || 0,
        lastPayrollRunAt: lastPayroll.last_run_at,
        lastAttendanceSyncAt: lastAttendance.last_date,
    };
}

module.exports = { getTenantHealth, getTenantUsage };
