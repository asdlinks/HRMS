import api, { noCache } from './client';

export interface CompanyProfile {
    id: number;
    name: string;
    slug: string;
    status: string;
    subscription_plan_name?: string | null;
    max_employees?: number | null;
    storage_limit_mb?: number | null;
    subscription_enabled_modules?: string[];
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
}

export const getCompanyProfile = () => api.get<CompanyProfile>('/company', { params: noCache() });
export const updateCompanyProfile = (data: Partial<CompanyProfile>) => api.put('/company', data);
