import api, { noCache } from './client';

export const getWorkModes = () => api.get('/work-modes', { params: noCache() });
export const createWorkMode = (data: object) => api.post('/work-modes', data);
export const updateWorkMode = (id: number | string, data: object) => api.patch(`/work-modes/${id}`, data);
export const deleteWorkMode = (id: number | string) => api.delete(`/work-modes/${id}`);
export const assignDefaultWorkMode = (userId: number | string, workModeId: number | string | null) =>
    api.put(`/work-modes/assign/${userId}`, { workModeId });
