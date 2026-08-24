const { one, many, run, sql } = require('../db/sql');

// scope: 'own' -> requester's leaves only; 'team' -> requester's own + direct
// reports (matches the pre-Milestone-1 manager behavior exactly, direct
// reports only, not the full recursive subtree used by users.view.team);
// 'all' -> everyone in the tenant. super_admin leaves are always excluded
// from results for everyone, matching existing behavior.
// filterUserId narrows the result to one specific employee (e.g. their
// profile page's leave history) — applied on top of the scope restriction,
// so a manager can only ever narrow within their own permitted scope
// (own/team), never see an out-of-scope employee's leaves this way.
async function listLeaves(tenantId, { scope, requesterId, departmentId, filterUserId } = {}) {
    let query = `
        SELECT leaves.*, users.name as user_name, users.department_id
        FROM leaves
        JOIN users ON leaves.user_id = users.id
        WHERE leaves.tenant_id = @tenantId AND users.role != 'super_admin'
    `;
    const params = { tenantId: { type: sql.Int, value: tenantId } };

    if (scope === 'own') {
        query += ' AND leaves.user_id = @requesterId';
        params.requesterId = { type: sql.Int, value: requesterId };
    } else if (scope === 'team') {
        query += ' AND (leaves.user_id = @requesterId OR users.manager_id = @requesterId)';
        params.requesterId = { type: sql.Int, value: requesterId };
    }

    if (departmentId && departmentId !== 'all') {
        query += ' AND users.department_id = @departmentId';
        params.departmentId = { type: sql.Int, value: departmentId };
    }

    if (filterUserId) {
        query += ' AND leaves.user_id = @filterUserId';
        params.filterUserId = { type: sql.Int, value: filterUserId };
    }

    query += ' ORDER BY leaves.applied_at DESC';
    return many(query, params);
}

function getUserForLeaveApplication(tenantId, userId) {
    return one(
        'SELECT role, name, joining_date, probation_period, manager_id FROM users WHERE tenant_id = @tenantId AND id = @userId',
        { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId } }
    );
}

function countFlexiHolidaysThisYear(tenantId, userId, year) {
    return one(
        `SELECT COUNT(*) as count FROM leaves
         WHERE tenant_id = @tenantId AND user_id = @userId AND type = 'Flexi Holiday' AND YEAR(start_date) = @year`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: userId },
            year: { type: sql.Int, value: year },
        }
    );
}

async function createLeave(tenantId, data) {
    const result = await run(
        `INSERT INTO leaves (tenant_id, user_id, type, start_date, end_date, reason, status, is_half_day, half_day_session)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @userId, @type, @startDate, @endDate, @reason, @status, @isHalfDay, @halfDaySession)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: data.user_id },
            type: { type: sql.NVarChar(50), value: data.type },
            startDate: { type: sql.Date, value: data.start_date },
            endDate: { type: sql.Date, value: data.end_date },
            reason: { type: sql.NVarChar(sql.MAX), value: data.reason || null },
            status: { type: sql.NVarChar(30), value: data.status },
            isHalfDay: { type: sql.Bit, value: !!data.is_half_day },
            halfDaySession: { type: sql.NVarChar(20), value: data.half_day_session || null },
        }
    );
    return result.recordset[0].id;
}

function getLeaveWithOwner(tenantId, leaveId) {
    return one(
        `SELECT leaves.id, leaves.user_id, leaves.status, users.role, users.name, users.manager_id
         FROM leaves JOIN users ON leaves.user_id = users.id
         WHERE leaves.tenant_id = @tenantId AND leaves.id = @leaveId`,
        { tenantId: { type: sql.Int, value: tenantId }, leaveId: { type: sql.Int, value: leaveId } }
    );
}

// Only a Pending or Approved leave can be cancelled — the WHERE guard makes
// this atomic against a concurrent/duplicate cancel; callers check
// rowsAffected to tell "already cancelled/rejected" apart from a real update.
function cancelLeave(tenantId, id, cancellationReason) {
    return run(
        `UPDATE leaves SET status = 'Cancelled', cancellation_reason = @cancellationReason
         WHERE id = @id AND tenant_id = @tenantId AND status IN ('Pending', 'Approved')`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            cancellationReason: { type: sql.NVarChar(sql.MAX), value: cancellationReason || null },
        }
    );
}

// Only a Pending leave can be approved/rejected — same "guard baked into the
// WHERE clause, check rowsAffected" pattern already used by
// overtime.repository.js::updateStatus.
function updateLeaveStatus(tenantId, id, status) {
    return run(
        "UPDATE leaves SET status = @status WHERE id = @id AND tenant_id = @tenantId AND status = 'Pending'",
        {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            status: { type: sql.NVarChar(30), value: status },
        }
    );
}

function findPendingLeaveForUser(tenantId, userId, date) {
    let query = "SELECT id FROM leaves WHERE tenant_id = @tenantId AND user_id = @userId AND status = 'Pending'";
    const params = { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId } };
    if (date) {
        query += ' AND start_date <= @date AND end_date >= @date';
        params.date = { type: sql.Date, value: date };
    } else {
        query += ' ORDER BY applied_at DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY';
    }
    return one(query, params);
}

// Approved or Pending leaves both block a new overlapping request — a
// Pending request could still be approved later, so it has to count too.
function hasOverlappingLeave(tenantId, userId, startDate, endDate) {
    return one(
        `SELECT TOP 1 id FROM leaves
         WHERE tenant_id = @tenantId AND user_id = @userId AND status IN ('Approved', 'Pending')
           AND start_date <= @endDate AND end_date >= @startDate`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: userId },
            startDate: { type: sql.Date, value: startDate },
            endDate: { type: sql.Date, value: endDate },
        }
    );
}

// Mirrors LeavesPage.tsx's client-side getUsedLeavesForType exactly (0.5 for
// a half-day, else an inclusive date-span day count), except it also counts
// Pending leaves, not just Approved — otherwise several pending requests
// could collectively exceed the balance before any of them are decided.
async function getLeaveDaysUsedForType(tenantId, userId, type, year) {
    const rows = await many(
        `SELECT start_date, end_date, is_half_day FROM leaves
         WHERE tenant_id = @tenantId AND user_id = @userId AND status IN ('Approved', 'Pending')
           AND LOWER(type) = LOWER(@type) AND YEAR(start_date) = @year`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: userId },
            type: { type: sql.NVarChar(50), value: type },
            year: { type: sql.Int, value: year },
        }
    );
    return rows.reduce((sum, l) => {
        if (l.is_half_day) return sum + 0.5;
        const diffDays = Math.ceil((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000) + 1;
        return sum + (Number.isNaN(diffDays) ? 1 : diffDays);
    }, 0);
}

function getSuperAdminIds(tenantId) {
    return many("SELECT id FROM users WHERE tenant_id = @tenantId AND role = 'super_admin'", {
        tenantId: { type: sql.Int, value: tenantId },
    });
}

module.exports = {
    listLeaves,
    getUserForLeaveApplication,
    countFlexiHolidaysThisYear,
    createLeave,
    getLeaveWithOwner,
    cancelLeave,
    updateLeaveStatus,
    findPendingLeaveForUser,
    hasOverlappingLeave,
    getLeaveDaysUsedForType,
    getSuperAdminIds,
};
