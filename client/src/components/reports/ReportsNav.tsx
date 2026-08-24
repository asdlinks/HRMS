import { useEffect, useMemo, useState } from 'react';
import {
    Box, Card, List, ListItemButton, ListItemIcon, ListItemText,
    IconButton, Drawer, Button, useMediaQuery, useTheme,
} from '@mui/material';
import { NavLink } from 'react-router-dom';
import {
    Star, LayoutDashboard, Bookmark, Users, ClipboardList, CalendarClock,
    Wallet, Network, ShieldCheck, FileSearch, Menu as MenuIcon, X,
} from 'lucide-react';
import { getReportCatalog, getFavoriteReportIds, type ReportCatalogEntry } from '../../api/reports';

const CATEGORY_META: Record<string, { label: string; icon: typeof Users; path: string }> = {
    employee: { label: 'Employees', icon: Users, path: '/reports/employees' },
    attendance: { label: 'Attendance', icon: ClipboardList, path: '/reports/attendance' },
    leave: { label: 'Leave', icon: CalendarClock, path: '/reports/leave' },
    payroll: { label: 'Payroll', icon: Wallet, path: '/reports/payroll' },
    organization: { label: 'Organization', icon: Network, path: '/reports/organization' },
    compliance: { label: 'Compliance', icon: ShieldCheck, path: '/reports/compliance' },
    audit: { label: 'Audit', icon: FileSearch, path: '/reports/audit' },
};
const CATEGORY_ORDER = ['employee', 'attendance', 'leave', 'payroll', 'organization', 'compliance', 'audit'];

interface ReportsNavContentProps {
    onNavigate?: () => void;
}

// Compact, ten-entry-max nav: Dashboard + one item per category the
// requester actually has visible reports in (falls out of the existing
// catalog visibility filtering — no separate permission logic needed here)
// + Favorites + Saved Reports. Replaces the old flat 65-report list.
function ReportsNavContent({ onNavigate }: ReportsNavContentProps) {
    const [catalog, setCatalog] = useState<ReportCatalogEntry[]>([]);
    const [favoriteCount, setFavoriteCount] = useState(0);

    useEffect(() => {
        getReportCatalog().then((r) => setCatalog(r.data)).catch(() => {});
        getFavoriteReportIds().then((r) => setFavoriteCount(r.data.length)).catch(() => {});
    }, []);

    const availableCategories = useMemo(() => {
        const present = new Set(catalog.map((r) => r.category));
        return CATEGORY_ORDER.filter((c) => present.has(c));
    }, [catalog]);

    const linkSx = {
        borderRadius: 2, mb: 0.5, color: 'text.secondary',
        '&:hover': { bgcolor: 'action.hover' },
        '&.active': { bgcolor: 'primary.main', color: 'primary.contrastText' },
    };

    return (
        <Box sx={{ width: 220, p: 1.5 }}>
            <List dense disablePadding>
                <ListItemButton component={NavLink} to="/reports" end onClick={onNavigate} sx={linkSx}>
                    <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}><LayoutDashboard size={17} /></ListItemIcon>
                    <ListItemText primary="Dashboard" slotProps={{ primary: { sx: { fontSize: '0.85rem', fontWeight: 600 } } }} />
                </ListItemButton>

                {availableCategories.map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const Icon = meta.icon;
                    return (
                        <ListItemButton key={cat} component={NavLink} to={meta.path} onClick={onNavigate} sx={linkSx}>
                            <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}><Icon size={17} /></ListItemIcon>
                            <ListItemText primary={meta.label} slotProps={{ primary: { sx: { fontSize: '0.85rem', fontWeight: 600 } } }} />
                        </ListItemButton>
                    );
                })}

                <Box sx={{ my: 1, borderTop: '1px solid', borderColor: 'divider' }} />

                <ListItemButton component={NavLink} to="/reports/favorites" onClick={onNavigate} sx={linkSx}>
                    <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}><Star size={17} /></ListItemIcon>
                    <ListItemText primary={`Favorites${favoriteCount ? ` (${favoriteCount})` : ''}`} slotProps={{ primary: { sx: { fontSize: '0.85rem', fontWeight: 600 } } }} />
                </ListItemButton>
                <ListItemButton component={NavLink} to="/reports/saved" onClick={onNavigate} sx={linkSx}>
                    <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}><Bookmark size={17} /></ListItemIcon>
                    <ListItemText primary="Saved Reports" slotProps={{ primary: { sx: { fontSize: '0.85rem', fontWeight: 600 } } }} />
                </ListItemButton>
            </List>
        </Box>
    );
}

// Desktop: a slim sticky Card rail next to the workspace content.
// Mobile: a temporary Drawer toggled by a button (same convention as
// ContextSidebar elsewhere in the app).
export default function ReportsNav() {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [open, setOpen] = useState(false);

    if (isMobile) {
        return (
            <>
                <Button startIcon={<MenuIcon size={16} />} onClick={() => setOpen(true)} sx={{ mb: 2 }} variant="outlined" size="small">
                    Analytics Center
                </Button>
                <Drawer open={open} onClose={() => setOpen(false)}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
                        <IconButton onClick={() => setOpen(false)}><X size={18} /></IconButton>
                    </Box>
                    <ReportsNavContent onNavigate={() => setOpen(false)} />
                </Drawer>
            </>
        );
    }

    return (
        <Card sx={{ flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: 88 }}>
            <ReportsNavContent />
        </Card>
    );
}
