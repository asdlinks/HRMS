import api, { noCache } from './client';

export const getLocations = () => api.get('/locations', { params: noCache() });
export const addLocation = (data: object) => api.post('/locations', data);
export const updateLocation = (id: number | string, data: object) => api.patch(`/locations/${id}`, data);
export const deleteLocation = (id: number | string) => api.delete(`/locations/${id}`);
