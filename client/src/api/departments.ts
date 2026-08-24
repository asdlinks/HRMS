import api, { noCache } from './client';

export const getDepartments = () => api.get('/departments', { params: noCache() });
export const addDepartment = (data: object) => api.post('/departments', data);
export const deleteDepartment = (id: number | string) => api.delete(`/departments/${id}`);
