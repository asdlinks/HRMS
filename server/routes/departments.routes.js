const express = require('express');
const departmentsRepo = require('../repositories/departments.repository');
const { requirePermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { nameOnlySchema } = require('../schemas');

const router = express.Router();

router.get('/', async (req, res) => {
    res.json(await departmentsRepo.listDepartments(req.auth.tenantId));
});

router.post('/', requirePermission('departments.manage'), validateBody(nameOnlySchema), async (req, res) => {
    const { name } = req.body;
    try {
        const id = await departmentsRepo.createDepartment(req.auth.tenantId, name);
        res.json({ id, name });
    } catch (err) {
        if (departmentsRepo.isUniqueViolation(err)) throw new HttpError(400, 'Department already exists');
        throw err;
    }
});

router.delete('/:id', requirePermission('departments.manage'), async (req, res) => {
    const countRow = await departmentsRepo.countUsersInDepartment(req.auth.tenantId, req.params.id);
    if (countRow.count > 0) throw new HttpError(400, 'Cannot delete department with assigned employees');
    await departmentsRepo.deleteDepartment(req.auth.tenantId, req.params.id);
    res.json({ success: true });
});

module.exports = router;
