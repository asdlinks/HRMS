import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as api from '../api/platformAdminClient';
import * as authApi from '../api/auth';

interface PlatformAdmin {
    id: number;
    name: string;
    email: string;
}

interface PlatformAdminAuthContextValue {
    admin: PlatformAdmin | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const PlatformAdminAuthContext = createContext<PlatformAdminAuthContextValue | null>(null);

export function PlatformAdminAuthProvider({ children }: { children: ReactNode }) {
    const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
    const [loading, setLoading] = useState(true);

    const applySession = useCallback((data: api.PlatformAdminSessionData) => {
        api.setAccessToken(data.accessToken);
        setAdmin(data.admin);
    }, []);

    const clearSession = useCallback(() => {
        api.setAccessToken(null);
        setAdmin(null);
    }, []);

    // Rehydrate on load via the httpOnly platform-admin refresh cookie — same
    // pattern as the HRMS AuthContext, entirely separate cookie/session.
    useEffect(() => {
        api.setSessionHandlers({ onRefreshed: applySession, onExpired: clearSession });

        (async () => {
            try {
                const { data } = await authApi.refreshSession();
                applySession(data);
            } catch {
                clearSession();
            } finally {
                setLoading(false);
            }
        })();
    }, [applySession, clearSession]);

    const login = useCallback(async (email: string, password: string) => {
        const { data } = await authApi.login(email, password);
        applySession(data);
    }, [applySession]);

    const logout = useCallback(async () => {
        try {
            await authApi.logout();
        } finally {
            clearSession();
        }
    }, [clearSession]);

    const value = useMemo(() => ({ admin, loading, login, logout }), [admin, loading, login, logout]);

    return <PlatformAdminAuthContext.Provider value={value}>{children}</PlatformAdminAuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook is colocated with its provider by design
export function usePlatformAdminAuth() {
    const ctx = useContext(PlatformAdminAuthContext);
    if (!ctx) throw new Error('usePlatformAdminAuth must be used within a PlatformAdminAuthProvider');
    return ctx;
}
