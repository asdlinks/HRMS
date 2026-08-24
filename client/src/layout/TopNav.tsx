import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import {
    AppBar,
    Toolbar,
    Box,
    IconButton,
    Badge,
    Menu,
    MenuItem,
    Avatar,
    Typography,
    InputBase,
    Paper,
    Divider,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Alert,
    ListItemIcon,
    ListItemText,
    Stack,
    Tooltip,
    Badge as StatusDot,
    Drawer,
    List,
    ListSubheader,
    ListItemButton,
} from '@mui/material';
import {
    Bell,
    User,
    LogOut,
    Key,
    Search,
    Menu as MenuIconGlyph,
    Camera,
    Sun,
    Moon,
    Mic,
    LayoutDashboard,
    MoreHorizontal,
    ChevronLeft,
    ChevronRight,
    type LucideIcon,
} from 'lucide-react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { getNotifications, markNotificationsRead, changePassword, getUsers, updateUser, getMonthlyAttendance } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useThemeMode } from '../theme/ThemeModeProvider';
import { getErrorMessage, type AuthUser } from '../types';
import { TOPNAV_HEIGHT } from './dimensions';
import { useHeaderSearch } from './SearchContext';
import { getActiveModuleKey, withDefaultViewChild } from '../config/menuConfig';
import { NAV_ICONS } from './navIcons';

interface Notification {
    id: number;
    message: string;
    is_read: boolean;
    created_at: string;
    link?: string | null;
}

interface TopNavProps {
    isListening: boolean;
    transcript: string;
    toggleListening: () => void;
}

