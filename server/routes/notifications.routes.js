const express = require('express');
const notificationsRepo = require('../repositories/notifications.repository');

const router = express.Router();

// Scoped to the authenticated caller only — the pre-Milestone-1 version took
// a :userId URL param with no ownership check, so any caller could read
// anyone's notifications by changing the URL. Notifications are inherently
// personal, so there's no "view others" permission at all here.
router.get('/', async (req, res) => {
    res.json(await notificationsRepo.listUnread(req.auth.tenantId, req.auth.userId));
});

router.post('/read', async (req, res) => {
    await notificationsRepo.markAllRead(req.auth.tenantId, req.auth.userId);
    res.json({ success: true });
});

module.exports = router;
