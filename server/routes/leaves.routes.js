const express = require('express');
const leavesRepo = require('../repositories/leaves.repository');
const notificationsRepo = require('../repositories/notifications.repository');
const rbacRepo = require('../repositories/rbac.repository');
const settingsRepo = require('../repositories/settings.repository');
const holidaysRepo = require('../repositories/holidays.repository');
const { requireAnyPermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { leaveApplySchema, leaveStatusUpdateSchema } = require('../schemas');

const router = express.Router();

const DEFAULT_LEAVE_ALLOCATIONS = [{ type: 'casual', days: 15 }];

// Mirrors LeavesPage.tsx's own parse-with-fallback of the tenant-wide
// `leave_allocations` setting, so server enforcement matches what the UI
// already shows the employee.
async function getLeaveAllocations(tenantId) {
    const rows = await settingsRepo.listSettings(tenantId);
    const row = rows.find((r) => r.key === 'leave_allocations');
    if (!row) return DEFAULT_LEAVE_ALLOCATIONS;
    try {
        const parsed = JSON.parse(row.value);
        return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_LEAVE_ALLOCATIONS;
    } catch {
        return DEFAULT_LEAVE_ALLOCATIONS;
    }
}

function countLeaveDays(startDate, endDate, isHalfDay) {
    if (isHalfDay) return 0.5;
    const diffDays = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
    return Number.isNaN(diffDays) ? 1 : diffDays;
}

// Mirrors LeavesPage.tsx's isHolidayOrSunday exactly — Sunday only (not
// Saturday, matching this org's existing business rule) plus a match in the
// `holidays` table, checked on both the start and end date.
async function isHolidayOrWeekend(tenantId, dateStr) {
    if (new Date(dateStr).getDay() === 0) return true;
    const rows = await holidaysRepo.listBetween('holidays', tenantId, dateStr, dateStr);
    return rows.length > 0;
}

router.get('/', requireAnyPermission(['leaves.view.own', 'leaves.view.team', 'leaves.view.all']), async (req, res) => {
    const { departmentId, userId: filterUserId } = req.query;
    const { permissions, tenantId, userId } = req.auth;
    const scope = permissions.includes('leaves.view.all') ? 'all' : permissions.includes('leaves.view.team') ? 'team' : 'own';
    const rows = await leavesRepo.listLeaves(tenantId, { scope, requesterId: userId, departmentId, filterUserId });
    res.json(rows);
});

async function notifyManagerOrAdmins(tenantId, managerId, message, type) {
    if (managerId) {
        await notificationsRepo.createNotification(tenantId, managerId, message, type);
    } else {
        const admins = await leavesRepo.getSuperAdminIds(tenantId);
        await Promise.all(admins.map((a) => notificationsRepo.createNotification(tenantId, a.id, message, type)));
    }
}

router.post('/', requireAnyPermission(['leaves.apply.own', 'leaves.apply.any']), validateBody(leaveApplySchema), async (req, res) => {
    const { tenantId, userId: requesterId, permissions } = req.auth;
    const { user_id, type, start_date, end_date, reason, is_half_day, half_day_session } = req.body;

    const targetUserId = parseInt(user_id, 10);
    if (targetUserId !== requesterId && !permissions.includes('leaves.apply.any')) {
        throw new HttpError(403, 'You do not have permission to apply for other employees.');
    }

    const user = await leavesRepo.getUserForLeaveApplication(tenantId, targetUserId);
    if (!user) throw new HttpError(404, 'User not found');

    const isProbationActive = () => {
        if (!user.joining_date || !user.probation_period) return false;
        const joiningDate = new Date(user.joining_date);
        const probationEndDate = new Date(joiningDate.setMonth(joiningDate.getMonth() + parseInt(user.probation_period, 10)));
        return new Date() < probationEndDate;
    };

    const isEarned = type.toLowerCase().includes('earned') || type.toLowerCase().includes('paid');
    if (isProbationActive() && isEarned) {
        throw new HttpError(400, 'Earned/Paid Leave is not available during your probation period.');
    }

    const todayVal = new Date().toISOString().split('T')[0];
    const isPastLeave = end_date < todayVal;

    if ((await isHolidayOrWeekend(tenantId, start_date)) || (await isHolidayOrWeekend(tenantId, end_date))) {
        throw new HttpError(400, 'You cannot select a Sunday or Holiday as start/end date.');
    }

    if (await leavesRepo.hasOverlappingLeave(tenantId, targetUserId, start_date, end_date)) {
        throw new HttpError(409, 'You already have a leave request overlapping these dates');
    }

    if (type === 'Flexi Holiday') {
        const currentYear = new Date().getFullYear();
        const countRow = await leavesRepo.countFlexiHolidaysThisYear(tenantId, targetUserId, currentYear);
        if (countRow && countRow.count >= 2) {
            throw new HttpError(400, 'Flexi Holiday limit reached (Max 2 per year)');
        }

        const status = 'Approved'; // auto-approved
        const leaveId = await leavesRepo.createLeave(tenantId, {
            user_id: targetUserId, type, start_date, end_date, reason, status, is_half_day, half_day_session,
        });
        await notifyManagerOrAdmins(
            tenantId, user.manager_id,
            `${user.name} has selected Flexi Holiday: ${reason} on ${start_date}`, 'flexi_holiday'
        );
        return res.json({ id: leaveId, status });
    }

    // Leave balance is enforced even for admin/backdated submissions — it's
    // a data-integrity rule, not just a UX gate on the self-service form.
    const allocations = await getLeaveAllocations(tenantId);
    const allocation = allocations.find((a) => a.type.toLowerCase() === type.toLowerCase());
    if (allocation) {
        const requestedDays = countLeaveDays(start_date, end_date, is_half_day);
        const usedDays = await leavesRepo.getLeaveDaysUsedForType(
            tenantId, targetUserId, type, new Date(start_date).getFullYear()
        );
        if (usedDays + requestedDays > allocation.days) {
            throw new HttpError(400, 'Insufficient leave balance');
        }
    }

    // Leave applied on behalf of another employee (leaves.apply.any), or a
    // past-dated entry, is auto-approved — same as the pre-Milestone-1 rule.
    const isAdminSubmission = targetUserId !== requesterId && permissions.includes('leaves.apply.any');
    const status = (isAdminSubmission || isPastLeave) ? 'Approved' : 'Pending';

    const leaveId = await leavesRepo.createLeave(tenantId, {
        user_id: targetUserId, type, start_date, end_date, reason, status, is_half_day, half_day_session,
    });

    // Whether a leave request notifies a manager/admin is a configurable
    // permission (leaves.notify_on_apply), not a hardcoded role check — see
    // migrations/mssql/007_leaves_notify_permission.sql. Granted to
    // employee/hr by default, matching the pre-Milestone-2 behavior.
    const targetPermissions = await rbacRepo.getPermissionCodesForUser(targetUserId);
    if (targetPermissions.includes('leaves.notify_on_apply')) {
        await notifyManagerOrAdmins(
            tenantId, user.manager_id,
            `New leave request from ${user.name} (${user.role.toUpperCase()})`, 'leave_request'
        );
    }

    res.json({ id: leaveId, status });
});

router.patch('/:id', validateBody(leaveStatusUpdateSchema), async (req, res) => {
    const { tenantId, userId: requesterId, permissions } = req.auth;
    const { status, cancellation_reason } = req.body;
    const { id } = req.params;

    const leave = await leavesRepo.getLeaveWithOwner(tenantId, id);
    if (!leave) throw new HttpError(404, 'Leave not found');

    if (status === 'Cancelled') {
        const isOwnLeave = leave.user_id === requesterId;
        const canCancelAny = permissions.includes('leaves.cancel.any');
        if (!isOwnLeave && !canCancelAny) throw new HttpError(403, 'You do not have permission to perform this action');

        const result = await leavesRepo.cancelLeave(tenantId, id, cancellation_reason);
        if (result.rowsAffected === 0) {
            throw new HttpError(409, `Cannot cancel a leave request that is already ${leave.status}`);
        }
        await notifyManagerOrAdmins(
            tenantId, leave.manager_id,
            `${leave.name} cancelled their leave request #${id}`, 'leave_cancelled'
        );
        return res.json({ success: true, status: 'Cancelled' });
    }

    if (!permissions.includes('leaves.approve')) {
        throw new HttpError(403, 'You do not have permission to perform this action');
    }

    const result = await leavesRepo.updateLeaveStatus(tenantId, id, status);
    if (result.rowsAffected === 0) {
        const verb = status === 'Approved' ? 'approve' : 'reject';
        throw new HttpError(409, `Cannot ${verb} a leave request that is already ${leave.status}`);
    }
    await notificationsRepo.createNotification(tenantId, leave.user_id, `Your leave request status changed to ${status}`, 'status_update');
    res.json({ success: true });
});

module.exports = router;
