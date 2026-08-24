const express = require('express');
const systemHealthRepo = require('../../repositories/platformSystemHealth.repository');

const router = express.Router();

// GET /api/platform-admin/system-health — Part 8.
router.get('/', async (req, res) => {
    res.json(await systemHealthRepo.getSystemHealth());
});

module.exports = router;
