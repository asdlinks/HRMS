import api, { noCache } from './client';

// Shared shape for the flat org-structure lookup modules — same request
// shape as departments/locations, just with the extra optional fields
// (code/description/is_active) 031_org_structure.sql added.
export const getDesignations = () => api.get('/designations', { params: noCache() });
export const createDesignation = (data: object) => api.post('/designations', data);
export const updateDesignation = (id: number | string, data: object) => api.patch(`/designations/${id}`, data);
export const deleteDesignation = (id: number | string) => api.delete(`/designations/${id}`);

export const getEmploymentTypes = () => api.get('/employment-types', { params: noCache() });
export const createEmploymentType = (data: object) => api.post('/employment-types', data);
export const updateEmploymentType = (id: number | string, data: object) => api.patch(`/employment-types/${id}`, data);
export const deleteEmploymentType = (id: number | string) => api.delete(`/employment-types/${id}`);
