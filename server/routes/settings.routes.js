const express = require('express');
const settingsRepo = require('../repositories/settings.repository');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { settingsBulkSchema } = require('../schemas');

const router = express.Router();

// This is one generic key-value settings table shared by three unrelated
// admin surfaces (General Config, Attendance Rules, Payroll Settings), so
// the permission required depends on which keys the caller is actually
// writing — holding one of these must not grant silent write access to the
// others' keys.
const KEY_PERMISSION = {
    payroll_settings: 'payroll.settings.manage',
    attendance_rules: 'attendance.settings.manage',
    leave_allocations: 'general.settings.manage',
    attendance_link: 'general.settings.manage',
};

router.get('/', async (req, res) => {
    const rows = await settingsRepo.listSettings(req.auth.tenantId);
    const settingsObj = {};
    rows.forEach((r) => {
        try {
            settingsObj[r.key] = JSON.parse(r.value);
        } catch (e) {
            settingsObj[r.key] = r.value;
        }
    });
    res.json(settingsObj);
});

router.post('/bulk', validateBody(settingsBulkSchema), async (req, res) => {
    const perms = new Set(req.auth.permissions);
    for (const key of Object.keys(req.body)) {
        const required = KEY_PERMISSION[key];
        if (required && !perms.has(required)) throw new HttpError(403, `Missing permission to update "${key}"`);
    }
    await settingsRepo.bulkUpsert(req.auth.tenantId, req.body);
    res.json({ success: true });
});

module.exports = router;
