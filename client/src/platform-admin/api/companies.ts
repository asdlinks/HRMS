import api from './platformAdminClient';

export interface Company {
    id: number;
    name: string;
    slug: string;
    status: 'trial' | 'active' | 'suspended' | 'cancelled';
    subscription_plan_id: number | null;
    subscription_plan_name?: string | null;
    max_employees?: number | null;
    storage_limit_mb?: number | null;
    subscription_enabled_modules?: string[];
    billing_email: string | null;
    timezone: string;
    logo_url?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    postal_code?: string | null;
    phone?: string | null;
    contact_email?: string | null;
    website?: string | null;
    currency: string;
    date_format: string;
    financial_year_start_month: number;
    theme_primary_color?: string | null;
    theme_secondary_color?: string | null;
    renewal_date?: string | null;
    expiry_date?: string | null;
    payment_status?: string | null;
    primary_admin_user_id: number | null;
    created_at: string;
    updated_at: string;
    // Cross-tenant aggregates joined in by the server — counts/timestamps
    // only, never row-level HR data (Part 10).
    org_admin_name?: string | null;
    employee_count?: number;
    active_user_count?: number;
    last_login_at?: string | null;
}

export interface SubscriptionAssignInput {
    subscription_plan_id: number | string;
}

export interface DashboardKpis {
    totalCompanies: number;
    activeCompanies: number;
    trialCompanies: number;
    suspendedCompanies: number;
    newCompaniesThisMonth: number;
    totalEmployees: number;
    totalActiveUsers: number;
    newEmployeesThisMonth: number;
}

export interface TenantHealth {
    checks: {
        companyProfileCompleted: boolean;
        departmentsConfigured: boolean;
        employeesAdded: boolean;
        holidaysConfigured: boolean;
        attendanceConfigured: boolean;
        payrollConfigured: boolean;
        faceAttendanceConfigured: boolean;
        companyDocumentsPresent: boolean;
    };
    setupCompletionPercent: number;
}

export interface TenantUsage {
    employeeCount: number;
    activeUserCount: number;
    lastLoginAt: string | null;
    documentsUploaded: number;
    storageUsedBytes: number;
    lastPayrollRunAt: string | null;
    lastAttendanceSyncAt: string | null;
    storageLimitMb: number | null;
}

export interface SystemHealth {
    database: { status: string; latencyMs: number };
    api: { status: string; uptimeSeconds: number };
    backgroundJobs: { status: string; message: string; failedJobs: number };
    storageUsedBytes: number;
    activeTenants: number;
}

export interface CompanyListResult {
    items: Company[];
    total: number;
    page: number;
    pageSize: number;
}

export interface CreateCompanyInput {
    name: string;
    slug: string;
    timezone?: string;
    phone: string;
    billing_email?: string;
    adminName: string;
    adminEmail: string;
    roleTemplate?: 'simple' | 'enterprise';
    subscription_plan_id: number;
    status?: 'trial' | 'active';
}

export interface CreateCompanyResult {
    tenantId: number;
    adminUserId: number;
    adminEmail: string;
    generatedPassword: string;
}

export interface ProvisioningLog {
    id: number;
    tenant_id: number;
    requested_company_name: string;
    requested_slug: string;
    status: 'success' | 'failed';
    steps: Array<{ step: string; status: string; detail?: unknown }>;
    error_message: string | null;
    started_at: string;
    finished_at: string;
    created_at: string;
    platform_admin_name: string;
    platform_admin_email: string;
}

export const listCompanies = (params: { search?: string; status?: string; page?: number; pageSize?: number }) =>
    api.get<CompanyListResult>('/companies', { params });

export const getCompany = (id: number | string) => api.get<Company>(`/companies/${id}`);

export const createCompany = (data: CreateCompanyInput) => api.post<CreateCompanyResult>('/companies', data);

export const updateCompany = (id: number | string, data: Partial<Company>) => api.put<Company>(`/companies/${id}`, data);

export const activateCompany = (id: number | string) => api.post<Company>(`/companies/${id}/activate`);

export const suspendCompany = (id: number | string) => api.post<Company>(`/companies/${id}/suspend`);

export const resetAdminPassword = (id: number | string) =>
    api.post<{ adminEmail: string; newPassword: string }>(`/companies/${id}/reset-admin-password`);

export const getProvisioningHistory = (id: number | string) => api.get<ProvisioningLog[]>(`/companies/${id}/provisioning-history`);

export const updateSubscription = (id: number | string, data: SubscriptionAssignInput) =>
    api.put<Company>(`/companies/${id}/subscription`, data);

export const getTenantHealth = (id: number | string) => api.get<TenantHealth>(`/companies/${id}/health`);

export const getTenantUsage = (id: number | string) => api.get<TenantUsage>(`/companies/${id}/usage`);

export const getDashboardKpis = () => api.get<DashboardKpis>('/dashboard');

export const getSystemHealth = () => api.get<SystemHealth>('/system-health');
