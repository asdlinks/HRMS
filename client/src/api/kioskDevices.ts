import api, { noCache } from './client';

export const getKioskDevices = () => api.get('/kiosk-devices', { params: noCache() });
export const createKioskDevice = (data: object) => api.post('/kiosk-devices', data);
export const rotateKioskDeviceKey = (id: number | string) => api.post(`/kiosk-devices/${id}/rotate-key`);
export const setKioskDeviceStatus = (id: number | string, status: 'Active' | 'Revoked') =>
    api.put(`/kiosk-devices/${id}/status`, { status });

// Admin-only kiosk app URL — deliberately its own endpoint (never part of
// the shared /settings blob, which every authenticated user can read).
export const getKioskAppConfig = () => api.get('/kiosk-devices/config', { params: noCache() });
export const updateKioskAppUrl = (kioskAppUrl: string | null) => api.put('/kiosk-devices/config', { kioskAppUrl });
