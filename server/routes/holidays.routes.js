const express = require('express');
const holidaysRepo = require('../repositories/holidays.repository');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');
const { validateBody } = require('../middleware/validate');
const { holidayCreateSchema } = require('../schemas');

// Factory so the identical holidays / flexi_holidays logic isn't duplicated —
// mounted twice in routes/index.js, once per table.
function createHolidayRouter(table) {
    const router = express.Router();

    router.get('/', requireAnyPermission(['holidays.view', 'holidays.manage']), async (req, res) => {
        res.json(await holidaysRepo.list(table, req.auth.tenantId, req.query.locationId));
    });

    router.post('/', requirePermission('holidays.manage'), validateBody(holidayCreateSchema), async (req, res) => {
        const { name, date, location_id, location_ids } = req.body;
        const locationIds = Array.isArray(location_ids) && location_ids.length > 0 ? location_ids : [location_id || null];
        const count = await holidaysRepo.createForLocations(table, req.auth.tenantId, name, date, locationIds);
        res.json({ success: true, count });
    });

    router.delete('/:id', requirePermission('holidays.manage'), async (req, res) => {
        await holidaysRepo.remove(table, req.auth.tenantId, req.params.id);
        res.json({ success: true });
    });

    return router;
}

module.exports = { createHolidayRouter };
