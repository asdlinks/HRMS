import type { MenuItem } from '../types';

// Primary navigation is a two-level hierarchy: a small set of top-level
// "modules" shown in TopNav, each optionally expanding into a set of child
// pages shown in ContextSidebar (layout/ContextSidebar.tsx). Existing route
// paths are unchanged — this is purely a presentation grouping, so nothing
// bookmarked or deep-linked breaks.
//
// A module with no `children` is a direct-nav item (Dashboard, Reports,
// the placeholder future-modules): clicking it in TopNav navigates straight
// to `path` and no sidebar is shown for it.
//
// This is now the FALLBACK/seed list only. The DB-backed `menu_items` table
// (api/menu.ts's getMenuTree, fetched once at login into AuthContext as
// `navTree`) is the real source of navigation from Phase 7 onward — this
// static array is used only if a tenant's navTree ever comes back empty
// (fetch failure, or a brand-new tenant whose seed migration hasn't run).
// `key` is always the module's own `path` (unique per tenant either way),
// so getActiveModuleKey works identically against either source.
export interface NavModule {
    key: string;
    name: string;
    path: string;
    icon: string;
    permission?: string;
    anyPermission?: string[];
    is_placeholder?: boolean;
    children?: MenuItem[];
}

export const navModules: NavModule[] = [
    {
        key: '/dashboard',
        name: 'Dashboard',
        path: '/dashboard',
        icon: 'LayoutDashboard',
    },
    {
        key: '/employees',
        name: 'People',
        path: '/employees',
        icon: 'Users',
        anyPermission: ['users.view.team', 'users.view.all', 'departments.manage'],
        children: [
            { name: 'Department', path: '/department', icon: 'Building2', permission: 'departments.manage' },
            {
                name: 'Organization Structure', path: '/organization', icon: 'Network',
                anyPermission: ['designations.manage', 'employment-types.manage'],
            },
            { name: 'My Team', path: '/my-team', icon: 'UsersRound' },
        ],
    },
    {
        key: '/attendance',
        name: 'Time & Leave',
        path: '/attendance',
        icon: 'ClipboardList',
        children: [
            { name: 'Leaves', path: '/leaves', icon: 'CalendarClock' },
            { name: 'Leave Cancellation', path: '/cancellation', icon: 'XSquare' },
            { name: 'Holiday Calendar', path: '/holidays', icon: 'CalendarDays' },
            { name: 'Shifts', path: '/shifts', icon: 'Clock9', anyPermission: ['shifts.view', 'shifts.manage'] },
            { name: 'Attendance Policies', path: '/attendance/policies', icon: 'ShieldCheck', permission: 'attendance.policy.manage' },
            { name: 'Kiosk Devices', path: '/attendance/kiosk-devices', icon: 'MonitorSmartphone', permission: 'attendance.device.manage' },
            { name: 'Face Enrollment', path: '/attendance/face-enrollment', icon: 'ScanFace', permission: 'attendance.face.enroll' },
        ],
    },
    {
        key: '/reports',
        name: 'Reports',
        path: '/reports',
        icon: 'FileText',
        // Kept in sync with App.tsx's REPORTS_PERMISSIONS and
        // 034_reports_nav_admin_only.sql's menu_items.any_permission —
        // admin-only (.all-scope + flat org-wide permissions), so
        // managers/employees (only .team/.own) don't see this fallback item.
        anyPermission: [
            'reports.employee.view.all', 'reports.attendance.view.all', 'reports.leave.view.all', 'reports.payroll.view.all',
            'reports.organization.view', 'reports.compliance.view', 'reports.audit.view',
        ],
    },
    {
        key: '/payroll',
        name: 'Payroll',
        path: '/payroll',
        icon: 'Wallet',
        anyPermission: ['payroll.view.own', 'payroll.view.team', 'payroll.view.all'],
        children: [
            { name: 'Salary Components', path: '/payroll/components', icon: 'ListChecks', permission: 'payroll.components.manage' },
            { name: 'Salary Structures', path: '/payroll/structures', icon: 'FileStack', permission: 'payroll.structures.manage' },
            { name: 'Employee Assignments', path: '/payroll/assignments', icon: 'UserCog', permission: 'payroll.assign' },
            { name: 'Payroll Runs', path: '/payroll/runs', icon: 'Banknote', anyPermission: ['payroll.process', 'payroll.approve'] },
            { name: 'Overtime', path: '/payroll/overtime', icon: 'Clock', anyPermission: ['payroll.overtime.apply', 'payroll.overtime.approve', 'payroll.view.own'] },
            { name: 'Payslips', path: '/payroll/payslips', icon: 'Receipt', anyPermission: ['payroll.view.own', 'payroll.view.team', 'payroll.view.all'] },
            { name: 'Reports', path: '/payroll/reports', icon: 'BarChart3', permission: 'payroll.view.all' },
            { name: 'Settings', path: '/payroll/settings', icon: 'Settings2', anyPermission: ['payroll.settings.view', 'payroll.settings.manage'] },
        ],
    },
    {
        key: '/recruitment',
        name: 'Recruitment',
        path: '/recruitment',
        icon: 'UserSearch',
        permission: 'settings.manage',
        is_placeholder: true,
    },
    {
        key: '/performance',
        name: 'Performance',
        path: '/performance',
        icon: 'Target',
        permission: 'settings.manage',
        is_placeholder: true,
    },
    {
        key: '/assets',
        name: 'Assets',
        path: '/assets',
        icon: 'Boxes',
        permission: 'settings.manage',
        is_placeholder: true,
    },
    {
        key: '/company-documents',
        name: 'Documents',
        path: '/company-documents',
        icon: 'FolderOpen',
    },
    {
        key: '/settings',
        name: 'Settings',
        path: '/settings',
        icon: 'Settings',
    },
];

