const express = require('express');
const bcrypt = require('bcryptjs');
const usersRepo = require('../repositories/users.repository');
const authRepo = require('../repositories/auth.repository');
const rolesRepo = require('../repositories/roles.repository');
const subscriptionPlansRepo = require('../repositories/subscriptionPlans.repository');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const {
    userCreateSchema, userUpdateSchema, userPiiUpdateSchema, userBankingUpdateSchema,
    resetPasswordSchema, userRolesAssignSchema, userStatusUpdateSchema,
} = require('../schemas');
const { isUniqueViolation } = require('../db/sql');

const router = express.Router();

// users.view.directory is the baseline "see the company directory" grant
// (every role gets it, including employee — this is what MyTeamPage uses);
// users.view.team / users.view.all layer on top for the fuller Employees
// management page.
router.get('/', requireAnyPermission(['users.view.all', 'users.view.team', 'users.view.directory']), async (req, res) => {
    const { departmentId } = req.query;
    const { permissions } = req.auth;
    // Priority: users.view.all > users.view.team > users.view.directory —
    // a manager holding both team and directory grants still gets scoped to
    // their own team, not the whole company, even though directory alone
    // (an employee's case) uses the same unrestricted 'all' query shape.
    const scope = permissions.includes('users.view.all')
        ? 'all'
        : permissions.includes('users.view.team')
            ? 'team'
            : 'all';
    const rows = await usersRepo.listUsers(req.auth.tenantId, { scope, requesterId: req.auth.userId, departmentId });
    res.json(rows);
});

router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const isSelf = Number(id) === req.auth.userId;
    const canViewOthers = req.auth.permissions.includes('users.view.all') || req.auth.permissions.includes('users.view.team');
    if (!isSelf && !canViewOthers) throw new HttpError(403, 'You do not have permission to perform this action');

    const row = await usersRepo.getUserById(req.auth.tenantId, id);
    if (!row) throw new HttpError(404, 'User not found');

    // Aadhaar/PAN are excluded from SAFE_USER_COLUMNS entirely — only merged
    // in here when the caller holds users.pii.manage, so a viewer without it
    // never sees the fields at all (not blank/redacted — simply absent).
    if (req.auth.permissions.includes('users.pii.manage')) {
        const pii = await usersRepo.getUserPii(req.auth.tenantId, id);
        if (pii) {
            row.aadhaar_number = pii.aadhaar_number;
            row.pan_number = pii.pan_number;
        }
    }

    // Banking fields (Phase 13B) — same additive-merge pattern as Aadhaar/PAN
    // above, independently gated by payroll.assign (the permission that has
    // always controlled bank details).
    if (req.auth.permissions.includes('payroll.assign')) {
        const banking = await usersRepo.getUserBanking(req.auth.tenantId, id);
        if (banking) {
            row.bank_account_holder_name = banking.bank_account_holder_name;
            row.bank_name = banking.bank_name;
            row.bank_branch = banking.bank_branch;
            row.bank_account_number = banking.bank_account_number;
            row.bank_ifsc_code = banking.bank_ifsc_code;
            row.bank_upi_id = banking.bank_upi_id;
        }
    }

    res.json(row);
});

router.post('/', requirePermission('users.manage'), validateBody(userCreateSchema), async (req, res) => {
    const { password, roleId, ...data } = req.body;
    if (!password) throw new HttpError(400, 'Password is required');

    // Employee-limit enforcement (Phase 13E, Part 10) — max_employees null
    // means unlimited (Enterprise-tier plans).
    const plan = await subscriptionPlansRepo.getPlanForTenant(req.auth.tenantId);
    if (plan && plan.max_employees != null) {
        const currentCount = await usersRepo.countEmployees(req.auth.tenantId);
        if (currentCount >= plan.max_employees) {
            throw new HttpError(403, `Employee limit reached for your subscription plan (${currentCount}/${plan.max_employees}). Upgrade your plan to add more employees.`);
        }
    }

    const hash = await bcrypt.hash(password, 10);

    let id;
    try {
        id = await usersRepo.createUser(req.auth.tenantId, data, hash);
    } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, 'A user with this email already exists');
        throw err;
    }

    // A brand-new user previously got zero real RBAC permissions until a
    // separate PUT /users/:id/roles call — seed user_roles immediately here,
    // preferring an explicit roleId from the create form and otherwise
    // matching the legacy `role` string against a role of the same code.
    const resolvedRoleId = roleId || (await rolesRepo.getRoleByCode(req.auth.tenantId, data.role))?.id;
    if (resolvedRoleId) {
        await rolesRepo.setUserRoles(req.auth.tenantId, id, [resolvedRoleId]);
    }

    res.json({ id });
});

