export interface AuthUser {
    id: number;
    name: string;
    email: string;
    role: string;
    designation?: string;
    department_id?: number | null;
    department_name?: string;
    location_id?: number | null;
    profile_photo?: string | null;
    joining_date?: string;
    date_of_birth?: string | null;
    created_at?: string;
    [key: string]: unknown;
}

export interface LeaveAllocation {
    type: string;
    days: number;
}

export interface Settings {
    leave_allocations: LeaveAllocation[];
    attendance_link: string;
    attendance_rules?: AttendanceRules;
    [key: string]: unknown;
}

export interface AttendanceRules {
    weekly_off_days: number[]; // 0 = Sunday .. 6 = Saturday
    nth_saturdays_off: number[]; // e.g. [2] = 2nd Saturday off, [2,4] = 2nd & 4th
    // Legacy users.role codes that participate in attendance (Phase 12B).
    // Undefined on tenants that haven't touched this setting yet — treat as
    // "every role except super_admin" (today's behavior) at the call site.
    required_for_roles?: string[];
}

export interface MenuItem {
    id?: number;
    name: string;
    path: string;
    icon: string;
    permission?: string;
    anyPermission?: string[];
    sort_order?: number;
    is_active?: boolean;
    is_placeholder?: boolean;
}

export interface Role {
    id: number;
    name: string;
    description?: string;
    is_system?: boolean;
}

export interface Permission {
    id: number;
    code: string;
    description?: string;
    category?: string;
}

export interface ApiError {
    response?: {
        data?: { error?: string };
        status?: number;
    };
    message?: string;
}

export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
    const apiErr = err as ApiError;
    return apiErr?.response?.data?.error || apiErr?.message || fallback;
}
