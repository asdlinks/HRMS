import api, { noCache } from './client';

export const getUsers = (departmentId?: number | string) => api.get('/users', { params: { departmentId, ...noCache() } });
export const getUserById = (id: number | string) => api.get(`/users/${id}`, { params: noCache() });
export const createUser = (data: object) => api.post('/users', data);
export const updateUser = (id: number | string, data: object) => api.patch(`/users/${id}`, data);
export const deleteUser = (id: number | string) => api.delete(`/users/${id}`);
export const adminResetPassword = (id: number | string, data: object) =>
    api.patch(`/users/${id}/reset-password`, data);
export const setUserStatus = (id: number | string, status: 'active' | 'disabled' | 'exited', exitDate?: string | null) =>
    api.patch(`/users/${id}/status`, { status, exit_date: exitDate });
export const unlockUser = (id: number | string) => api.patch(`/users/${id}/unlock`);

// Aadhaar/PAN — Identity Information (Phase 13A). Deliberately its own
// endpoint (users.pii.manage), never sent through updateUser.
export const updateUserPii = (id: number | string, data: { aadhaar_number?: string | null; pan_number?: string | null }) =>
    api.patch(`/users/${id}/pii`, data);

// Banking Information (Phase 13B) — moved here from the salary assignment;
// its own endpoint (payroll.assign), never sent through updateUser.
export const updateUserBanking = (id: number | string, data: {
    bank_account_holder_name?: string | null; bank_name?: string | null; bank_branch?: string | null;
    bank_account_number?: string | null; bank_ifsc_code?: string | null; bank_upi_id?: string | null;
}) => api.patch(`/users/${id}/banking`, data);
