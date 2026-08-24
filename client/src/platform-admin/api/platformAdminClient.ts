import axios, { type AxiosResponse } from 'axios';
import { BASE_PATH } from '../../config/basePath';

// Deliberately its own axios instance — not a re-export of client/src/api/client.ts.
// Different base path, different refresh endpoint/cookie, and its own
// module-level session state, so an HRMS session and a Platform Admin
// session never interfere with each other in the same browser tab.
const API_URL = import.meta.env.PROD ? `${BASE_PATH}/api/platform-admin` : 'http://localhost:5001/api/platform-admin';

const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
});

let accessToken: string | null = null;

export interface PlatformAdminSessionData {
    accessToken: string;
    admin: { id: number; name: string; email: string };
}

let onSessionRefreshed: (data: PlatformAdminSessionData) => void = () => {};
let onSessionExpired: () => void = () => {};

export function setAccessToken(token: string | null) {
    accessToken = token;
}

export function setSessionHandlers({
    onRefreshed,
    onExpired,
}: {
    onRefreshed?: (data: PlatformAdminSessionData) => void;
    onExpired?: () => void;
}) {
    onSessionRefreshed = onRefreshed || onSessionRefreshed;
    onSessionExpired = onExpired || onSessionExpired;
}

api.interceptors.request.use((config) => {
    if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
});

api.interceptors.response.use(
    (res: AxiosResponse) => res,
    async (error) => {
        const original = error.config;
        const isAuthRoute = original?.url?.startsWith('/auth/');
        if (error.response?.status === 401 && !isAuthRoute && !original._retry) {
            original._retry = true;
            try {
                const { data } = await api.post<PlatformAdminSessionData>('/auth/refresh');
                accessToken = data.accessToken;
                onSessionRefreshed(data);
                original.headers.Authorization = `Bearer ${accessToken}`;
                return api(original);
            } catch (refreshErr) {
                accessToken = null;
                onSessionExpired();
                return Promise.reject(refreshErr);
            }
        }
        return Promise.reject(error);
    },
);

export default api;
