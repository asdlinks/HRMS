import api, { noCache } from './client';

export const getLeaves = (departmentId?: number | string, userId?: number | string) =>
    api.get('/leaves', { params: { departmentId, userId, ...noCache() } });
export const applyLeave = (data: object) => api.post('/leaves', data);
export const updateLeaveStatus = (id: number | string, data: object) => api.patch(`/leaves/${id}`, data);
