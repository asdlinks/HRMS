import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePlatformAdminAuth } from './PlatformAdminAuthContext';

export default function PlatformAdminProtectedRoute({ children }: { children: ReactNode }) {
    const { admin, loading } = usePlatformAdminAuth();

    if (loading) return null;
    if (!admin) return <Navigate to="/platform-admin/login" replace />;

    return <>{children}</>;
}
