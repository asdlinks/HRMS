import api, { type PlatformAdminSessionData } from './platformAdminClient';

export const login = (email: string, password: string) =>
    api.post<PlatformAdminSessionData>('/auth/login', { email, password });
export const refreshSession = () => api.post<PlatformAdminSessionData>('/auth/refresh');
export const logout = () => api.post('/auth/logout');
export const changePassword = (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword });
