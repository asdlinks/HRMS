import type { ReactNode } from 'react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Box, Container, Tabs, Tab } from '@mui/material';
import { ShieldCheck, LogOut } from 'lucide-react';
import { usePlatformAdminAuth } from './auth/PlatformAdminAuthContext';

// Deliberately not the HRMS AppShell/TopNav — a minimal bar with a flat,
// 4-item nav (Part 9) and no tenant nav tree, notifications, or
// employee-facing widgets. This is a SaaS operations console, not an HRMS.
const NAV_ITEMS = [
    { label: 'Dashboard', path: '/platform-admin/dashboard' },
    { label: 'Companies', path: '/platform-admin/companies' },
    { label: 'System Health', path: '/platform-admin/system-health' },
    { label: 'Platform Settings', path: '/platform-admin/settings' },
];

export default function PlatformAdminShell({ children }: { children: ReactNode }) {
    const { admin, logout } = usePlatformAdminAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = async () => {
        await logout();
        navigate('/platform-admin/login');
    };

    const activeTab = NAV_ITEMS.findIndex((item) => location.pathname.startsWith(item.path));

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <AppBar position="static" color="default" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Toolbar>
                    <ShieldCheck size={22} style={{ marginRight: 10 }} />
                    <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
                        Platform Administration
                    </Typography>
                    {admin && (
                        <Typography variant="body2" color="text.secondary" sx={{ mr: 2 }}>
                            {admin.name}
                        </Typography>
                    )}
                    <Button startIcon={<LogOut size={16} />} onClick={handleLogout} size="small">
                        Sign Out
                    </Button>
                </Toolbar>
                <Tabs value={activeTab === -1 ? false : activeTab} sx={{ px: 2 }}>
                    {NAV_ITEMS.map((item) => (
                        <Tab key={item.path} label={item.label} component={RouterLink} to={item.path} />
                    ))}
                </Tabs>
            </AppBar>
            <Container maxWidth="lg" sx={{ py: 4 }}>
                {children}
            </Container>
        </Box>
    );
}
