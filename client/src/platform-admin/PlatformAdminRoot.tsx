import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import PlatformAdminTheme from './PlatformAdminTheme';
import { PlatformAdminAuthProvider, usePlatformAdminAuth } from './auth/PlatformAdminAuthContext';
import PlatformAdminProtectedRoute from './auth/PlatformAdminProtectedRoute';
import PlatformAdminShell from './PlatformAdminShell';
import { PageSpinner } from '../components/ui';

const PlatformAdminLogin = lazy(() => import('./pages/PlatformAdminLogin'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CompanyListPage = lazy(() => import('./pages/CompanyListPage'));
const CompanyCreatePage = lazy(() => import('./pages/CompanyCreatePage'));
const CompanyDetailPage = lazy(() => import('./pages/CompanyDetailPage'));
const SystemHealthPage = lazy(() => import('./pages/SystemHealthPage'));
const PlatformSettingsPage = lazy(() => import('./pages/PlatformSettingsPage'));

function PlatformAdminRoutes() {
    const { admin, loading } = usePlatformAdminAuth();

    if (loading) return <PageSpinner />;

    const routes = (
        <Suspense fallback={<PageSpinner />}>
            <Routes>
                <Route path="/platform-admin/login" element={admin ? <Navigate to="/platform-admin/dashboard" /> : <PlatformAdminLogin />} />
                <Route path="/platform-admin/dashboard" element={<PlatformAdminProtectedRoute><DashboardPage /></PlatformAdminProtectedRoute>} />
                <Route path="/platform-admin/companies" element={<PlatformAdminProtectedRoute><CompanyListPage /></PlatformAdminProtectedRoute>} />
                <Route path="/platform-admin/companies/new" element={<PlatformAdminProtectedRoute><CompanyCreatePage /></PlatformAdminProtectedRoute>} />
                <Route path="/platform-admin/companies/:id" element={<PlatformAdminProtectedRoute><CompanyDetailPage /></PlatformAdminProtectedRoute>} />
                <Route path="/platform-admin/system-health" element={<PlatformAdminProtectedRoute><SystemHealthPage /></PlatformAdminProtectedRoute>} />
                <Route path="/platform-admin/settings" element={<PlatformAdminProtectedRoute><PlatformSettingsPage /></PlatformAdminProtectedRoute>} />
                <Route path="/platform-admin" element={<Navigate to={admin ? '/platform-admin/dashboard' : '/platform-admin/login'} />} />
                <Route path="*" element={<Navigate to="/platform-admin" />} />
            </Routes>
        </Suspense>
    );

    if (!admin) return routes;
    return <PlatformAdminShell>{routes}</PlatformAdminShell>;
}

export default function PlatformAdminRoot() {
    return (
        <PlatformAdminTheme>
            <SnackbarProvider maxSnack={4} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} autoHideDuration={3500}>
                <PlatformAdminAuthProvider>
                    <PlatformAdminRoutes />
                </PlatformAdminAuthProvider>
            </SnackbarProvider>
        </PlatformAdminTheme>
    );
}
