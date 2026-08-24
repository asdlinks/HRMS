// The only modules a Subscription Plan can gate on/off (Phase 13E). Every
// other module (dashboard, time, people, settings, company-documents) stays
// always-on for every tenant regardless of plan — core product, not an
// add-on. Shared between the plan schema's validation and the menu_items
// update that actually applies a plan's enabled_modules.
const GATEABLE_MODULES = ['payroll', 'reports', 'recruitment', 'performance', 'assets'];

module.exports = { GATEABLE_MODULES };
