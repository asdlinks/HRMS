const express = require('express');
const locationsRepo = require('../repositories/locations.repository');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { branchSchema } = require('../schemas');

const router = express.Router();

router.get('/', requireAnyPermission(['locations.view', 'locations.manage']), async (req, res) => {
    res.json(await locationsRepo.listLocations(req.auth.tenantId));
});

router.post('/', requirePermission('locations.manage'), validateBody(branchSchema), async (req, res) => {
    const { name } = req.body;
    try {
        const id = await locationsRepo.createLocation(req.auth.tenantId, name, req.body);
        res.json({ id, name });
    } catch (err) {
        if (locationsRepo.isUniqueViolation(err)) throw new HttpError(400, 'Location already exists');
        throw err;
    }
});

router.patch('/:id', requirePermission('locations.manage'), validateBody(branchSchema), async (req, res) => {
    const existing = await locationsRepo.getLocation(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Location not found');
    try {
        await locationsRepo.updateLocation(req.auth.tenantId, req.params.id, req.body);
    } catch (err) {
        if (locationsRepo.isUniqueViolation(err)) throw new HttpError(400, 'Location already exists');
        throw err;
    }
    res.json({ success: true });
});

router.delete('/:id', requirePermission('locations.manage'), async (req, res) => {
    const countRow = await locationsRepo.countUsersInLocation(req.auth.tenantId, req.params.id);
    if (countRow.count > 0) throw new HttpError(400, 'Cannot delete location with assigned employees');
    await locationsRepo.deleteLocation(req.auth.tenantId, req.params.id);
    res.json({ success: true });
});

module.exports = router;
