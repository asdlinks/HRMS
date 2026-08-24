import api, { noCache } from './client';

export const getSettings = () => api.get('/settings', { params: noCache() });
export const updateSettings = (data: object) => api.post('/settings/bulk', data);
