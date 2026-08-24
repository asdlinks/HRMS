const express = require('express');
const gradesRepo = require('../repositories/salaryGrades.repository');
const { requirePermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { salaryGradeSchema } = require('../schemas');
const { isUniqueViolation } = require('../db/sql');

const router = express.Router();

router.get('/', requirePermission('salary-grades.manage'), async (req, res) => {
    res.json(await gradesRepo.listGrades(req.auth.tenantId));
});

router.post('/', requirePermission('salary-grades.manage'), validateBody(salaryGradeSchema), async (req, res) => {
    try {
        const id = await gradesRepo.createGrade(req.auth.tenantId, req.body);
        res.json({ id });
    } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, `A grade with code "${req.body.code}" already exists`);
        throw err;
    }
});

router.patch('/:id', requirePermission('salary-grades.manage'), validateBody(salaryGradeSchema), async (req, res) => {
    const existing = await gradesRepo.getGrade(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Salary grade not found');
    await gradesRepo.updateGrade(req.auth.tenantId, req.params.id, req.body);
    res.json({ success: true });
});

router.delete('/:id', requirePermission('salary-grades.manage'), async (req, res) => {
    const existing = await gradesRepo.getGrade(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Salary grade not found');
    const referenced = await gradesRepo.isGradeReferenced(req.auth.tenantId, req.params.id);
    if (referenced) throw new HttpError(409, 'This grade is linked to a structure or employee assignment and cannot be deleted');
    await gradesRepo.deleteGrade(req.auth.tenantId, req.params.id);
    res.json({ success: true });
});

router.get('/:id/structures', requirePermission('salary-grades.manage'), async (req, res) => {
    res.json(await gradesRepo.listStructuresForGrade(req.auth.tenantId, req.params.id));
});

module.exports = router;