router.patch('/:id', requirePermission('users.manage'), validateBody(userUpdateSchema), async (req, res) => {
    const updates = { ...req.body };
    delete updates.id;
    delete updates.department_name;
    delete updates.manager_name;
    delete updates.location_name;
    delete updates.children;
    delete updates.expanded;
    delete updates._t;
    delete updates.password; // password changes go through dedicated endpoints only

    try {
        await usersRepo.updateUser(req.auth.tenantId, req.params.id, updates);
    } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, 'A user with this email already exists');
        throw err;
    }
    res.json({ success: true });
});

router.delete('/:id', requirePermission('users.manage'), async (req, res) => {
    await usersRepo.deleteUser(req.auth.tenantId, req.params.id);
    res.json({ success: true });
});

// Disable/re-enable/offboard a user — the default action in place of hard
// delete (which stays available above for the rare case a record needs to
// be fully removed). Self-service protected: an admin can't lock themselves
// out by disabling their own account.
router.patch('/:id/status', requirePermission('users.manage'), validateBody(userStatusUpdateSchema), async (req, res) => {
    if (Number(req.params.id) === req.auth.userId) {
        throw new HttpError(400, 'You cannot change your own account status');
    }
    await usersRepo.updateUserStatus(req.auth.tenantId, req.params.id, req.body.status, req.body.exit_date);
    res.json({ success: true });
});

// Gated by users.unlock specifically — same rationale as
// users.password.reset above: a sensitive single-purpose account action,
// not bundled into general users.manage.
router.patch('/:id/unlock', requirePermission('users.unlock'), async (req, res) => {
    await authRepo.adminUnlockUser(req.auth.tenantId, req.params.id);
    res.json({ success: true });
});

// Gated by users.password.reset specifically — deliberately NOT bundled
// with users.manage, so a role can be granted "can reset passwords"
// without also granting general employee-record edit/view access.
router.patch('/:id/reset-password', requirePermission('users.password.reset'), validateBody(resetPasswordSchema), async (req, res) => {
    const { password } = req.body;
    if (!password) throw new HttpError(400, 'Password is required');
    const hash = await bcrypt.hash(password, 10);
    await authRepo.updateUserPassword(req.params.id, hash);
    res.json({ success: true, message: 'Password reset successfully' });
});

// Aadhaar/PAN — Identity Information (Phase 13A). Deliberately its own
// route/permission, never reachable via PATCH /:id (users.manage), so a
// role can hold general employee-edit access without being able to touch
// these two fields — same separation already used for password reset and
// unlock above.
router.patch('/:id/pii', requirePermission('users.pii.manage'), validateBody(userPiiUpdateSchema), async (req, res) => {
    try {
        await usersRepo.updateUserPii(req.auth.tenantId, req.params.id, req.body);
    } catch (err) {
        if (isUniqueViolation(err)) {
            throw new HttpError(409, 'This Aadhaar or PAN number is already assigned to another employee');
        }
        throw err;
    }
    res.json({ success: true });
});

// Banking Information (Phase 13B) — moved here from
// employee_salary_assignments as Employee Master's canonical source. Gated
// by payroll.assign, the same permission that always controlled bank
// details, kept as its own route so users.manage alone can't reach it.
router.patch('/:id/banking', requirePermission('payroll.assign'), validateBody(userBankingUpdateSchema), async (req, res) => {
    await usersRepo.updateUserBanking(req.auth.tenantId, req.params.id, req.body);
    res.json({ success: true });
});

// Assigns one or more roles to a user (full-replace — the roleIds sent are
// exactly the set the user ends up holding), the admin-facing counterpart to
// the one-time RBAC seed (005_seed_rbac_assignments.js). Gated by
// roles.manage, matching routes/roles.routes.js.
router.put('/:id/roles', requirePermission('roles.manage'), validateBody(userRolesAssignSchema), async (req, res) => {
    await rolesRepo.setUserRoles(req.auth.tenantId, req.params.id, req.body.roleIds);
    res.json({ success: true });
});

module.exports = router;
