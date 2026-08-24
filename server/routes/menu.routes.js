const express = require('express');
const menuRepo = require('../repositories/menu.repository');
const { requirePermission } = require('../middleware/authorize');
const { validateBody } = require('../middleware/validate');
const { menuReplaceSchema } = require('../schemas');

const router = express.Router();

// Every authenticated user needs the current nav to render the sidebar;
// only menu.manage can change it. This is the raw, flat, editable list
// consumed by Settings > Menu Management — GET /tree below is what the
// actual TopNav/ContextSidebar render from.
router.get('/', async (req, res) => {
    res.json(await menuRepo.listMenuItems(req.auth.tenantId));
});

router.get('/tree', async (req, res) => {
    res.json(await menuRepo.getMenuTree(req.auth.tenantId, req.auth.permissions));
});

router.put('/', requirePermission('menu.manage'), validateBody(menuReplaceSchema), async (req, res) => {
    await menuRepo.replaceMenuItems(req.auth.tenantId, req.body.items);
    res.json({ success: true });
});

module.exports = router;
