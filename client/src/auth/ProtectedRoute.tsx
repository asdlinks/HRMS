import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

interface ProtectedRouteProps {
    children: ReactNode;
    permission?: string;
    anyPermission?: string[];
    redirectTo?: string;
}

// Gates a route on real, server-issued permissions (from AuthContext) instead
// of the old inline `user?.role === 'x'` ternaries scattered through App.jsx.
export default function ProtectedRoute({ children, permission, anyPermission, redirectTo = '/dashboard' }: ProtectedRouteProps) {
    const { user, hasPermission, hasAnyPermission, loading } = useAuth();

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (permission && !hasPermission(permission)) return <Navigate to={redirectTo} replace />;
    if (anyPermission && !hasAnyPermission(anyPermission)) return <Navigate to={redirectTo} replace />;

    return <>{children}</>;
}
