import api, { noCache } from './client';

// Server rows are snake_case (menu_items table columns); the admin-facing
// MenuItem type in ../types is camelCase — callers convert between the two
// (see SettingsPage's Menu Management tab) rather than this module papering
// over the mismatch with a lossy shared type.
export const getMenuItems = () => api.get('/menu', { params: noCache() });
export const updateMenuItems = (items: object[]) => api.put('/menu', { items });

// The permission-filtered, nested tree that actually drives TopNav /
// ContextSidebar — see layout/navIcons.ts and config/menuConfig.ts for how
// it's consumed and the static fallback used before this resolves.
export const getMenuTree = () => api.get('/menu/tree', { params: noCache() });
