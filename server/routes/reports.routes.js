const express = require('express');
const { many, one, streamMany } = require('../db/sql');
const { HttpError } = require('../middleware/errorHandler');
const { registry, getReport } = require('../reports/registry');
const { resolveScope } = require('../utils/reportScope');
const { parsePagination, runPaginatedQuery } = require('../utils/pagination');
const { streamExport } = require('../services/reportExport.service');
const dashboardRepo = require('../repositories/reports/dashboardReports.repository');
const prefsRepo = require('../repositories/reportPreferences.repository');

const employeeReports = require('../repositories/reports/employeeReports.repository');
const attendanceReports = require('../repositories/reports/attendanceReports.repository');
const leaveReports = require('../repositories/reports/leaveReports.repository');
const payrollReports = require('../repositories/payrollReports.repository');
const organizationReports = require('../repositories/reports/organizationReports.repository');

// repoKey on a registry entry looks itself up here — keeps the registry
// declarative (a string, not a live require) and every category's queries
// physically isolated in their own repository file.
const repos = { employeeReports, attendanceReports, leaveReports, payrollReports, organizationReports };

const router = express.Router();

// A report is either scope-suffixed (own/team/all, resolved against the
// requester's permissions the same way payroll/leaves already do) or gated
// by a single flat, org-wide-only permission (Organization/Compliance/Audit
// categories, where "team" or "own" don't make sense).
function resolveVisibility(entry, permissions) {
    if (entry.flatPermission) return permissions.includes(entry.flatPermission) ? 'all' : null;
    return resolveScope(permissions, entry.scopePermissionPrefix);
}

function buildEffectiveFilters(req, entry) {
    // fixedFilters (a report's own preset, e.g. Active Employees always
    // means status=active) always wins over anything the client sends —
    // otherwise a "New Joiners" report could be filtered into showing
    // something else entirely.
    return { ...req.query, ...(entry.fixedFilters || {}) };
}

router.get('/catalog', (req, res) => {
    const { permissions } = req.auth;
    const visible = registry
        .filter((entry) => resolveVisibility(entry, permissions) !== null)
        .map((entry) => ({
            id: entry.id,
            category: entry.category,
            title: entry.title,
            description: entry.description,
            filters: entry.filters,
            columns: entry.columns,
            chart: entry.chart,
            favoritable: entry.favoritable,
            stub: !!entry.stub,
            defaultSortField: entry.defaultSortField,
        }));
    res.json(visible);
});

router.get('/dashboard/summary', async (req, res) => {
    const { tenantId, userId, permissions } = req.auth;
    const scopes = {
        employee: resolveScope(permissions, 'reports.employee.view'),
        attendance: resolveScope(permissions, 'reports.attendance.view'),
        leave: resolveScope(permissions, 'reports.leave.view'),
        payroll: resolveScope(permissions, 'reports.payroll.view'),
    };
    if (!Object.values(scopes).some(Boolean)) {
        throw new HttpError(403, 'You do not have permission to view the reports dashboard');
    }
    const summary = await dashboardRepo.getSummary(tenantId, { requesterId: userId, scopes });
    res.json(summary);
});

router.get('/:reportId/data', async (req, res) => {
    const entry = getReport(req.params.reportId);
    if (!entry) throw new HttpError(404, 'Unknown report');

    const { tenantId, userId, permissions } = req.auth;
    const scope = resolveVisibility(entry, permissions);
    if (!scope) throw new HttpError(403, 'You do not have permission to view this report');

    if (entry.stub) return res.json({ rows: [], total: 0, page: 1, pageSize: 0, stub: true });

    const filters = buildEffectiveFilters(req, entry);
    const fn = repos[entry.repoKey][entry.fnName];

    if (entry.mode === 'bespoke') {
        const result = await fn(tenantId, { scope, requesterId: userId, filters });
        const rows = Array.isArray(result) ? result : result.rows;
        return res.json({ rows, total: rows.length, page: 1, pageSize: rows.length, bespoke: true });
    }

    const { baseSelect, params } = await fn(tenantId, { scope, requesterId: userId, filters });
    const allowedSortFields = entry.columns.map((c) => c.field);
    const pagination = parsePagination(req.query, { allowedSortFields, defaultSortField: entry.defaultSortField });
    const result = await runPaginatedQuery({ many, one }, baseSelect, params, pagination);
    res.json(result);
});

router.get('/:reportId/export', async (req, res) => {
    const entry = getReport(req.params.reportId);
    if (!entry) throw new HttpError(404, 'Unknown report');

    const { tenantId, userId, permissions } = req.auth;
    const scope = resolveVisibility(entry, permissions);
    if (!scope) throw new HttpError(403, 'You do not have permission to export this report');
    if (entry.stub) throw new HttpError(400, 'This report is not yet available for export');

    const format = ['xlsx', 'pdf'].includes(req.query.format) ? req.query.format : 'csv';
    const filters = buildEffectiveFilters(req, entry);
    const fn = repos[entry.repoKey][entry.fnName];
    const meta = { filename: entry.id, columns: entry.columns, title: entry.title, sheetName: entry.title.slice(0, 31) };

    if (entry.mode === 'bespoke') {
        const result = await fn(tenantId, { scope, requesterId: userId, filters });
        const rows = Array.isArray(result) ? result : result.rows;
        await streamExport(res, format, meta, async (onRow) => { rows.forEach(onRow); });
        return;
    }

    const { baseSelect, params } = await fn(tenantId, { scope, requesterId: userId, filters });
    const allowedSortFields = entry.columns.map((c) => c.field);
    const sortField = allowedSortFields.includes(entry.defaultSortField) ? entry.defaultSortField : allowedSortFields[0];
    const orderedSelect = `${baseSelect} ORDER BY ${sortField} ASC`;
    await streamExport(res, format, meta, (onRow) => streamMany(orderedSelect, params, onRow));
});

router.get('/favorites', async (req, res) => {
    const rows = await prefsRepo.listFavorites(req.auth.tenantId, req.auth.userId);
    res.json(rows.map((r) => r.report_id));
});

router.post('/favorites/:reportId', async (req, res) => {
    await prefsRepo.addFavorite(req.auth.tenantId, req.auth.userId, req.params.reportId);
    res.status(201).json({ success: true });
});

router.delete('/favorites/:reportId', async (req, res) => {
    await prefsRepo.removeFavorite(req.auth.tenantId, req.auth.userId, req.params.reportId);
    res.json({ success: true });
});

router.get('/saved-filters', async (req, res) => {
    const rows = await prefsRepo.listSavedFilters(req.auth.tenantId, req.auth.userId, req.query.reportId);
    res.json(rows.map((r) => ({ ...r, filters: JSON.parse(r.filters) })));
});

router.post('/saved-filters', async (req, res) => {
    const { reportId, name, filters } = req.body;
    if (!reportId || !name) throw new HttpError(400, 'reportId and name are required');
    const id = await prefsRepo.createSavedFilter(req.auth.tenantId, req.auth.userId, { reportId, name, filters });
    res.status(201).json({ id });
});

router.delete('/saved-filters/:id', async (req, res) => {
    await prefsRepo.deleteSavedFilter(req.auth.tenantId, req.auth.userId, req.params.id);
    res.json({ success: true });
});

module.exports = router;
