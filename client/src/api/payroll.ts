import api, { noCache } from './client';

// ---------------- salary components ----------------
export const getSalaryComponents = (activeOnly?: boolean) =>
    api.get('/payroll/components', { params: { activeOnly, ...noCache() } });
export const createSalaryComponent = (data: object) => api.post('/payroll/components', data);
export const updateSalaryComponent = (id: number | string, data: object) => api.patch(`/payroll/components/${id}`, data);
export const deleteSalaryComponent = (id: number | string) => api.delete(`/payroll/components/${id}`);

// ---------------- salary structures ----------------
export const getSalaryStructures = () => api.get('/payroll/structures', { params: noCache() });
export const createSalaryStructure = (data: object) => api.post('/payroll/structures', data);
export const updateSalaryStructure = (id: number | string, data: object) => api.patch(`/payroll/structures/${id}`, data);
export const deleteSalaryStructure = (id: number | string) => api.delete(`/payroll/structures/${id}`);
export const getStructureComponents = (id: number | string) => api.get(`/payroll/structures/${id}/components`, { params: noCache() });
export const setStructureComponents = (id: number | string, items: object[]) => api.put(`/payroll/structures/${id}/components`, { items });

// ---------------- salary grades ----------------
export const getSalaryGrades = () => api.get('/payroll/grades', { params: noCache() });
export const createSalaryGrade = (data: object) => api.post('/payroll/grades', data);
export const updateSalaryGrade = (id: number | string, data: object) => api.patch(`/payroll/grades/${id}`, data);
export const deleteSalaryGrade = (id: number | string) => api.delete(`/payroll/grades/${id}`);

// ---------------- employee salary assignments ----------------
export const getSalaryAssignments = (userId?: number | string) =>
    api.get('/payroll/assignments', { params: { userId, ...noCache() } });
export const createSalaryAssignment = (data: object) => api.post('/payroll/assignments', data);

// ---------------- payroll runs ----------------
export const getPayrollRuns = () => api.get('/payroll/runs', { params: noCache() });
export const createPayrollRun = (data: { period_year: number | string; period_month: number | string }) =>
    api.post('/payroll/runs', data);
export const getPayrollRun = (id: number | string) => api.get(`/payroll/runs/${id}`, { params: noCache() });
export const getPayrollRunLines = (id: number | string) => api.get(`/payroll/runs/${id}/lines`, { params: noCache() });
export const getPayrollRunLine = (id: number | string, lineId: number | string) =>
    api.get(`/payroll/runs/${id}/lines/${lineId}`, { params: noCache() });
export const processPayrollRun = (id: number | string) => api.post(`/payroll/runs/${id}/process`);
export const approvePayrollRun = (id: number | string) => api.post(`/payroll/runs/${id}/approve`);
export const payPayrollRun = (id: number | string) => api.post(`/payroll/runs/${id}/pay`);
export const cancelPayrollRun = (id: number | string) => api.post(`/payroll/runs/${id}/cancel`);
export const publishAllPayslips = (id: number | string) => api.post(`/payroll/runs/${id}/publish-all`);

// Payroll Export (Phase 13D) — responseType 'blob' so the axios auth
// interceptor still attaches the bearer token, same reasoning as
// reports.ts's exportReport (a plain <a href> navigation would 401).
export const exportPayrollRun = (id: number | string) => api.get(`/payroll/runs/${id}/export`, { responseType: 'blob' });

// ---------------- overtime ----------------
export const getOvertimeEntries = (status?: string, userId?: number | string) =>
    api.get('/payroll/overtime', { params: { status, userId, ...noCache() } });
export const createOvertimeEntry = (data: object) => api.post('/payroll/overtime', data);
export const updateOvertimeEntry = (id: number | string, data: object) => api.patch(`/payroll/overtime/${id}`, data);
export const updateOvertimeStatus = (id: number | string, data: object) => api.patch(`/payroll/overtime/${id}/status`, data);

// ---------------- payslips / payroll history ----------------
export const getPayslips = (params?: { userId?: number | string; year?: number; month?: number }) =>
    api.get('/payroll/payslips', { params: { ...params, ...noCache() } });
export const getPayslip = (runLineId: number | string) => api.get(`/payroll/payslips/${runLineId}`, { params: noCache() });
export const publishPayslip = (runLineId: number | string) => api.post(`/payroll/payslips/${runLineId}/publish`);
export const markPayslipViewed = (runLineId: number | string) => api.patch(`/payroll/payslips/${runLineId}/viewed`);

// ---------------- payroll reports / dashboard ----------------
export const getPayrollSummary = (year: number, month: number, departmentId?: number | string) =>
    api.get('/payroll/reports/summary', { params: { year, month, departmentId, ...noCache() } });
export const getPayrollComponentBreakdown = (year: number, month: number) =>
    api.get('/payroll/reports/component-breakdown', { params: { year, month, ...noCache() } });
export const getPayrollTrend = (months = 12) => api.get('/payroll/reports/trend', { params: { months, ...noCache() } });
