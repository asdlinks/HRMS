import api from './client';

export const login = (tenantCode: string, email: string, password: string) =>
    api.post('/auth/login', { tenantCode, email, password });
export const refreshSession = () => api.post('/auth/refresh');
export const logout = () => api.post('/auth/logout');
export const changePassword = (data: { currentPassword: string; newPassword: string }) =>
    api.post('/auth/change-password', data);
