// Design tokens for the HRMS. Carries the existing indigo brand identity
// (--primary-color: #4f46e5 in the old index.css) into a real MUI theme
// instead of a parallel CSS-variable system.
export const brand = {
    indigo50: '#eef2ff',
    indigo100: '#e0e7ff',
    indigo400: '#818cf8',
    indigo500: '#6366f1',
    indigo600: '#4f46e5',
    indigo700: '#4338ca',
    indigo900: '#312e81',
};

export const neutral = {
    0: '#ffffff',
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
};

export const semantic = {
    success: '#16a34a',
    successBg: '#f0fdf4',
    warning: '#d97706',
    warningBg: '#fffbeb',
    error: '#dc2626',
    errorBg: '#fef2f2',
    info: '#0284c7',
    infoBg: '#f0f9ff',
};

export const radius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
};

// Single source of truth for the tone any given status string maps to.
// Consumed by StatusBadge and any page rendering leave/attendance/request
// state (AttendancePage day cells, LeavesPage drawer, EmployeeProfilePage
// icons) so no page hardcodes its own hex for "approved" / "absent" / etc.
export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export const statusToneColors: Record<StatusTone, { main: string; bg: string; bgDark: string }> = {
    success: { main: semantic.success, bg: semantic.successBg, bgDark: 'rgba(22,163,74,0.16)' },
    warning: { main: semantic.warning, bg: semantic.warningBg, bgDark: 'rgba(217,119,6,0.16)' },
    error: { main: semantic.error, bg: semantic.errorBg, bgDark: 'rgba(220,38,38,0.16)' },
    info: { main: semantic.info, bg: semantic.infoBg, bgDark: 'rgba(2,132,199,0.16)' },
    neutral: { main: neutral[500], bg: neutral[100], bgDark: 'rgba(148,163,184,0.16)' },
};

export const STATUS_TONE_MAP: Record<string, StatusTone> = {
    approved: 'success',
    active: 'success',
    present: 'success',
    completed: 'success',
    paid: 'success',
    pending: 'warning',
    'cancellation pending': 'warning',
    'in progress': 'warning',
    processing: 'warning',
    half_day: 'warning',
    draft: 'neutral',
    computed: 'info',
    excluded: 'neutral',
    rejected: 'error',
    cancelled: 'error',
    absent: 'error',
    inactive: 'error',
    holiday: 'info',
    flexi: 'info',
    weekoff: 'neutral',
    'week off': 'neutral',
};

export function toneForStatus(status: string | undefined | null): StatusTone {
    const key = (status || '').toLowerCase().replace(/-/g, '_').replace(/_/g, ' ');
    return STATUS_TONE_MAP[key] ?? 'neutral';
}

// Ordered categorical palette for charts (recharts) — derived from the
// brand indigo family plus the semantic accents so dashboard charts read as
// part of the same system rather than library-default colors.
export const chartPalette = [
    brand.indigo600,
    semantic.info,
    semantic.success,
    semantic.warning,
    brand.indigo400,
    semantic.error,
    neutral[400],
];
