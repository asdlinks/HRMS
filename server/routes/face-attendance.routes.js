const express = require('express');
const bcrypt = require('bcryptjs');
const faceEnrollmentsRepo = require('../repositories/faceEnrollments.repository');
const kioskDevicesRepo = require('../repositories/kioskDevices.repository');
const attendanceEngine = require('../services/attendanceEngine.service');
const { requirePermission, requireDevice, requireHuman } = require('../middleware/authorize');
const { validateBody } = require('../middleware/validate');
const { HttpError } = require('../middleware/errorHandler');
const { faceEnrollSchema, faceCheckInSchema } = require('../schemas');

const router = express.Router();

// The kiosk's own match threshold (default euclidean distance 0.55, see
// face-attendance/src/config.ts) is a client-side localStorage value an
// admin or a tampered device can loosen — this is the independent,
// non-client-controllable floor the server enforces regardless of what the
// kiosk decided locally. 0.45 matches the kiosk's own honest default
// (confidence = 1 - distance) so a well-behaved kiosk is never affected.
const MIN_FACE_CONFIDENCE = Number(process.env.FACE_MIN_CONFIDENCE) || 0.45;

// ---------------- enrollment (human/admin side) ----------------

router.get('/enrollments/:userId', requireHuman(), requirePermission('attendance.face.enroll'), async (req, res) => {
    const enrollments = await faceEnrollmentsRepo.listForUser(req.auth.tenantId, parseInt(req.params.userId, 10));
    res.json(enrollments.map(({ embedding, ...rest }) => rest)); // embeddings are large + only needed by the kiosk sync
});

router.post('/enroll', requireHuman(), requirePermission('attendance.face.enroll'), validateBody(faceEnrollSchema), async (req, res) => {
    const { tenantId } = req.auth;
    const { userId, embedding, modelVersion } = req.body;
    const id = await faceEnrollmentsRepo.enroll(tenantId, parseInt(userId, 10), { embedding, modelVersion });
    res.json({ id });
});

router.delete('/enroll/:id', requireHuman(), requirePermission('attendance.face.enroll'), async (req, res) => {
    await faceEnrollmentsRepo.deactivate(req.auth.tenantId, parseInt(req.params.id, 10));
    res.json({ success: true });
});

// ---------------- kiosk device side ----------------

// GET /api/face-attendance/embeddings/sync — the kiosk PWA's offline cache
// refresh. Device-only: a kiosk never gets to see who's who any other way,
// and a human token (no deviceId) is rejected by requireDevice regardless
// of what permissions it happens to carry.
router.get('/embeddings/sync', requireDevice(), requirePermission('attendance.face.sync'), async (req, res) => {
    const { tenantId, deviceId } = req.auth;
    const enrollments = await faceEnrollmentsRepo.listActiveForTenant(tenantId);
    await kioskDevicesRepo.touchLastSync(deviceId);
    res.json({
        syncedAt: new Date().toISOString(),
        enrollments: enrollments.map((e) => ({
            userId: e.user_id,
            embedding: JSON.parse(e.embedding),
            modelVersion: e.model_version,
        })),
    });
});

// POST /api/face-attendance/check-in — the kiosk has already matched the
// face locally against the synced embedding set; this call only records the
// resulting attendance event. idempotencyKey is required (not optional)
// because this is exactly the call the offline queue replays on reconnect.
router.post('/check-in', requireDevice(), requirePermission('attendance.checkin.kiosk'), validateBody(faceCheckInSchema), async (req, res) => {
    const { tenantId, deviceId } = req.auth;
    const { userId, date, confidence, idempotencyKey } = req.body;

    if (confidence < MIN_FACE_CONFIDENCE) {
        throw new HttpError(422, 'Face match confidence too low — please try again or use manual check-in');
    }

    const result = await attendanceEngine.recordCheckIn({
        tenantId,
        userId: parseInt(userId, 10),
        method: 'Face',
        workMode: 'Office',
        date,
        deviceId,
        confidence,
        idempotencyKey,
    });
    res.json(result);
});

module.exports = router;