// A module's own root path (e.g. Settings' "/settings") can never also be a
// literal child row in the DB-backed menu_items table — it has a
// UNIQUE(tenant_id, path) constraint, and the parent module row already
// occupies that path. So a module's "default view" (what you land on by
// clicking the module in TopNav) has no way to appear in ContextSidebar's
// list of children unless synthesized at render time. withDefaultViewChild
// does that: if `children` doesn't already contain an entry for the
// module's own path, it prepends one — giving every module with children a
// way back to its landing page from within the sidebar itself, not just by
// re-clicking the (already-active) TopNav button.
const DEFAULT_VIEW_LABELS: Record<string, string> = {
    '/employees': 'Employees',
    '/attendance': 'Daily Check-In',
    '/payroll': 'Dashboard',
    '/settings': 'General Settings',
};

export function withDefaultViewChild(module: NavModule): NavModule {
    if (!module.children?.length) return module;
    if (module.children.some((c) => c.path === module.path)) return module;
    const defaultViewChild: MenuItem = {
        name: DEFAULT_VIEW_LABELS[module.path] ?? module.name,
        path: module.path,
        icon: module.icon,
        permission: module.permission,
        anyPermission: module.anyPermission,
    };
    return { ...module, children: [defaultViewChild, ...module.children] };
}

// Paths that belong to a module but aren't literally one of its children
// (e.g. a detail page reached by drilling into a list). Checked before the
// generic prefix match below.
const PATH_OVERRIDES: Record<string, string> = {
    '/profile': '/employees',
};

// `modules` defaults to the static fallback array so existing call sites
// that don't yet pass the DB-driven navTree keep working; TopNav/AppShell
// pass `navTree` from useAuth() explicitly once it has loaded.
export function getActiveModuleKey(pathname: string, modules: NavModule[] = navModules): string | undefined {
    for (const [prefix, moduleKey] of Object.entries(PATH_OVERRIDES)) {
        if (pathname.startsWith(prefix)) return moduleKey;
    }
    for (const mod of modules) {
        if (pathname === mod.path || pathname.startsWith(`${mod.path}/`)) return mod.key;
        if (mod.children?.some((c) => pathname === c.path || pathname.startsWith(`${c.path}/`))) return mod.key;
    }
    return undefined;
}
