const { one, many, run, sql } = require('../db/sql');

// scope mirrors leaves.repository.js::listLeaves exactly: 'own' -> requester
// only; 'team' -> requester + direct reports; 'all' -> everyone in tenant.
function listEntries(tenantId, { scope, requesterId, status, filterUserId } = {}) {
    let query = `
        SELECT ot.*, u.name as user_name, u.employee_id
        FROM overtime_entries ot
        JOIN users u ON ot.user_id = u.id
        WHERE ot.tenant_id = @tenantId
    `;
    const params = { tenantId: { type: sql.Int, value: tenantId } };

    if (scope === 'own') {
        query += ' AND ot.user_id = @requesterId';
        params.requesterId = { type: sql.Int, value: requesterId };
    } else if (scope === 'team') {
        query += ' AND (ot.user_id = @requesterId OR u.manager_id = @requesterId)';
        params.requesterId = { type: sql.Int, value: requesterId };
    }

    if (status) {
        query += ' AND ot.status = @status';
        params.status = { type: sql.NVarChar(20), value: status };
    }
    if (filterUserId) {
        query += ' AND ot.user_id = @filterUserId';
        params.filterUserId = { type: sql.Int, value: filterUserId };
    }

    query += ' ORDER BY ot.work_date DESC';
    return many(query, params);
}

function getEntry(tenantId, id) {
    return one(
        `SELECT ot.*, u.name as user_name, u.manager_id
         FROM overtime_entries ot JOIN users u ON ot.user_id = u.id
         WHERE ot.tenant_id = @tenantId AND ot.id = @id`,
        { tenantId: { type: sql.Int, value: tenantId }, id: { type: sql.Int, value: id } }
    );
}

// `status` defaults to the table's own 'Pending' default for every existing
// caller (the manual apply-for-overtime route); Phase 7's shift-driven
// auto-overtime is the only caller that ever passes 'Approved' directly
// (when the shift's ot_requires_approval is false).
async function createEntry(tenantId, data, submittedBy, status = 'Pending') {
    const result = await run(
        `INSERT INTO overtime_entries (tenant_id, user_id, work_date, hours, reason, submitted_by, status)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @userId, @workDate, @hours, @reason, @submittedBy, @status)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: data.user_id },
            workDate: { type: sql.Date, value: data.work_date },
            hours: { type: sql.Decimal(5, 2), value: data.hours },
            reason: { type: sql.NVarChar(255), value: data.reason || null },
            submittedBy: { type: sql.Int, value: submittedBy },
            status: { type: sql.NVarChar(20), value: status },
        }
    );
    return result.recordset[0].id;
}

// Only while still Pending and not yet consumed by a processed run.
function updateEntry(tenantId, id, data) {
    return run(
        `UPDATE overtime_entries SET work_date = @workDate, hours = @hours, reason = @reason
         WHERE tenant_id = @tenantId AND id = @id AND status = 'Pending' AND payroll_run_id IS NULL`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            workDate: { type: sql.Date, value: data.work_date },
            hours: { type: sql.Decimal(5, 2), value: data.hours },
            reason: { type: sql.NVarChar(255), value: data.reason || null },
        }
    );
}

function updateStatus(tenantId, id, status, approverId, rejectionReason) {
    return run(
        `UPDATE overtime_entries SET status = @status, approved_by = @approverId, approved_at = SYSUTCDATETIME(), rejection_reason = @rejectionReason
         WHERE tenant_id = @tenantId AND id = @id AND status = 'Pending'`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            status: { type: sql.NVarChar(20), value: status },
            approverId: { type: sql.Int, value: approverId },
            rejectionReason: { type: sql.NVarChar(255), value: rejectionReason || null },
        }
    );
}

// Approved hours in range not yet claimed by a run — what the calculation
// engine sums for a payroll line.
function listApprovedUnconsumedInRange(tenantId, userId, startDate, endDate) {
    return many(
        `SELECT * FROM overtime_entries
         WHERE tenant_id = @tenantId AND user_id = @userId AND status = 'Approved' AND payroll_run_id IS NULL
           AND work_date BETWEEN @startDate AND @endDate`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: userId },
            startDate: { type: sql.Date, value: startDate },
            endDate: { type: sql.Date, value: endDate },
        }
    );
}

// Same as listApprovedUnconsumedInRange but for every employee at once —
// used when processing a whole run so the engine doesn't issue one query
// per employee.
function listApprovedUnconsumedInRangeForTenant(tenantId, startDate, endDate) {
    return many(
        `SELECT * FROM overtime_entries
         WHERE tenant_id = @tenantId AND status = 'Approved' AND payroll_run_id IS NULL
           AND work_date BETWEEN @startDate AND @endDate`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            startDate: { type: sql.Date, value: startDate },
            endDate: { type: sql.Date, value: endDate },
        }
    );
}

async function markConsumedByRun(tx, tenantId, ids, runId) {
    if (!ids.length) return;
    for (const id of ids) {
        await tx.run('UPDATE overtime_entries SET payroll_run_id = @runId WHERE tenant_id = @tenantId AND id = @id', {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            runId: { type: sql.Int, value: runId },
        });
    }
}

function releaseFromRun(tenantId, runId) {
    return run('UPDATE overtime_entries SET payroll_run_id = NULL WHERE tenant_id = @tenantId AND payroll_run_id = @runId', {
        tenantId: { type: sql.Int, value: tenantId },
        runId: { type: sql.Int, value: runId },
    });
}

module.exports = {
    listEntries,
    getEntry,
    createEntry,
    updateEntry,
    updateStatus,
    listApprovedUnconsumedInRange,
    listApprovedUnconsumedInRangeForTenant,
    markConsumedByRun,
    releaseFromRun,
};
