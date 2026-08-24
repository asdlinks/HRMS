import api, { noCache } from './client';

export const getHolidays = (locationId?: number | string) => api.get('/holidays', { params: { locationId, ...noCache() } });
export const getFlexiHolidays = (locationId?: number | string) => api.get('/flexi-holidays', { params: { locationId, ...noCache() } });
export const addHoliday = (data: object) => api.post('/holidays', data);
export const addFlexiHoliday = (data: object) => api.post('/flexi-holidays', data);
export const deleteHoliday = (id: number | string) => api.delete(`/holidays/${id}`);
export const deleteFlexiHoliday = (id: number | string) => api.delete(`/flexi-holidays/${id}`);
