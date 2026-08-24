// Re-exports every domain module so existing `import { getX } from '../api'`
// call sites keep working after the split from one flat api/index.js file.
export { default as apiClient, setAccessToken, setSessionHandlers } from './client';
export * from './auth';
export * from './users';
export * from './leaves';
export * from './holidays';
export * from './departments';
export * from './locations';
export * from './orgLookups';
export * from './notifications';
export * from './settings';
export * from './attendance';
export * from './reports';
export * from './voice';
export * from './roles';
export * from './menu';
export * from './announcements';
export * from './payroll';
export * from './attendancePolicies';
export * from './kioskDevices';
export * from './faceAttendance';
export * from './company';
export * from './shifts';
export * from './workModes';
export * from './companyDocuments';
