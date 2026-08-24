// Mirrors server/utils/planModules.js's GATEABLE_MODULES — the only modules
// a Subscription Plan can gate on/off. Every other module (Dashboard, Time &
// Leave, Employees, Settings, Company Documents) stays always-on regardless
// of plan.
export const GATEABLE_MODULES: { code: string; label: string }[] = [
    { code: 'payroll', label: 'Payroll' },
    { code: 'reports', label: 'Reports' },
    { code: 'recruitment', label: 'Recruitment' },
    { code: 'performance', label: 'Performance' },
    { code: 'assets', label: 'Assets' },
];
