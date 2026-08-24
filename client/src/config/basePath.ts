// The production build is served under a path prefix, configurable at build
// time with VITE_BASE_PATH (e.g. VITE_BASE_PATH=/leave_management for a
// deployment nested under that IIS path). Defaults to the site root.
export const BASE_PATH = import.meta.env.VITE_BASE_PATH ?? '';
