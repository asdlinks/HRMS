import api from './platformAdminClient';

export interface SubscriptionPlan {
    id: number;
    name: string;
    max_employees: number | null;
    storage_limit_mb: number | null;
    support_level: string | null;
    trial_days: number | null;
    enabled_modules: string[];
    monthly_price: number | null;
    annual_price: number | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface SubscriptionPlanInput {
    name: string;
    max_employees?: number | null;
    storage_limit_mb?: number | null;
    support_level?: string | null;
    trial_days?: number | null;
    enabled_modules: string[];
    monthly_price?: number | null;
    annual_price?: number | null;
    is_active?: boolean;
}

export const listSubscriptionPlans = (activeOnly?: boolean) =>
    api.get<SubscriptionPlan[]>('/subscription-plans', { params: activeOnly ? { activeOnly: 'true' } : undefined });

export const getSubscriptionPlan = (id: number | string) => api.get<SubscriptionPlan>(`/subscription-plans/${id}`);

export const createSubscriptionPlan = (data: SubscriptionPlanInput) => api.post<SubscriptionPlan>('/subscription-plans', data);

export const updateSubscriptionPlan = (id: number | string, data: SubscriptionPlanInput) =>
    api.put<SubscriptionPlan>(`/subscription-plans/${id}`, data);
