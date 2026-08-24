const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const kioskDevicesRepo = require('../repositories/kioskDevices.repository');
const kioskAppConfigRepo = require('../repositories/kioskAppConfig.repository');
const { requirePermission } = require('../middleware/authorize');
const { validateBody } = require('../middleware/validate');
const { HttpError } = require('../middleware/errorHandler');
const { kioskDeviceCreateSchema, kioskAppConfigSchema, kioskDeviceStatusSchema } = require('../schemas');

const router = express.Router();

function generateDeviceKey() {
    return crypto.randomBytes(24).toString('base64url');
}

router.get('/', requirePermission('attendance.device.manage'), async (req, res) => {
    res.json(await kioskDevicesRepo.listDevices(req.auth.tenantId));
});

// The raw device key is only ever returned here (create) and on rotate —
// same one-time-reveal pattern as any other generated secret. Only its
// bcrypt hash is persisted.
router.post('/', requirePermission('attendance.device.manage'), validateBody(kioskDeviceCreateSchema), async (req, res) => {
    const { tenantId } = req.auth;
    const { device_name: deviceName, location_id: locationId } = req.body;

    const deviceKey = generateDeviceKey();
    const deviceKeyHash = await bcrypt.hash(deviceKey, 10);
    const id = await kioskDevicesRepo.createDevice(tenantId, { deviceName, locationId, deviceKeyHash });

    res.json({ id, deviceName, deviceKey });
});

router.post('/:id/rotate-key', requirePermission('attendance.device.manage'), async (req, res) => {
    const { tenantId } = req.auth;
    const id = parseInt(req.params.id, 10);
    const device = await kioskDevicesRepo.getDevice(tenantId, id);
    if (!device) throw new HttpError(404, 'Kiosk device not found');

    const deviceKey = generateDeviceKey();
    const deviceKeyHash = await bcrypt.hash(deviceKey, 10);
    await kioskDevicesRepo.rotateDeviceKey(tenantId, id, deviceKeyHash);

    res.json({ id, deviceKey });
});

// GET/PUT /api/kiosk-devices/config — the kiosk PWA's deployed URL. Gated by
// the same attendance.device.manage permission as the rest of this router
// and NEVER exposed via the general /api/settings blob, which every
// authenticated user (including employees) can read.
router.get('/config', requirePermission('attendance.device.manage'), async (req, res) => {
    const config = await kioskAppConfigRepo.getKioskAppConfig(req.auth.tenantId);
    res.json({ kioskAppUrl: config?.kiosk_app_url ?? null });
});

router.put('/config', requirePermission('attendance.device.manage'), validateBody(kioskAppConfigSchema), async (req, res) => {
    await kioskAppConfigRepo.setKioskAppUrl(req.auth.tenantId, req.body.kioskAppUrl);
    res.json({ success: true });
});

router.put('/:id/status', requirePermission('attendance.device.manage'), validateBody(kioskDeviceStatusSchema), async (req, res) => {
    await kioskDevicesRepo.setDeviceStatus(req.auth.tenantId, parseInt(req.params.id, 10), req.body.status);
    res.json({ success: true });
});

module.exports = router;
