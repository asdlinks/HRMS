const express = require('express');
const plansRepo = require('../../repositories/subscriptionPlans.repository');
const { HttpError } = require('../../middleware/errorHandler');
const { validateBody } = require('../../middleware/validate');
const { subscriptionPlanSchema } = require('../../schemas');
const { isUniqueViolation } = require('../../db/sql');

const router = express.Router();

// GET /api/platform-admin/subscription-plans — every plan, including
// inactive ones (a Platform Admin managing the catalog needs to see and
// re-enable a disabled plan; only the Company Create/Assign pickers filter
// to active-only).
router.get('/', async (req, res) => {
    res.json(await plansRepo.listPlans(req.query.activeOnly === 'true'));
});

router.get('/:id', async (req, res) => {
    const plan = await plansRepo.getPlan(req.params.id);
    if (!plan) throw new HttpError(404, 'Subscription plan not found');
    res.json(plan);
});

router.post('/', validateBody(subscriptionPlanSchema), async (req, res) => {
    try {
        const id = await plansRepo.createPlan(req.body);
        res.status(201).json(await plansRepo.getPlan(id));
    } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, 'A subscription plan with this name already exists');
        throw err;
    }
});

router.put('/:id', validateBody(subscriptionPlanSchema), async (req, res) => {
    const plan = await plansRepo.getPlan(req.params.id);
    if (!plan) throw new HttpError(404, 'Subscription plan not found');
    try {
        await plansRepo.updatePlan(req.params.id, req.body);
    } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, 'A subscription plan with this name already exists');
        throw err;
    }
    res.json(await plansRepo.getPlan(req.params.id));
});

module.exports = router;
