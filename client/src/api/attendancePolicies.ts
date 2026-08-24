import api, { noCache } from './client';

export const getAttendancePolicies = () => api.get('/attendance-policies', { params: noCache() });
export const createAttendancePolicy = (data: object) => api.post('/attendance-policies', data);
export const updateAttendancePolicy = (id: number | string, data: object) =>
    api.put(`/attendance-policies/${id}`, data);
export const deleteAttendancePolicy = (id: number | string) => api.delete(`/attendance-policies/${id}`);
export const assignAttendancePolicy = (userId: number | string, policyId: number | string | null) =>
    api.put(`/attendance-policies/assign/${userId}`, { policyId });
