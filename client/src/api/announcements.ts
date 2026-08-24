import api, { noCache } from './client';

export const getAnnouncements = () => api.get('/announcements', { params: noCache() });
export const createAnnouncement = (data: { title: string; body: string }) => api.post('/announcements', data);
export const deleteAnnouncement = (id: number | string) => api.delete(`/announcements/${id}`);
