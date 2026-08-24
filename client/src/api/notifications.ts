import api, { noCache } from './client';

export const getNotifications = () => api.get('/notifications', { params: noCache() });
export const markNotificationsRead = () => api.post('/notifications/read');
