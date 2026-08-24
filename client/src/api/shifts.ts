import api, { noCache } from './client';

export const getShifts = () => api.get('/shifts', { params: noCache() });
export const createShift = (data: object) => api.post('/shifts', data);
export const updateShift = (id: number | string, data: object) => api.patch(`/shifts/${id}`, data);
export const deleteShift = (id: number | string) => api.delete(`/shifts/${id}`);

export const getShiftAssignments = (userId: number | string) =>
    api.get('/shifts/assignments', { params: { userId, ...noCache() } });
export const createShiftAssignment = (data: object) => api.post('/shifts/assignments', data);
