import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as api from '../api';
import type { AuthUser } from '../types';
import type { SessionData } from '../api/client';
import type { CompanyProfile } from '../api/company';
import { navModules, type NavModule } from '../config/menuConfig';

interface LoginResponse {
    accessToken: string;
    user: AuthUser;
    permissions: string[];
}

interface MenuTreeNode {
    id: number | string;
    name: string;
    path: string;
    icon: string;
    permission?: string | null;
    anyPermission?: string[] | null;
    is_placeholder?: boolean;
    children?: MenuTreeNode[];
}

function toNavModules(nodes: MenuTreeNode[]): NavModule[] {
    return nodes.map((n) => ({
        key: n.path,
        name: n.name,
        path: n.path,
        icon: n.icon,
        permission: n.permission || undefined,
        anyPermission: n.anyPermission || undefined,
        is_placeholder: n.is_placeholder,
        children: (n.children || []).map((c) => ({
            name: c.name,
            path: c.path,
            icon: c.icon,
            permission: c.permission || undefined,
            anyPermission: c.anyPermission || undefined,
        })),
    }));
}

interface AuthContextValue {
    user: AuthUser | null;
    permissions: string[];
    loading: boolean;
    companyProfile: CompanyProfile | null;
    navTree: NavModule[];
    login: (tenantCode: string, email: string, password: string) => Promise<LoginResponse>;
    logout: () => Promise<void>;
    hasPermission: (code: string) => boolean;
    hasAnyPermission: (codes: string[]) => boolean;
    updateLocalUser: (patch: Partial<AuthUser>) => void;
    refreshCompanyProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
    // Falls back to the static seed array (menuConfig.ts) until the DB tree
    // resolves, and stays on it if the fetch ever fails — a tenant should
    // never render with an empty nav.
    const [navTree, setNavTree] = useState<NavModule[]>(navModules);

    // The static index.html <title> can't be tenant-dynamic pre-login (it's
    // plain HTML served before any JS/auth runs) — this only affects the
    // in-app tab title once a company profile has loaded.
    useEffect(() => {
        document.title = companyProfile?.name ? `${companyProfile.name} · HRMS` : 'Mywe HRMS';
    }, [companyProfile]);

    const loadCompanyAndNav = useCallback(async () => {
        try {
            const [companyResp, menuResp] = await Promise.all([api.getCompanyProfile(), api.getMenuTree()]);
            setCompanyProfile(companyResp.data);
            const tree = toNavModules(menuResp.data as MenuTreeNode[]);
            if (tree.length > 0) setNavTree(tree);
        } catch {
            // Non-critical: keep the static fallback nav and no company
            // branding rather than blocking login on this.
        }
    }, []);

    const applySession = useCallback((data: SessionData) => {
        api.setAccessToken(data.accessToken);
        setUser(data.user as AuthUser);
        setPermissions((data.permissions as string[]) || []);
        loadCompanyAndNav();
    }, [loadCompanyAndNav]);

    const clearSession = useCallback(() => {
        api.setAccessToken(null);
        setUser(null);
        setPermissions([]);
        setCompanyProfile(null);
        setNavTree(navModules);
    }, []);

    // Rehydrate the session on load using the httpOnly refresh cookie —
    // replaces trusting a cached localStorage user object. No localStorage
    // is used for auth at all; a failed refresh just means "logged out".
    useEffect(() => {
        api.setSessionHandlers({
            onRefreshed: applySession,
            onExpired: clearSession,
        });

        (async () => {
            try {
                const { data } = await api.refreshSession();
                applySession(data);
            } catch {
                clearSession();
            } finally {
                setLoading(false);
            }
        })();
    }, [applySession, clearSession]);

    const login = useCallback(
        async (tenantCode: string, email: string, password: string): Promise<LoginResponse> => {
            const { data } = await api.login(tenantCode, email, password);
            applySession(data);
            return data as LoginResponse;
        },
        [applySession],
    );

    const logout = useCallback(async () => {
        try {
            await api.logout();
        } finally {
            clearSession();
        }
    }, [clearSession]);

    const hasPermission = useCallback((code: string) => permissions.includes(code), [permissions]);
    const hasAnyPermission = useCallback((codes: string[]) => codes.some((c) => permissions.includes(c)), [permissions]);

    // For display-only fields (e.g. profile photo) already persisted via a
    // direct API call — merges into the in-memory user without a full re-login.
    const updateLocalUser = useCallback((patch: Partial<AuthUser>) => {
        setUser((prev) => (prev ? { ...prev, ...patch } : prev));
    }, []);

    const value = useMemo(
        () => ({
            user, permissions, loading, companyProfile, navTree,
            login, logout, hasPermission, hasAnyPermission, updateLocalUser,
            refreshCompanyProfile: loadCompanyAndNav,
        }),
        [user, permissions, loading, companyProfile, navTree, login, logout, hasPermission, hasAnyPermission, updateLocalUser, loadCompanyAndNav],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components -- hook is colocated with its provider by design
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
    return ctx;
}
