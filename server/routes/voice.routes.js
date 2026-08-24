const express = require('express');
const usersRepo = require('../repositories/users.repository');
const locationsRepo = require('../repositories/locations.repository');
const leavesRepo = require('../repositories/leaves.repository');
const holidaysRepo = require('../repositories/holidays.repository');
const { requirePermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { parseVoiceIntent } = require('../voice_parser');

const router = express.Router();

router.post('/intent', requirePermission('voice.use'), async (req, res) => {
    const { transcript } = req.body;
    if (!transcript) throw new HttpError(400, 'Transcript required');

    const { tenantId } = req.auth;
    const users = await usersRepo.listIdName(tenantId);
    const locations = await locationsRepo.listLocations(tenantId);

    // Hardcoded common leave categories since they are dynamically loaded from settings normally
    const leaveCategories = [
        { id: 'sick', name: 'Sick Leave' },
        { id: 'earned', name: 'Earned Leave' },
        { id: 'flexi', name: 'Flexi Holiday' },
    ];

    const context = { users, locations, leaveCategories };
    res.json(parseVoiceIntent(transcript, context));
});

router.post('/execute', requirePermission('voice.use'), async (req, res) => {
    const { tenantId } = req.auth;
    const { intent, entities } = req.body;

    if (intent === 'APPROVE_LEAVE' || intent === 'REJECT_LEAVE') {
        if (!req.auth.permissions.includes('leaves.approve')) {
            throw new HttpError(403, 'You do not have permission to perform this action');
        }
        if (!entities.user || !entities.user.id) throw new HttpError(400, 'Missing employee information');
        const newStatus = intent === 'APPROVE_LEAVE' ? 'Approved' : 'Rejected';

        const leave = await leavesRepo.findPendingLeaveForUser(tenantId, entities.user.id, entities.date);
        if (!leave) throw new HttpError(404, `No pending leave found for ${entities.user.name} on that date.`);

        await leavesRepo.updateLeaveStatus(tenantId, leave.id, newStatus);
        return res.json({ success: true, message: `Leave ${newStatus.toLowerCase()} successfully.` });
    }

    if (intent === 'ADD_HOLIDAY') {
        if (!req.auth.permissions.includes('holidays.manage')) {
            throw new HttpError(403, 'You do not have permission to perform this action');
        }
        if (!entities.date) throw new HttpError(400, 'Missing date for holiday');
        const locId = entities.location ? entities.location.id : null;
        await holidaysRepo.createForLocations('holidays', tenantId, 'Voice Generated Holiday', entities.date, [locId]);
        return res.json({ success: true, message: 'Holiday added successfully.' });
    }

    if (intent === 'ADD_LOCATION') {
        throw new HttpError(400, 'Adding unknown locations via voice is not fully supported yet. Please use UI.');
    }

    throw new HttpError(400, 'Unknown execution intent');
});

module.exports = router;