export default function TopNav({ isListening, transcript, toggleListening }: TopNavProps) {
    const { user, updateLocalUser, logout, hasPermission, hasAnyPermission, companyProfile, navTree } = useAuth() as { user: AuthUser } & ReturnType<typeof useAuth>;
    const { mode, toggleMode } = useThemeMode();
    const { searchQuery, setSearchQuery } = useHeaderSearch();
    const { enqueueSnackbar } = useSnackbar();
    const navigate = useNavigate();
    const location = useLocation();

    const [profileAnchor, setProfileAnchor] = useState<null | HTMLElement>(null);
    const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showPhotoModal, setShowPhotoModal] = useState(false);
    const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' });
    const [passwordError, setPasswordError] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [allUsers, setAllUsers] = useState<AuthUser[]>([]);
    const [checkedInToday, setCheckedInToday] = useState<boolean | null>(null);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [newPhotoUrl, setNewPhotoUrl] = useState('');
    const [photoLoading, setPhotoLoading] = useState(false);
    const [photoError, setPhotoError] = useState('');
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);
    const [canScrollNavLeft, setCanScrollNavLeft] = useState(false);
    const [canScrollNavRight, setCanScrollNavRight] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const navScrollRef = useRef<HTMLDivElement>(null);

    const canSearchEmployees = hasAnyPermission(['users.view.team', 'users.view.all']);
    const activeModuleKey = getActiveModuleKey(location.pathname, navTree);

    const visibleModules = navTree.filter((m) => {
        if (m.permission) return hasPermission(m.permission);
        if (m.anyPermission) return hasAnyPermission(m.anyPermission);
        return true;
    });
    // Coming-soon modules (Payroll, Recruitment, ...) are secondary — tucked
    // into a "More" menu so the primary bar never silently overflows off
    // screen (it used to, with no scroll affordance, on admin accounts that
    // see every module).
    const primaryModules = visibleModules.filter((m) => !m.is_placeholder);
    const overflowModules = visibleModules.filter((m) => m.is_placeholder);
    const activeIsOverflow = overflowModules.some((m) => m.key === activeModuleKey);

    useEffect(() => {
        if (!user) return;
        fetchNotifications();
        if (canSearchEmployees) fetchAllUsers();
        fetchTodayAttendance();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    useEffect(() => {
        const handleUserCheckedIn = () => setCheckedInToday(true);
        window.addEventListener('userCheckedIn', handleUserCheckedIn);
        return () => window.removeEventListener('userCheckedIn', handleUserCheckedIn);
    }, []);

    useEffect(() => {
        const el = navScrollRef.current;
        if (!el) return;
        const updateNavScrollState = () => {
            setCanScrollNavLeft(el.scrollLeft > 4);
            setCanScrollNavRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
        };
        updateNavScrollState();
        el.addEventListener('scroll', updateNavScrollState);
        window.addEventListener('resize', updateNavScrollState);
        return () => {
            el.removeEventListener('scroll', updateNavScrollState);
            window.removeEventListener('resize', updateNavScrollState);
        };
    }, [primaryModules.length, overflowModules.length]);

    const scrollNav = (direction: 'left' | 'right') => {
        navScrollRef.current?.scrollBy({ left: direction === 'left' ? -180 : 180, behavior: 'smooth' });
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setShowSearchResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchAllUsers = async () => {
        try {
            const resp = await getUsers();
            setAllUsers(resp.data);
        } catch {
            // non-critical: search box simply stays empty
        }
    };

    const fetchTodayAttendance = async () => {
        try {
            const today = new Date();
            const resp = await getMonthlyAttendance({ userId: user.id, month: today.getMonth() + 1, year: today.getFullYear() });
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            setCheckedInToday(resp.data.attendance.some((a: { date: string }) => a.date === todayStr));
        } catch {
            setCheckedInToday(false);
        }
    };

    const fetchNotifications = async () => {
        try {
            const resp = await getNotifications();
            setNotifications(resp.data);
        } catch {
            // non-critical
        }
    };

    const handleMarkRead = async () => {
        try {
            await markNotificationsRead();
        } catch {
            // non-critical
        }
    };

    const openNotifications = (e: React.MouseEvent<HTMLElement>) => {
        if (!notifAnchor) fetchNotifications();
        setNotifAnchor(e.currentTarget);
    };
    const closeNotifications = () => {
        handleMarkRead();
        setNotifAnchor(null);
    };

    const onLogout = async () => {
        await logout();
        navigate('/login');
    };

    const handlePasswordChange = async (e: FormEvent) => {
        e.preventDefault();
        if (passwordData.new !== passwordData.confirm) {
            setPasswordError('Passwords do not match');
            return;
        }
        setPasswordLoading(true);
        setPasswordError('');
        try {
            await changePassword({ currentPassword: passwordData.current, newPassword: passwordData.new });
            enqueueSnackbar('Password updated successfully', { variant: 'success' });
            setShowPasswordModal(false);
            setPasswordData({ current: '', new: '', confirm: '' });
        } catch (err) {
            setPasswordError(getErrorMessage(err, 'Failed to update password'));
        } finally {
            setPasswordLoading(false);
        }
    };

    const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 1024 * 1024) {
            setPhotoError('File too large (max 1MB)');
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => setNewPhotoUrl(reader.result as string);
        reader.readAsDataURL(file);
    };

    const handlePhotoUpdate = async (e: FormEvent) => {
        e.preventDefault();
        if (!newPhotoUrl) return;
        setPhotoLoading(true);
        setPhotoError('');
        try {
            await updateUser(user.id, { profile_photo: newPhotoUrl });
            updateLocalUser({ profile_photo: newPhotoUrl });
            enqueueSnackbar('Profile photo updated', { variant: 'success' });
            setShowPhotoModal(false);
            setNewPhotoUrl('');
        } catch {
            setPhotoError('Failed to update photo');
        } finally {
            setPhotoLoading(false);
        }
    };

    const unreadCount = notifications.filter((n) => !n.is_read).length;
    const filteredUsers = allUsers
        .filter((u) => u.id !== user.id && u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 5);

    return (
        <>
            <AppBar
                position="fixed"
                color="default"
                sx={{
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    height: TOPNAV_HEIGHT,
                    justifyContent: 'center',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    zIndex: (t) => t.zIndex.drawer + 1,
                }}
            >
                <Toolbar sx={{ gap: 1, minHeight: `${TOPNAV_HEIGHT}px !important` }}>
                    <IconButton onClick={() => setMobileNavOpen(true)} sx={{ display: { md: 'none' } }}>
                        <MenuIconGlyph size={22} />
                    </IconButton>

                    <Box
                        onClick={() => navigate('/dashboard')}
                        sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1, mr: 1 }}
                    >
                        <Box component="img" src={companyProfile?.logo_url || 'logo.webp'} alt={companyProfile?.name || 'Mywe HRMS'} sx={{ height: 32, objectFit: 'contain' }} />
                        <Typography sx={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '1.05rem', display: { xs: 'none', sm: 'block' } }}>
                            {companyProfile?.name || 'Mywe HRMS'}
                        </Typography>
                    </Box>

                    <Box
                        sx={{
                            display: { xs: 'none', md: 'flex' },
                            alignItems: 'center',
                            flex: 1,
                            minWidth: 0,
                            position: 'relative',
                        }}
                    >
                        {canScrollNavLeft && (
                            <IconButton
                                size="small"
                                onClick={() => scrollNav('left')}
                                sx={{
                                    position: 'absolute',
                                    left: 0,
                                    zIndex: 2,
                                    bgcolor: 'background.paper',
                                    boxShadow: 1,
                                    '&:hover': { bgcolor: 'action.hover' },
                                }}
                            >
                                <ChevronLeft size={16} />
                            </IconButton>
                        )}
                        <Stack
                            ref={navScrollRef}
                            direction="row"
                            spacing={0.5}
                            onWheel={(e) => {
                                if (e.deltaY === 0) return;
                                navScrollRef.current!.scrollLeft += e.deltaY;
                            }}
                            sx={{
                                overflowX: 'auto',
                                flex: 1,
                                minWidth: 0,
                                scrollbarWidth: 'none',
                                '&::-webkit-scrollbar': { display: 'none' },
                                px: canScrollNavLeft || canScrollNavRight ? 4 : 0,
                            }}
                        >
                            {primaryModules.map((m) => {
                                const Icon: LucideIcon = NAV_ICONS[m.icon] ?? LayoutDashboard;
                                const active = m.key === activeModuleKey;
                                return (
                                    <Box
                                        key={m.key}
                                        component={NavLink}
                                        to={m.path}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 0.75,
                                            px: 1.5,
                                            py: 0.9,
                                            borderRadius: 2,
                                            whiteSpace: 'nowrap',
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            textDecoration: 'none',
                                            color: active ? 'primary.contrastText' : 'text.secondary',
                                            bgcolor: active ? 'primary.main' : 'transparent',
                                            '&:hover': { bgcolor: active ? 'primary.main' : 'action.hover' },
                                            transition: (theme) => theme.transitions.create(['background-color', 'color']),
                                        }}
                                    >
                                        <Icon size={16} />
                                        {m.name}
                                    </Box>
                                );
                            })}

                            {overflowModules.length > 0 && (
                                <Box
                                    component="button"
                                    onClick={(e) => setMoreAnchor(e.currentTarget)}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.75,
                                        px: 1.5,
                                        py: 0.9,
                                        borderRadius: 2,
                                        whiteSpace: 'nowrap',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        border: 'none',
                                        bgcolor: activeIsOverflow ? 'primary.main' : 'transparent',
                                        color: activeIsOverflow ? 'primary.contrastText' : 'text.secondary',
                                        '&:hover': { bgcolor: activeIsOverflow ? 'primary.main' : 'action.hover' },
                                    }}
                                >
                                    <MoreHorizontal size={16} />
                                    More
                                </Box>
                            )}
                        </Stack>
                        {canScrollNavRight && (
                            <IconButton
                                size="small"
                                onClick={() => scrollNav('right')}
                                sx={{
                                    position: 'absolute',
                                    right: 0,
                                    zIndex: 2,
                                    bgcolor: 'background.paper',
                                    boxShadow: 1,
                                    '&:hover': { bgcolor: 'action.hover' },
                                }}
                            >
                                <ChevronRight size={16} />
                            </IconButton>
                        )}
                    </Box>
                    <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
                        {overflowModules.map((m) => {
                            const Icon: LucideIcon = NAV_ICONS[m.icon] ?? LayoutDashboard;
                            return (
                                <MenuItem key={m.key} component={NavLink} to={m.path} onClick={() => setMoreAnchor(null)}>
                                    <ListItemIcon><Icon size={17} /></ListItemIcon>
                                    <ListItemText primary={m.name} />
                                    <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>Soon</Typography>
                                </MenuItem>
                            );
                        })}
                    </Menu>

                    <Box sx={{ flex: { xs: 1, md: 0 } }} />

                    {canSearchEmployees && (
                        <Box ref={searchRef} sx={{ position: 'relative', display: { xs: 'none', lg: 'block' } }}>
                            <Paper
                                variant="outlined"
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    px: 1.5,
                                    height: 38,
                                    width: 220,
                                    borderRadius: 2,
                                    bgcolor: 'action.hover',
                                }}
                            >
                                <Search size={16} color="currentColor" style={{ opacity: 0.6 }} />
                                <InputBase
                                    placeholder="Search employees…"
                                    value={searchQuery}
                                    onFocus={() => setShowSearchResults(true)}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setShowSearchResults(true);
                                    }}
                                    sx={{ ml: 1, fontSize: '0.85rem', flex: 1 }}
                                />
                            </Paper>
                            {showSearchResults && searchQuery.trim().length > 0 && (
                                <Paper
                                    sx={{
                                        position: 'absolute',
                                        top: '110%',
                                        left: 0,
                                        width: 280,
                                        maxHeight: 320,
                                        overflowY: 'auto',
                                        zIndex: 10,
                                        borderRadius: 2,
                                    }}
                                >
                                    {filteredUsers.length === 0 ? (
                                        <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                                            No employees found
                                        </Typography>
                                    ) : (
                                        filteredUsers.map((u) => (
                                            <MenuItem
                                                key={u.id}
                                                onClick={() => {
                                                    navigate(`/profile/${u.id}`);
                                                    setSearchQuery('');
                                                    setShowSearchResults(false);
                                                }}
                                            >
                                                <ListItemIcon>
                                                    <Avatar src={u.profile_photo ?? undefined} sx={{ width: 28, height: 28 }}>
                                                        <User size={14} />
                                                    </Avatar>
                                                </ListItemIcon>
                                                <Box>
                                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{u.name}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{u.department_name}</Typography>
                                                </Box>
                                            </MenuItem>
                                        ))
                                    )}
                                </Paper>
                            )}
                        </Box>
                    )}

                    <Box sx={{ position: 'relative' }}>
                        <Tooltip title={isListening ? 'Stop listening' : 'Ask the AI assistant'}>
                            <IconButton onClick={toggleListening} sx={{ color: isListening ? 'success.main' : 'text.secondary' }}>
                                <Mic size={19} />
                            </IconButton>
                        </Tooltip>
                        {isListening && transcript && (
                            <Paper
                                sx={{
                                    position: 'absolute', top: '115%', right: 0, mt: 0.5, p: 1.5, width: 240,
                                    borderRadius: 2, fontSize: '0.8rem', fontStyle: 'italic', textAlign: 'center', zIndex: 10,
                                }}
                            >
                                "{transcript}"
                            </Paper>
                        )}
                    </Box>

                    <Tooltip title={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
                        <IconButton onClick={toggleMode} sx={{ color: 'text.secondary' }}>
                            {mode === 'light' ? <Moon size={19} /> : <Sun size={19} />}
                        </IconButton>
                    </Tooltip>

                    <IconButton onClick={openNotifications} sx={{ color: 'text.secondary' }}>
                        <Badge badgeContent={unreadCount} color="error">
                            <Bell size={20} />
                        </Badge>
                    </IconButton>
                    <Menu anchorEl={notifAnchor} open={Boolean(notifAnchor)} onClose={closeNotifications} slotProps={{ paper: { sx: { width: 340, maxHeight: 420 } } }}>
                        <Typography sx={{ px: 2, py: 1.5, fontWeight: 700 }}>Notifications</Typography>
                        <Divider />
                        {notifications.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
                                No recent activity
                            </Typography>
                        ) : (
                            notifications.map((n) => (
                                <MenuItem
                                    key={n.id}
                                    onClick={n.link ? () => { closeNotifications(); navigate(n.link as string); } : undefined}
                                    sx={{
                                        whiteSpace: 'normal', borderLeft: n.is_read ? 'none' : '3px solid', borderColor: 'primary.main',
                                        cursor: n.link ? 'pointer' : 'default',
                                    }}
                                >
                                    <Box>
                                        <Typography variant="body2">{n.message}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {new Date(n.created_at + 'Z').toLocaleString()}
                                        </Typography>
                                    </Box>
                                </MenuItem>
                            ))
                        )}
                    </Menu>

                    <IconButton onClick={(e) => setProfileAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
                        <StatusDot
                            overlap="circular"
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            variant="dot"
                            sx={{
                                '& .MuiBadge-badge': {
                                    bgcolor: checkedInToday ? 'success.main' : checkedInToday === false ? 'warning.main' : 'transparent',
                                    border: '2px solid',
                                    borderColor: 'background.paper',
                                },
                            }}
                        >
                            <Avatar src={user.profile_photo ?? undefined} sx={{ width: 34, height: 34, border: '2px solid', borderColor: 'primary.main' }}>
                                <User size={16} />
                            </Avatar>
                        </StatusDot>
                    </IconButton>
                    <Menu anchorEl={profileAnchor} open={Boolean(profileAnchor)} onClose={() => setProfileAnchor(null)} slotProps={{ paper: { sx: { width: 260 } } }}>
                        <Box sx={{ px: 2, py: 1.5 }}>
                            <Typography sx={{ fontWeight: 700 }}>{user.name}</Typography>
                            <Typography variant="caption" color="text.secondary" display="block">{user.designation}</Typography>
                            <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600 }}>{user.email}</Typography>
                        </Box>
                        <Divider />
                        <MenuItem onClick={() => { setShowPhotoModal(true); setProfileAnchor(null); }}>
                            <ListItemIcon><Camera size={16} /></ListItemIcon> Update Photo
                        </MenuItem>
                        <MenuItem onClick={() => { setShowPasswordModal(true); setProfileAnchor(null); }}>
                            <ListItemIcon><Key size={16} /></ListItemIcon> Change Password
                        </MenuItem>
                        <MenuItem onClick={onLogout} sx={{ color: 'error.main' }}>
                            <ListItemIcon><LogOut size={16} color="currentColor" /></ListItemIcon> Logout
                        </MenuItem>
                    </Menu>
                </Toolbar>
            </AppBar>

            <Drawer anchor="left" open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} sx={{ display: { md: 'none' } }}>
                <Box sx={{ width: 280 }} role="presentation">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 2 }}>
                        <Box component="img" src={companyProfile?.logo_url || 'logo.webp'} alt={companyProfile?.name || 'Mywe HRMS'} sx={{ height: 30 }} />
                        <Typography sx={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}>{companyProfile?.name || 'Mywe HRMS'}</Typography>
                    </Box>
                    <Divider />
                    <List sx={{ pb: 2 }}>
                        {visibleModules.map((m) => {
                            const Icon: LucideIcon = NAV_ICONS[m.icon] ?? LayoutDashboard;
                            if (!m.children?.length) {
                                return (
                                    <ListItemButton key={m.key} component={NavLink} to={m.path} onClick={() => setMobileNavOpen(false)}>
                                        <ListItemIcon><Icon size={18} /></ListItemIcon>
                                        <ListItemText primary={m.name} />
                                    </ListItemButton>
                                );
                            }
                            return (
                                <Box key={m.key}>
                                    <ListSubheader sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'transparent', lineHeight: '36px' }}>
                                        <Icon size={15} /> {m.name}
                                    </ListSubheader>
                                    {withDefaultViewChild(m).children!.map((child) => {
                                        const ChildIcon: LucideIcon = NAV_ICONS[child.icon] ?? LayoutDashboard;
                                        return (
                                            <ListItemButton key={child.path} component={NavLink} to={child.path} onClick={() => setMobileNavOpen(false)} sx={{ pl: 4 }}>
                                                <ListItemIcon><ChildIcon size={17} /></ListItemIcon>
                                                <ListItemText primary={child.name} />
                                            </ListItemButton>
                                        );
                                    })}
                                </Box>
                            );
                        })}
                    </List>
                </Box>
            </Drawer>

            <Dialog open={showPasswordModal} onClose={() => setShowPasswordModal(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Change Password</DialogTitle>
                <Box component="form" onSubmit={handlePasswordChange}>
                    <DialogContent>
                        <Stack spacing={2}>
                            {passwordError && <Alert severity="error">{passwordError}</Alert>}
                            <TextField
                                label="Current Password"
                                type="password"
                                required
                                fullWidth
                                value={passwordData.current}
                                onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })}
                            />
                            <TextField
                                label="New Password"
                                type="password"
                                required
                                fullWidth
                                value={passwordData.new}
                                onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })}
                            />
                            <TextField
                                label="Confirm New Password"
                                type="password"
                                required
                                fullWidth
                                value={passwordData.confirm}
                                onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })}
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 3 }}>
                        <Button color="inherit" onClick={() => setShowPasswordModal(false)}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={passwordLoading}>
                            {passwordLoading ? 'Updating…' : 'Update Password'}
                        </Button>
                    </DialogActions>
                </Box>
            </Dialog>

            <Dialog open={showPhotoModal} onClose={() => setShowPhotoModal(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Update Profile Photo</DialogTitle>
                <Box component="form" onSubmit={handlePhotoUpdate}>
                    <DialogContent>
                        <Stack spacing={2} alignItems="center">
                            <Avatar src={newPhotoUrl || undefined} sx={{ width: 96, height: 96 }}>
                                <User size={40} />
                            </Avatar>
                            {photoError && <Alert severity="error" sx={{ width: '100%' }}>{photoError}</Alert>}
                            <TextField
                                label="Image URL"
                                fullWidth
                                value={newPhotoUrl}
                                onChange={(e) => setNewPhotoUrl(e.target.value)}
                                placeholder="Paste an image link…"
                            />
                            <Button component="label" variant="outlined" fullWidth>
                                Upload from device
                                <input type="file" hidden accept="image/*" onChange={handlePhotoChange} />
                            </Button>
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 3 }}>
                        <Button color="inherit" onClick={() => setShowPhotoModal(false)}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={photoLoading || !newPhotoUrl}>
                            {photoLoading ? 'Saving…' : 'Save Changes'}
                        </Button>
                    </DialogActions>
                </Box>
            </Dialog>
        </>
    );
}
