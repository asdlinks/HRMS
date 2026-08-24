const express = require('express');
const { requirePermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { lookupSchema } = require('../schemas');

// Router factory for the 4 flat org-structure lookup modules — mirrors
// departments.routes.js/work-modes.routes.js exactly: GET is open to any
// authenticated tenant user (populating dropdowns isn't sensitive), while
// create/edit/delete require the module's own `.manage` permission and
// delete is blocked while any employee still references the row.
function createLookupRouter(repo, permissionCode, entityLabel) {
    const router = express.Router();

    router.get('/', async (req, res) => {
        res.json(await repo.list(req.auth.tenantId));
    });

    router.post('/', requirePermission(permissionCode), validateBody(lookupSchema), async (req, res) => {
        try {
            const id = await repo.create(req.auth.tenantId, req.body);
            res.json({ id });
        } catch (err) {
            if (repo.isUniqueViolation(err)) throw new HttpError(409, `A ${entityLabel} named "${req.body.name}" already exists`);
            throw err;
        }
    });

    router.patch('/:id', requirePermission(permissionCode), validateBody(lookupSchema), async (req, res) => {
        const existing = await repo.get(req.auth.tenantId, req.params.id);
        if (!existing) throw new HttpError(404, `${entityLabel} not found`);
        try {
            await repo.update(req.auth.tenantId, req.params.id, req.body);
        } catch (err) {
            if (repo.isUniqueViolation(err)) throw new HttpError(409, `A ${entityLabel} named "${req.body.name}" already exists`);
            throw err;
        }
        res.json({ success: true });
    });

    router.delete('/:id', requirePermission(permissionCode), async (req, res) => {
        const existing = await repo.get(req.auth.tenantId, req.params.id);
        if (!existing) throw new HttpError(404, `${entityLabel} not found`);
        const referenced = await repo.countUsersReferencing(req.auth.tenantId, req.params.id);
        if (referenced.count > 0) throw new HttpError(409, `This ${entityLabel} is assigned to one or more employees and cannot be deleted`);
        await repo.remove(req.auth.tenantId, req.params.id);
        res.json({ success: true });
    });

    return router;
}

module.exports = { createLookupRouter };
