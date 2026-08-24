const express = require('express');
const { authenticatePlatformAdmin } = require('../../middleware/platformAdminAuth');

const authRoutes = require('./auth.routes');
const companiesRoutes = require('./companies.routes');
const dashboardRoutes = require('./dashboard.routes');
const systemHealthRoutes = require('./system-health.routes');
const subscriptionPlansRoutes = require('./subscriptionPlans.routes');

const router = express.Router();

// Login/refresh/logout are unauthenticated by definition; change-password
// applies authenticatePlatformAdmin itself within auth.routes.js — same
// pattern as the HRMS's own routes/index.js + auth.routes.js split.
router.use('/auth', authRoutes);

// Everything below requires a valid Platform Admin access token. This never
// passes through the HRMS's own `authenticate`/`requireActiveTenant` chain
// (routes/index.js) — a platform admin isn't a tenant-scoped principal.
router.use(authenticatePlatformAdmin);

router.use('/companies', companiesRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/system-health', systemHealthRoutes);
router.use('/subscription-plans', subscriptionPlansRoutes);

module.exports = router;
