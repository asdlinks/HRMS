import api, { noCache } from './client';

export const getRoles = () => api.get('/roles', { params: noCache() });
export const getPermissions = () => api.get('/roles/permissions', { params: noCache() });
export const updateRolePermissions = (roleId: number | string, permissionCodes: string[]) =>
    api.put(`/roles/${roleId}/permissions`, { permissionCodes });
export const createRole = (data: { name: string; description?: string; cloneFromRoleId?: number | string | null }) =>
    api.post('/roles', data);
export const deleteRole = (roleId: number | string) => api.delete(`/roles/${roleId}`);
export const assignUserRoles = (userId: number | string, roleIds: Array<number | string>) =>
    api.put(`/users/${userId}/roles`, { roleIds });
