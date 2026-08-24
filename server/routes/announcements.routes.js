const express = require('express');
const announcementsRepo = require('../repositories/announcements.repository');
const { requirePermission } = require('../middleware/authorize');
const { validateBody } = require('../middleware/validate');
const { announcementCreateSchema } = require('../schemas');

const router = express.Router();

// Readable by everyone (no permission gate) — the dashboard widget is
// visible to the whole tenant, only authoring is restricted.
router.get('/', async (req, res) => {
    res.json(await announcementsRepo.listActive(req.auth.tenantId));
});

router.post('/', requirePermission('announcements.manage'), validateBody(announcementCreateSchema), async (req, res) => {
    const id = await announcementsRepo.create(req.auth.tenantId, req.auth.userId, req.body);
    res.json({ success: true, id });
});

router.delete('/:id', requirePermission('announcements.manage'), async (req, res) => {
    await announcementsRepo.retire(req.auth.tenantId, req.params.id);
    res.json({ success: true });
});

module.exports = router;
