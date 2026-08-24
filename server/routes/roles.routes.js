const express = require('express');
const rolesRepo = require('../repositories/roles.repository');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { roleCreateSchema, rolePermissionsSchema } = require('../schemas');

// Admin console for the RBAC system introduced in Milestone 1
// (permissions/roles/role_permissions/user_roles) — lets a System
// Administrator manage roles and their permission grants through the UI
// instead of only via the one-time migration seed script.
const router = express.Router();

router.get('/permissions', requireAnyPermission(['roles.view', 'roles.manage']), async (req, res) => {
    res.json(await rolesRepo.listPermissions());
});

router.get('/', requireAnyPermission(['roles.view', 'roles.manage']), async (req, res) => {
    const roles = await rolesRepo.listRoles(req.auth.tenantId);
    const withPermissions = await Promise.all(
        roles.map(async (role) => ({ ...role, permissions: await rolesRepo.getRolePermissionCodes(role.id) }))
    );
    res.json(withPermissions);
});

router.post('/', requirePermission('roles.manage'), validateBody(roleCreateSchema), async (req, res) => {
    const id = await rolesRepo.createRole(req.auth.tenantId, req.body);
    res.json({ id });
});

router.put('/:id/permissions', requirePermission('roles.manage'), validateBody(rolePermissionsSchema), async (req, res) => {
    const role = await rolesRepo.roleBelongsToTenant(req.auth.tenantId, req.params.id);
    if (!role) throw new HttpError(404, 'Role not found');
    await rolesRepo.setRolePermissions(req.params.id, req.body.permissionCodes);
    res.json({ success: true });
});

router.delete('/:id', requirePermission('roles.manage'), async (req, res) => {
    const role = await rolesRepo.roleBelongsToTenant(req.auth.tenantId, req.params.id);
    if (!role) throw new HttpError(404, 'Role not found');
    if (role.is_system) throw new HttpError(400, 'System roles cannot be deleted');
    await rolesRepo.deleteRole(req.auth.tenantId, req.params.id);
    res.json({ success: true });
});

module.exports = router;
