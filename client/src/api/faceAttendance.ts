import api, { noCache } from './client';

// Enrollment metadata only (no embedding) — matches the server, which never
// returns raw embeddings once stored.
export const getFaceEnrollments = (userId: number | string) =>
    api.get(`/face-attendance/enrollments/${userId}`, { params: noCache() });
export const enrollFace = (data: { userId: number | string; embedding: number[]; modelVersion: string }) =>
    api.post('/face-attendance/enroll', data);
export const deleteFaceEnrollment = (id: number | string) => api.delete(`/face-attendance/enroll/${id}`);
