import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { config } from '../config';

// Mirrors client/src/api/client.ts, adapted for the DEVICE auth flow:
//   - the access token lives ONLY in memory (never localStorage/IndexedDB)
//   - the device refresh token is an httpOnly cookie the browser sends
//     automatically because of withCredentials
//   - a reactive 401 interceptor silently rotates via /auth/kiosk-refresh
//     (NOT /auth/refresh — that's the human flow) and retries the call once
const api = axios.create({
  baseURL: config.apiBase,
  withCredentials: true,
});

let accessToken: string | null = null;
let onRefreshed: (session: { accessToken: string; device: unknown }) => void = () => {};
let onExpired: () => void = () => {};

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionHandlers(handlers: {
  onRefreshed?: (session: { accessToken: string; device: unknown }) => void;
  onExpired?: () => void;
}): void {
  onRefreshed = handlers.onRefreshed || onRefreshed;
  onExpired = handlers.onExpired || onExpired;
}

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

api.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (error) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthRoute = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && original && !isAuthRoute && !original._retry) {
      original._retry = true;
      try {
        const { data } = await api.post<{ accessToken: string; device: unknown }>('/auth/kiosk-refresh');
        accessToken = data.accessToken;
        onRefreshed(data);
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch (refreshErr) {
        accessToken = null;
        onExpired();
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  },
);

// A rejected request with no `.response` is a transport/network failure (the
// server was never reached) — as opposed to an HTTP error the server returned.
// The offline queue keys its retry decisions off this distinction.
export function isNetworkError(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'isAxiosError' in err && !(err as { response?: unknown }).response;
}

export default api;
