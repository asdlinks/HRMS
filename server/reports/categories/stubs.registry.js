// Reports with no backing data source yet — each renders as a clean
// "Coming Soon" state in ReportViewer (entry.stub === true short-circuits
// the generic /:reportId/data and /:reportId/export handlers before any
// query runs). Kept in the registry (not just left out) so they still show
// up in the sidebar/catalog with an honest status instead of looking like
// an oversight.
//
// - Attendance Regularization has no backing workflow/table at all (it
//   would need a whole approval flow, not just a report) — Phase 10B scope
//   decision, see the plan doc.
// - Compliance has no specific reports enumerated yet beyond the
//   Payroll-category PF/ESI/TDS placeholders (payroll.registry.js) — this
//   is a category-level placeholder.
// - Audit needs an audit_log table (Phase 8 flagged the gap; deliberately
//   deferred out of this phase per the confirmed decision).
module.exports = [
    {
        id: 'attendance-regularization',
        category: 'attendance',
        title: 'Attendance Regularization',
        description: 'Regularization requests for missed check-in/check-out — requires an approval workflow not yet built.',
        scopePermissionPrefix: 'reports.attendance.view',
        filters: [],
        columns: [],
        chart: null,
        favoritable: false,
        stub: true,
    },
    {
        id: 'compliance-overview',
        category: 'compliance',
        title: 'Compliance Reports',
        description: 'Statutory and compliance reporting for this organization.',
        flatPermission: 'reports.compliance.view',
        filters: [],
        columns: [],
        chart: null,
        favoritable: false,
        stub: true,
    },
    {
        id: 'audit-trail',
        category: 'audit',
        title: 'Audit Trail',
        description: 'A full log of who did what and when across the system.',
        flatPermission: 'reports.audit.view',
        filters: [],
        columns: [],
        chart: null,
        favoritable: false,
        stub: true,
    },
];
