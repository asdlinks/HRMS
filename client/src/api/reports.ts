import api, { noCache } from './client';

export interface ReportColumn {
    field: string;
    headerName: string;
}

export interface ReportChartConfig {
    type: 'bar' | 'line' | 'pie';
    xField?: string;
    yField?: string;
    nameField?: string;
    valueField?: string;
}

export interface ReportCatalogEntry {
    id: string;
    category: string;
    title: string;
    description?: string;
    filters: string[];
    columns: ReportColumn[];
    chart: ReportChartConfig | null;
    favoritable: boolean;
    stub: boolean;
    defaultSortField?: string;
}

export interface ReportDataParams {
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortDir?: 'asc' | 'desc';
    [filterKey: string]: unknown;
}

export interface ReportDataResult {
    rows: Record<string, unknown>[];
    total: number;
    page: number;
    pageSize: number;
    stub?: boolean;
    bespoke?: boolean;
}

export const getReportCatalog = () => api.get<ReportCatalogEntry[]>('/reports/catalog', { params: noCache() });

export interface DashboardSummary {
    totalEmployees?: number;
    presentToday?: number;
    absentToday?: number;
    onLeave?: number;
    lateArrivals?: number;
    overtimeHours?: number;
    monthlyPayrollCost?: number;
    upcomingBirthdays?: number;
    upcomingAnniversaries?: number;
    newJoiners?: number;
    employeesExited?: number;
    pendingApprovals?: number;
}

export const getDashboardSummary = () => api.get<DashboardSummary>('/reports/dashboard/summary', { params: noCache() });

export const getReportData = (reportId: string, params: ReportDataParams) =>
    api.get<ReportDataResult>(`/reports/${reportId}/data`, { params: { ...params, ...noCache() } });

// responseType 'blob' (not a raw <a href> navigation) so the axios auth
// interceptor still attaches the bearer token — a plain browser navigation
// to this URL would 401 since the access token only ever lives in memory.
export const exportReport = (reportId: string, format: 'csv' | 'xlsx' | 'pdf', params: ReportDataParams) =>
    api.get(`/reports/${reportId}/export`, { params: { ...params, format }, responseType: 'blob' });

export function downloadBlobResponse(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export const getFavoriteReportIds = () => api.get<string[]>('/reports/favorites', { params: noCache() });
export const addFavoriteReport = (reportId: string) => api.post(`/reports/favorites/${reportId}`);
export const removeFavoriteReport = (reportId: string) => api.delete(`/reports/favorites/${reportId}`);

export interface SavedReportFilter {
    id: number;
    report_id: string;
    name: string;
    filters: Record<string, unknown>;
    created_at: string;
}

export const getSavedFilters = (reportId?: string) =>
    api.get<SavedReportFilter[]>('/reports/saved-filters', { params: { reportId, ...noCache() } });
export const saveReportFilter = (data: { reportId: string; name: string; filters: Record<string, unknown> }) =>
    api.post('/reports/saved-filters', data);
export const deleteSavedFilter = (id: number) => api.delete(`/reports/saved-filters/${id}`);
