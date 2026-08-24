import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import AppShell from './layout/AppShell';
import Login from './pages/Login';
import { ComingSoonPage, PageSpinner } from './components/ui';
import { UserSearch, Target, Boxes } from 'lucide-react';
import { useAuth } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';

// Route-level code splitting: every page past login is loaded on demand
// instead of bundled into the initial chunk (was a single ~1.2MB bundle).
const EmployeeDashboard = lazy(() => import('./pages/EmployeeDashboard'));
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'));
const EmployeeProfilePage = lazy(() => import('./pages/EmployeeProfilePage'));
const LeavesPage = lazy(() => import('./pages/LeavesPage'));
const LeaveCancellationPage = lazy(() => import('./pages/LeaveCancellationPage'));
const HolidayCalendarPage = lazy(() => import('./pages/HolidayCalendarPage'));
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'));
const DepartmentsPage = lazy(() => import('./pages/DepartmentsPage'));
const OrganizationStructurePage = lazy(() => import('./pages/OrganizationStructurePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const AttendancePoliciesPage = lazy(() => import('./pages/AttendancePoliciesPage'));
const KioskDevicesPage = lazy(() => import('./pages/KioskDevicesPage'));
const FaceEnrollmentPage = lazy(() => import('./pages/FaceEnrollmentPage'));
const ReportsDashboard = lazy(() => import('./pages/reports/ReportsDashboard'));
const AnalyticsWorkspace = lazy(() => import('./pages/reports/AnalyticsWorkspace'));
const ReportViewer = lazy(() => import('./pages/reports/ReportViewer'));
const ReportsFavoritesPage = lazy(() => import('./pages/reports/ReportsFavoritesPage'));
const ReportsSavedPage = lazy(() => import('./pages/reports/ReportsSavedPage'));
const MyTeamPage = lazy(() => import('./pages/MyTeamPage'));
const PayrollDashboardPage = lazy(() => import('./pages/PayrollDashboardPage'));
const PayrollComponentsPage = lazy(() => import('./pages/PayrollComponentsPage'));
const PayrollStructuresPage = lazy(() => import('./pages/PayrollStructuresPage'));
const PayrollAssignmentsPage = lazy(() => import('./pages/PayrollAssignmentsPage'));
const PayrollRunsPage = lazy(() => import('./pages/PayrollRunsPage'));
const PayrollRunDetailPage = lazy(() => import('./pages/PayrollRunDetailPage'));
const PayrollOvertimePage = lazy(() => import('./pages/PayrollOvertimePage'));
const PayrollPayslipsPage = lazy(() => import('./pages/PayrollPayslipsPage'));
const PayrollReportsPage = lazy(() => import('./pages/PayrollReportsPage'));
const PayrollSettingsPage = lazy(() => import('./pages/PayrollSettingsPage'));
const ShiftsPage = lazy(() => import('./pages/ShiftsPage'));
const WorkModesPage = lazy(() => import('./pages/WorkModesPage'));
const SalaryGradesPage = lazy(() => import('./pages/SalaryGradesPage'));
const CompanyDocumentsPage = lazy(() => import('./pages/CompanyDocumentsPage'));

// Mirrors 032_reports_platform.sql's menu_items.any_permission exactly —
// includes own/team/all scopes so every role that can see the Reports nav
// item can also reach the /reports route (previously only .all-scope codes
// were listed here, which redirected managers and employees to /dashboard).
const REPORTS_PERMISSIONS = [
    'reports.dashboard.view',
    'reports.employee.view.own', 'reports.employee.view.team', 'reports.employee.view.all',
    'reports.attendance.view.own', 'reports.attendance.view.team', 'reports.attendance.view.all',
    'reports.leave.view.own', 'reports.leave.view.team', 'reports.leave.view.all',
    'reports.payroll.view.own', 'reports.payroll.view.team', 'reports.payroll.view.all',
    'reports.organization.view', 'reports.compliance.view', 'reports.audit.view',
];

const App = () => {
    const { user, loading, hasAnyPermission } = useAuth();

    if (loading) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="h5" color="primary" sx={{ fontFamily: "'Outfit', sans-serif" }}>
                    Loading Mywe HRMS…
                </Typography>
            </Box>
        );
    }

    const routes = (
        <Suspense fallback={<PageSpinner />}>
            <Routes>
                <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />

                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            {hasAnyPermission(['users.view.team', 'users.view.all'])
                                ? <ManagerDashboard />
                                : <EmployeeDashboard />}
                        </ProtectedRoute>
                    }
                />

                <Route path="/leaves" element={<ProtectedRoute><LeavesPage /></ProtectedRoute>} />
                <Route path="/cancellation" element={<ProtectedRoute><LeaveCancellationPage /></ProtectedRoute>} />
                <Route path="/holidays" element={<ProtectedRoute><HolidayCalendarPage /></ProtectedRoute>} />

                <Route
                    path="/employees"
                    element={
                        <ProtectedRoute anyPermission={['users.view.team', 'users.view.all']}>
                            <EmployeesPage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/profile/:userId"
                    element={
                        <ProtectedRoute anyPermission={['users.view.team', 'users.view.all']}>
                            <EmployeeProfilePage />
                        </ProtectedRoute>
                    }
                />

                <Route path="/department" element={<ProtectedRoute permission="departments.manage"><DepartmentsPage /></ProtectedRoute>} />
                <Route
                    path="/organization"
                    element={
                        <ProtectedRoute anyPermission={['locations.manage', 'designations.manage', 'employment-types.manage']}>
                            <OrganizationStructurePage />
                        </ProtectedRoute>
                    }
                />
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                <Route path="/attendance" element={<ProtectedRoute><AttendancePage /></ProtectedRoute>} />
                <Route path="/attendance/policies" element={<ProtectedRoute permission="attendance.policy.manage"><AttendancePoliciesPage /></ProtectedRoute>} />
                <Route path="/attendance/kiosk-devices" element={<ProtectedRoute permission="attendance.device.manage"><KioskDevicesPage /></ProtectedRoute>} />
                <Route path="/attendance/face-enrollment" element={<ProtectedRoute permission="attendance.face.enroll"><FaceEnrollmentPage /></ProtectedRoute>} />
                <Route path="/shifts" element={<ProtectedRoute anyPermission={['shifts.view', 'shifts.manage']}><ShiftsPage /></ProtectedRoute>} />
                <Route path="/work-modes" element={<ProtectedRoute permission="work-modes.manage"><WorkModesPage /></ProtectedRoute>} />
                <Route path="/my-team" element={<ProtectedRoute><MyTeamPage /></ProtectedRoute>} />
                <Route
                    path="/reports"
                    element={
                        <ProtectedRoute anyPermission={REPORTS_PERMISSIONS}>
                            <ReportsDashboard />
                        </ProtectedRoute>
                    }
                />
                <Route path="/reports/favorites" element={<ProtectedRoute anyPermission={REPORTS_PERMISSIONS}><ReportsFavoritesPage /></ProtectedRoute>} />
                <Route path="/reports/saved" element={<ProtectedRoute anyPermission={REPORTS_PERMISSIONS}><ReportsSavedPage /></ProtectedRoute>} />
                {['employee', 'attendance', 'leave', 'payroll', 'organization', 'compliance', 'audit'].map((category) => (
                    <Route
                        key={category}
                        path={`/reports/${category === 'employee' ? 'employees' : category}`}
                        element={
                            <ProtectedRoute anyPermission={REPORTS_PERMISSIONS}>
                                <AnalyticsWorkspace category={category} />
                            </ProtectedRoute>
                        }
                    />
                ))}
                {/* Legacy per-report links (old favorites/saved-filters/bookmarks) — redirects into the owning workspace. */}
                <Route path="/reports/:reportId" element={<ProtectedRoute anyPermission={REPORTS_PERMISSIONS}><ReportViewer /></ProtectedRoute>} />

                <Route path="/payroll" element={<ProtectedRoute anyPermission={['payroll.view.own', 'payroll.view.team', 'payroll.view.all']}><PayrollDashboardPage /></ProtectedRoute>} />
                <Route path="/payroll/components" element={<ProtectedRoute permission="payroll.components.manage"><PayrollComponentsPage /></ProtectedRoute>} />
                <Route path="/payroll/structures" element={<ProtectedRoute permission="payroll.structures.manage"><PayrollStructuresPage /></ProtectedRoute>} />
                <Route path="/payroll/grades" element={<ProtectedRoute permission="salary-grades.manage"><SalaryGradesPage /></ProtectedRoute>} />
                <Route path="/payroll/assignments" element={<ProtectedRoute permission="payroll.assign"><PayrollAssignmentsPage /></ProtectedRoute>} />
                <Route path="/payroll/runs" element={<ProtectedRoute anyPermission={['payroll.process', 'payroll.approve']}><PayrollRunsPage /></ProtectedRoute>} />
                <Route path="/payroll/runs/:runId" element={<ProtectedRoute anyPermission={['payroll.process', 'payroll.approve']}><PayrollRunDetailPage /></ProtectedRoute>} />
                <Route path="/payroll/overtime" element={<ProtectedRoute anyPermission={['payroll.overtime.apply', 'payroll.overtime.approve', 'payroll.view.own']}><PayrollOvertimePage /></ProtectedRoute>} />
                <Route path="/payroll/payslips" element={<ProtectedRoute anyPermission={['payroll.view.own', 'payroll.view.team', 'payroll.view.all']}><PayrollPayslipsPage /></ProtectedRoute>} />
                <Route path="/payroll/reports" element={<ProtectedRoute permission="payroll.view.all"><PayrollReportsPage /></ProtectedRoute>} />
                <Route path="/payroll/settings" element={<ProtectedRoute anyPermission={['payroll.settings.view', 'payroll.settings.manage']}><PayrollSettingsPage /></ProtectedRoute>} />

                <Route path="/company-documents" element={<ProtectedRoute><CompanyDocumentsPage /></ProtectedRoute>} />

                {/* Future-module placeholders: routing + nav exist now, implementation is a later phase */}
                <Route path="/recruitment" element={<ProtectedRoute permission="settings.manage"><ComingSoonPage title="Recruitment" description="Job requisitions, candidate pipelines and offer management." icon={<UserSearch size={32} />} /></ProtectedRoute>} />
                <Route path="/performance" element={<ProtectedRoute permission="settings.manage"><ComingSoonPage title="Performance" description="Goals, reviews and continuous feedback cycles." icon={<Target size={32} />} /></ProtectedRoute>} />
                <Route path="/assets" element={<ProtectedRoute permission="settings.manage"><ComingSoonPage title="Asset Management" description="Track company assets issued to employees." icon={<Boxes size={32} />} /></ProtectedRoute>} />

                <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </Suspense>
    );

    if (!user) return routes;

    return <AppShell>{routes}</AppShell>;
};

export default App;
