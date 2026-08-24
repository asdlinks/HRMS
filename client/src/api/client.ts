import axios, { type AxiosResponse } from 'axios';
import { BASE_PATH } from '../config/basePath';

const API_URL = import.meta.env.PROD ? `${BASE_PATH}/api` : 'http://localhost:5001/api';

// withCredentials lets the browser send/receive the httpOnly refresh-token
// cookie; the access token itself lives only in memory here (never
// localStorage) and is attached by the request interceptor below.
const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
});

let accessToken: string | null = null;

export interface SessionData {
    accessToken: string;
    [key: string]: unknown;
}

let onSessionRefreshed: (data: SessionData) => void = () => {};
let onSessionExpired: () => void = () => {};

export function setAccessToken(token: string | null) {
    accessToken = token;
}

// AuthContext registers these once on mount so this module can notify it
// when a silent refresh (triggered by a 401 mid-session) changes who's
// logged in, or when refreshing fails and the user needs to be logged out.
export function setSessionHandlers({
    onRefreshed,
    onExpired,
}: {
    onRefreshed?: (data: SessionData) => void;
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
                const { data } = await api.post<SessionData>('/auth/refresh');
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

// Cache-busting param appended to GETs that must never serve a stale
// browser/proxy-cached response (lists that change from other tabs/users).
export const noCache = () => ({ _t: Date.now() });

export default api;
