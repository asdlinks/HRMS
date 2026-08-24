import api, { noCache } from './client';

export const getMonthlyAttendance = (params: object) =>
    api.get('/attendance/monthly', { params: { ...params, ...noCache() } });
export const getDailyAttendance = () => api.get('/attendance/today', { params: noCache() });
export const checkIn = (data: object) => api.post('/attendance/check-in', data);

// The caller's own assigned attendance policy — drives which check-in
// methods TodayAttendanceCard offers (Face is always kiosk-only).
export const getMyAttendancePolicy = () => api.get('/attendance/my-policy', { params: noCache() });
export const getTodayAttendanceStatus = () => api.get('/attendance/today-status', { params: noCache() });
export const selectWorkMode = (data: object) => api.post('/attendance/work-mode/select', data);
export const takeAttendanceBreak = (data: object) => api.post('/attendance/break', data);
export const resumeAttendanceFromBreak = (data: object) => api.post('/attendance/resume', data);
export const checkOutAttendance = (data: object) => api.post('/attendance/check-out', data);
