import { useState, useEffect, type FormEvent, type ChangeEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Card, Typography, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Stack, TextField, Button,
    IconButton, Alert, Grid2 as Grid, Chip, FormControl, InputLabel, Select, MenuItem, Checkbox,
    FormControlLabel, FormGroup, Divider, Switch, Dialog, DialogTitle, DialogContent, DialogActions,
    Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import {
    Save, Plus, X, CalendarDays, Lock, ShieldCheck, Settings as SettingsIcon, Bell, MapPin,
    ChevronDown, ChevronUp, Menu as MenuIcon, Users, Link2, Building2, Upload, Laptop, Wallet, Layers,
} from 'lucide-react';
import { useSnackbar } from 'notistack';
import {
    getSettings, updateSettings, changePassword,
    getHolidays, addHoliday, deleteHoliday, getFlexiHolidays, addFlexiHoliday, deleteFlexiHoliday,
    getLocations, addLocation, deleteLocation,
    getMenuItems, updateMenuItems,
    getRoles, getPermissions, updateRolePermissions, createRole, deleteRole,
    updateCompanyProfile,
} from '../api';
import type { CompanyProfile } from '../api/company';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, ConfirmDialog, PageSpinner } from '../components/ui';
import { getErrorMessage, type AttendanceRules, type LeaveAllocation } from '../types';
import WorkModesPage from './WorkModesPage';
import PayrollSettingsPage from './PayrollSettingsPage';
import SalaryGradesPage from './SalaryGradesPage';

const CURRENCY_OPTIONS = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED'];
const DATE_FORMAT_OPTIONS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_RULES: AttendanceRules = { weekly_off_days: [0], nth_saturdays_off: [2] };

// Shown when the caller can't reach GET /roles (e.g. Attendance
// Administrator, who holds attendance.settings.manage but not roles.view) —
// mirrors tenantProvisioning.service.js's ROLE_NAMES so the checklist still
// reflects the real default role set instead of coming up empty.
const FALLBACK_ROLE_OPTIONS = [
    { code: 'employee', name: 'Employee' },
    { code: 'manager', name: 'Manager' },
    { code: 'hr', name: 'HR Administrator' },
    { code: 'payroll_admin', name: 'Payroll Administrator' },
    { code: 'attendance_admin', name: 'Attendance Administrator' },
    { code: 'super_admin', name: 'Organization Administrator' },
];

interface HolidayRow { id: number; name: string; date: string; location_id?: number | null; location_name?: string }
interface GroupedHoliday extends HolidayRow { location_names: string[]; ids: number[] }
interface LocationRow { id: number; name: string }
interface MenuRow { id: number; name: string; path: string; icon: string; permission: string | null; any_permission: string[]; sort_order: number; is_active: boolean; is_placeholder: boolean; is_feature_enabled: boolean; parent_id?: number | null; module?: string | null }
interface PermissionRow { id: number; code: string; module: string; description: string }
interface RoleRow { id: number; code: string; name: string; description?: string | null; is_system: boolean; user_count: number; permissions: string[] }

const emptyCompanyForm: Partial<CompanyProfile> = {
    name: '', currency: 'INR', date_format: 'DD/MM/YYYY', financial_year_start_month: 4,
    logo_url: '', address_line1: '', address_line2: '', city: '', state: '', country: '', postal_code: '',
    phone: '', contact_email: '', website: '', theme_primary_color: '', theme_secondary_color: '',
};

export default function SettingsPage() {
    const { hasPermission, hasAnyPermission, companyProfile: authCompanyProfile, refreshCompanyProfile } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const navigate = useNavigate();
    const canManageCompany = hasPermission('company.manage');
    const canManageGeneral = hasPermission('general.settings.manage');
    const canManageLocations = hasPermission('locations.manage');
    const canManageHolidays = hasPermission('holidays.manage');
    const canManageAttendanceRules = hasPermission('attendance.settings.manage');
    const canManageMenu = hasPermission('menu.manage');
    const canManageRoles = hasPermission('roles.manage');
    const canManageWorkModes = hasPermission('work-modes.manage');
    const canManagePayrollSettings = hasAnyPermission(['payroll.settings.view', 'payroll.settings.manage']);
    const canManageSalaryGrades = hasPermission('salary-grades.manage');
    const canViewAudit = hasPermission('reports.audit.view');
    const canSeeAnyAdminTab = canManageLocations || canManageHolidays || canManageMenu || canManageRoles;
    // Matches the navSections order below — lands on the first tab this role can actually see.
    const defaultTab = canManageCompany ? 'company'
        : canManageGeneral ? 'general'
        : canManageLocations ? 'locations'
        : canManageHolidays ? 'holiday-config'
        : canManageAttendanceRules ? 'attendance-rules'
        : canManageWorkModes ? 'work-modes'
        : canManagePayrollSettings ? 'payroll-settings'
        : canManageMenu ? 'menu'
        : canManageRoles ? 'roles'
        : canManageSalaryGrades ? 'salary-grades'
        : 'security';

    // Company profile
    const [companyForm, setCompanyForm] = useState<Partial<CompanyProfile>>(emptyCompanyForm);
    const [savingCompany, setSavingCompany] = useState(false);

    useEffect(() => {
        if (authCompanyProfile) setCompanyForm({ ...emptyCompanyForm, ...authCompanyProfile });
    }, [authCompanyProfile]);

    const [activeTab, setActiveTab] = useState(defaultTab);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    // General
    const [settings, setSettings] = useState<{ leave_allocations: LeaveAllocation[]; attendance_link: string }>({
        leave_allocations: [{ type: 'casual', days: 10 }, { type: 'sick', days: 5 }, { type: 'paid', days: 15 }],
        attendance_link: '',
    });
    const [saving, setSaving] = useState(false);

    // Attendance rules
    const [attendanceRules, setAttendanceRules] = useState<AttendanceRules>(DEFAULT_RULES);
    const [savingRules, setSavingRules] = useState(false);

    // Locations
    const [locations, setLocations] = useState<LocationRow[]>([]);
    const [newLocationName, setNewLocationName] = useState('');

    // Holidays
    const [viewYear, setViewYear] = useState(new Date().getFullYear());
    const [holidays, setHolidays] = useState<HolidayRow[]>([]);
    const [flexiHolidays, setFlexiHolidays] = useState<HolidayRow[]>([]);
    const [newHoliday, setNewHoliday] = useState<{ name: string; date: string; isFlexi: boolean; location_ids: number[] }>({ name: '', date: '', isFlexi: false, location_ids: [] });

    // Menu management
    const [menuItems, setMenuItems] = useState<MenuRow[]>([]);
    const [savingMenu, setSavingMenu] = useState(false);

    // Roles & permissions
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [permissions, setPermissions] = useState<PermissionRow[]>([]);
    const [draftPermissions, setDraftPermissions] = useState<Record<number, Set<string>>>({});
    const [savingRoleId, setSavingRoleId] = useState<number | null>(null);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleDescription, setNewRoleDescription] = useState('');
    const [cloneFromRoleId, setCloneFromRoleId] = useState('');
    const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
    const [deletingRole, setDeletingRole] = useState<RoleRow | null>(null);

    // Security
    const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState<{ text: string; type: 'success' | 'error' | '' }>({ text: '', type: '' });

    useEffect(() => {
        fetchSettings();
        if (canSeeAnyAdminTab) {
            fetchAdminData();
        } else {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchAdminData = async () => {
        try {
            const [hResp, fResp, lResp, mResp, rResp, pResp] = await Promise.all([
                getHolidays(), getFlexiHolidays(), getLocations(), getMenuItems(), getRoles(), getPermissions(),
            ]);
            setHolidays(hResp.data);
            setFlexiHolidays(fResp.data);
            setLocations(lResp.data);
            setMenuItems(mResp.data.map((m: MenuRow & { any_permission: string | null }) => ({
                ...m,
                any_permission: m.any_permission ? String(m.any_permission).split(',') : [],
            })).sort((a: MenuRow, b: MenuRow) => a.sort_order - b.sort_order));
            setRoles(rResp.data);
            setPermissions(pResp.data);
            setDraftPermissions(Object.fromEntries(rResp.data.map((r: RoleRow) => [r.id, new Set(r.permissions)])));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const resp = await getSettings();
            let allocations: LeaveAllocation[] = [];
            try {
                if (resp.data.leave_allocations) {
                    allocations = typeof resp.data.leave_allocations === 'string' ? JSON.parse(resp.data.leave_allocations) : resp.data.leave_allocations;
                }
            } catch { /* fall through to default */ }

            setSettings({
                leave_allocations: allocations.length > 0 ? allocations : [{ type: 'casual', days: 10 }, { type: 'sick', days: 5 }, { type: 'paid', days: 15 }],
                attendance_link: resp.data.attendance_link || '',
            });
            setAttendanceRules(resp.data.attendance_rules || DEFAULT_RULES);
        } catch (err) {
            console.error('Failed to load settings', err);
        }
    };

    const flash = (text: string) => { setMessage(text); setTimeout(() => setMessage(''), 3000); };

    const handleSaveCompany = async () => {
        setSavingCompany(true);
        try {
            await updateCompanyProfile(companyForm);
            await refreshCompanyProfile();
            flash('Company profile saved!');
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error saving company profile'), { variant: 'error' });
        } finally {
            setSavingCompany(false);
        }
    };

    const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 300 * 1024) {
            enqueueSnackbar('Logo image too large (max 300KB)', { variant: 'error' });
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => setCompanyForm((prev) => ({ ...prev, logo_url: reader.result as string }));
        reader.readAsDataURL(file);
    };

    const handleSaveGeneral = async () => {
        setSaving(true);
        try {
            await updateSettings({
                leave_allocations: JSON.stringify(settings.leave_allocations.filter((a) => a.type.trim() !== '')),
                attendance_link: settings.attendance_link,
            });
            flash('Settings saved successfully!');
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error saving settings'), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveAttendanceRules = async () => {
        setSavingRules(true);
        try {
            await updateSettings({ attendance_rules: JSON.stringify(attendanceRules) });
            flash('Attendance rules saved!');
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error saving attendance rules'), { variant: 'error' });
        } finally {
            setSavingRules(false);
        }
    };

    const toggleWeeklyOff = (day: number) => {
        setAttendanceRules((prev) => ({
            ...prev,
            weekly_off_days: prev.weekly_off_days.includes(day) ? prev.weekly_off_days.filter((d) => d !== day) : [...prev.weekly_off_days, day].sort(),
        }));
    };
    const toggleNthSaturday = (n: number) => {
        setAttendanceRules((prev) => ({
            ...prev,
            nth_saturdays_off: prev.nth_saturdays_off.includes(n) ? prev.nth_saturdays_off.filter((d) => d !== n) : [...prev.nth_saturdays_off, n].sort(),
        }));
    };

    // Roles this tenant can manage attendance for — falls back to the
    // standard role set when the caller can't reach GET /roles (roles state
    // stays empty for an Attendance Administrator who lacks roles.view).
    const attendanceRoleOptions = roles.length > 0 ? roles.map((r) => ({ code: r.code, name: r.name })) : FALLBACK_ROLE_OPTIONS;
    // Undefined means this tenant hasn't saved the setting yet — default to
    // today's behavior (everyone except Organization Administrator).
    const requiredForRoles = attendanceRules.required_for_roles
        ?? attendanceRoleOptions.filter((r) => r.code !== 'super_admin').map((r) => r.code);
    const toggleRequiredRole = (code: string) => {
        setAttendanceRules((prev) => {
            const current = prev.required_for_roles ?? requiredForRoles;
            return {
                ...prev,
                required_for_roles: current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
            };
        });
    };

    const fetchHolidaysAndLocations = async () => {
        const [hResp, fResp, lResp] = await Promise.all([getHolidays(), getFlexiHolidays(), getLocations()]);
        setHolidays(hResp.data);
        setFlexiHolidays(fResp.data);
        setLocations(lResp.data);
    };

    const handleAddHoliday = async () => {
        if (!newHoliday.name || !newHoliday.date) return;
        try {
            const payload = { name: newHoliday.name, date: newHoliday.date, location_ids: newHoliday.location_ids };
            if (newHoliday.isFlexi) await addFlexiHoliday(payload); else await addHoliday(payload);
            setNewHoliday({ name: '', date: '', isFlexi: newHoliday.isFlexi, location_ids: [] });
            fetchHolidaysAndLocations();
            flash('Holiday added successfully!');
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error adding holiday'), { variant: 'error' });
        }
    };

    const handleDeleteHoliday = async (ids: number[], isFlexi: boolean) => {
        try {
            for (const id of ids) { if (isFlexi) await deleteFlexiHoliday(id); else await deleteHoliday(id); }
            fetchHolidaysAndLocations();
            flash('Holiday deleted successfully!');
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to delete holiday'), { variant: 'error' });
        }
    };

    const handleAddLocation = async () => {
        if (!newLocationName.trim()) return;
        try {
            await addLocation({ name: newLocationName });
            setNewLocationName('');
            fetchHolidaysAndLocations();
            flash('Location added successfully!');
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error adding location'), { variant: 'error' });
        }
    };

    const handleDeleteLocation = async (id: number) => {
        try {
            await deleteLocation(id);
            fetchHolidaysAndLocations();
            flash('Location deleted successfully!');
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Employees might be assigned to this location'), { variant: 'error' });
        }
    };

    const groupHolidays = (list: HolidayRow[]): GroupedHoliday[] => {
        const grouped: GroupedHoliday[] = [];
        list.forEach((h) => {
            const existing = grouped.find((gh) => gh.name === h.name && gh.date === h.date);
            if (existing) {
                if (h.location_name && !existing.location_names.includes(h.location_name)) existing.location_names.push(h.location_name);
                existing.ids.push(h.id);
            } else {
                grouped.push({ ...h, location_names: h.location_name ? [h.location_name] : [], ids: [h.id] });
            }
        });
        return grouped;
    };

    const moveMenuItem = (index: number, dir: -1 | 1) => {
        setMenuItems((prev) => {
            const next = [...prev];
            const target = index + dir;
            if (target < 0 || target >= next.length) return prev;
            [next[index], next[target]] = [next[target], next[index]];
            return next.map((m, i) => ({ ...m, sort_order: i * 10 }));
        });
    };

    const handleSaveMenu = async () => {
        setSavingMenu(true);
        try {
            await updateMenuItems(menuItems.map((m) => ({
                id: m.id, parent_id: m.parent_id ?? null, module: m.module ?? null,
                name: m.name, path: m.path, icon: m.icon, permission: m.permission || null,
                anyPermission: m.any_permission, sort_order: m.sort_order, is_active: m.is_active,
                is_placeholder: m.is_placeholder, is_feature_enabled: m.is_feature_enabled,
            })));
            flash('Menu updated! Reload the app to see nav changes.');
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save menu'), { variant: 'error' });
        } finally {
            setSavingMenu(false);
        }
    };

    const togglePermission = (roleId: number, code: string) => {
        setDraftPermissions((prev) => {
            const next = new Set(prev[roleId]);
            if (next.has(code)) next.delete(code); else next.add(code);
            return { ...prev, [roleId]: next };
        });
    };

    const handleSaveRolePermissions = async (role: RoleRow) => {
        setSavingRoleId(role.id);
        try {
            await updateRolePermissions(role.id, Array.from(draftPermissions[role.id] || []));
            setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, permissions: Array.from(draftPermissions[role.id] || []) } : r)));
            flash(`${role.name} permissions updated!`);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to update role permissions'), { variant: 'error' });
        } finally {
            setSavingRoleId(null);
        }
    };

    const handleCreateRole = async (e: FormEvent) => {
        e.preventDefault();
        try {
            await createRole({ name: newRoleName, description: newRoleDescription || undefined, cloneFromRoleId: cloneFromRoleId || undefined });
            setIsAddRoleOpen(false);
            setNewRoleName('');
            setNewRoleDescription('');
            setCloneFromRoleId('');
            fetchAdminData();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to create role'), { variant: 'error' });
        }
    };

    const confirmDeleteRole = async () => {
        if (!deletingRole) return;
        try {
            await deleteRole(deletingRole.id);
            setRoles((prev) => prev.filter((r) => r.id !== deletingRole.id));
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to delete role'), { variant: 'error' });
        } finally {
            setDeletingRole(null);
        }
    };

    const handlePasswordChange = async (e: FormEvent) => {
        e.preventDefault();
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordMessage({ text: 'New passwords do not match!', type: 'error' });
            return;
        }
        setPasswordLoading(true);
        setPasswordMessage({ text: '', type: '' });
        try {
            await changePassword({ currentPassword: passwordData.oldPassword, newPassword: passwordData.newPassword });
            setPasswordMessage({ text: 'Password updated successfully!', type: 'success' });
            setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err) {
            setPasswordMessage({ text: getErrorMessage(err, 'Failed to update password'), type: 'error' });
        } finally {
            setPasswordLoading(false);
            setTimeout(() => setPasswordMessage({ text: '', type: '' }), 4000);
        }
    };

    // Grouped into labeled sections (Phase 11A) so the sidebar reads as a
    // settings hub rather than a flat, ungrouped tab list. Items with `href`
    // navigate to an existing standalone route instead of switching
    // `activeTab` — reserved for Audit, whose content (a shared multi-category
    // Analytics workspace with its own nav/URL-state) can't be embedded here
    // without fighting this page's own tab state. Work Modes/Payroll
    // Settings/Salary Grades render in-place instead (their standalone routes
    // still exist independently — Payroll Settings is still reachable from
    // the Payroll module's own nav).
    const navSections: { section: string; items: { id: string; label: string; icon: ReactNode; visible: boolean; href?: string }[] }[] = [
        {
            section: 'Organization',
            items: [
                { id: 'company', label: 'Company Profile', icon: <Building2 size={20} />, visible: canManageCompany },
                { id: 'general', label: 'General Config', icon: <SettingsIcon size={20} />, visible: canManageGeneral },
                { id: 'locations', label: 'Locations / Offices', icon: <MapPin size={20} />, visible: canManageLocations },
            ],
        },
        {
            section: 'Attendance',
            items: [
                { id: 'holiday-config', label: 'Holiday Config', icon: <CalendarDays size={20} />, visible: canManageHolidays },
                { id: 'attendance-rules', label: 'Attendance Rules', icon: <Bell size={20} />, visible: canManageAttendanceRules },
                { id: 'work-modes', label: 'Work Modes', icon: <Laptop size={20} />, visible: canManageWorkModes },
            ],
        },
        {
            section: 'Payroll',
            items: [
                { id: 'payroll-settings', label: 'Payroll Settings', icon: <Wallet size={20} />, visible: canManagePayrollSettings },
            ],
        },
        {
            section: 'Security',
            items: [
                { id: 'security', label: 'Account Security', icon: <ShieldCheck size={20} />, visible: true },
            ],
        },
        {
            section: 'Advanced',
            items: [
                { id: 'menu', label: 'Menu Management', icon: <MenuIcon size={20} />, visible: canManageMenu },
                { id: 'roles', label: 'Roles & Permissions', icon: <Users size={20} />, visible: canManageRoles },
                { id: 'salary-grades', label: 'Salary Grades', icon: <Layers size={20} />, visible: canManageSalaryGrades },
                { id: 'audit', label: 'Audit & Compliance', icon: <ShieldCheck size={20} />, visible: canViewAudit, href: '/reports/audit' },
            ],
        },
    ]
        .map((s) => ({ ...s, items: s.items.filter((i) => i.visible) }))
        .filter((s) => s.items.length > 0);

    if (loading) return <PageSpinner />;

    return (
        <Box className="fade-in">
            <PageHeader title="Settings" subtitle="Manage system preferences and organization configuration" />

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px 1fr' }, gap: 3 }}>
                <Card sx={{ p: 1, height: 'fit-content', position: { md: 'sticky' }, top: { md: 88 } }}>
                    <List sx={{ py: 0 }}>
                        {navSections.map((section) => (
                            <Box key={section.section} sx={{ mb: 0.5 }}>
                                <ListSubheader sx={{ bgcolor: 'transparent', lineHeight: '32px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
                                    {section.section.toUpperCase()}
                                </ListSubheader>
                                {section.items.map((item) => (
                                    <ListItemButton
                                        key={item.id}
                                        selected={!item.href && activeTab === item.id}
                                        onClick={() => (item.href ? navigate(item.href) : setActiveTab(item.id))}
                                        sx={{ borderRadius: 2, mb: 0.5 }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon>
                                        <ListItemText primary={item.label} />
                                    </ListItemButton>
                                ))}
                            </Box>
                        ))}
                    </List>
                </Card>

                <Box>
                    {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}

                    {activeTab === 'company' && (
                        <Card sx={{ p: { xs: 2.5, sm: 4 } }}>
                            <Typography variant="h6" sx={{ mb: 0.5 }}>Company Profile</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                This information appears on payslips, in the app header, and drives locale defaults across the system.
                            </Typography>

                            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                                <Box
                                    component="img"
                                    src={companyForm.logo_url || 'logo.webp'}
                                    alt="Company logo"
                                    sx={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 1 }}
                                />
                                <Button component="label" variant="outlined" startIcon={<Upload size={16} />}>
                                    Upload Logo
                                    <input type="file" hidden accept="image/*" onChange={handleLogoUpload} />
                                </Button>
                            </Stack>

                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField fullWidth label="Company Name" value={companyForm.name || ''} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField fullWidth label="Website" value={companyForm.website || ''} onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })} />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField fullWidth label="Contact Email" value={companyForm.contact_email || ''} onChange={(e) => setCompanyForm({ ...companyForm, contact_email: e.target.value })} />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField fullWidth label="Phone" value={companyForm.phone || ''} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} />
                                </Grid>
                                <Grid size={12}>
                                    <TextField fullWidth label="Address Line 1" value={companyForm.address_line1 || ''} onChange={(e) => setCompanyForm({ ...companyForm, address_line1: e.target.value })} />
                                </Grid>
                                <Grid size={12}>
                                    <TextField fullWidth label="Address Line 2" value={companyForm.address_line2 || ''} onChange={(e) => setCompanyForm({ ...companyForm, address_line2: e.target.value })} />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 3 }}>
                                    <TextField fullWidth label="City" value={companyForm.city || ''} onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })} />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 3 }}>
                                    <TextField fullWidth label="State" value={companyForm.state || ''} onChange={(e) => setCompanyForm({ ...companyForm, state: e.target.value })} />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 3 }}>
                                    <TextField fullWidth label="Country" value={companyForm.country || ''} onChange={(e) => setCompanyForm({ ...companyForm, country: e.target.value })} />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 3 }}>
                                    <TextField fullWidth label="Postal Code" value={companyForm.postal_code || ''} onChange={(e) => setCompanyForm({ ...companyForm, postal_code: e.target.value })} />
                                </Grid>
                            </Grid>

                            <Divider sx={{ my: 3 }} />
                            <Typography sx={{ fontWeight: 700, mb: 2 }}>Locale &amp; Financial Year</Typography>
                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <FormControl fullWidth>
                                        <InputLabel>Currency</InputLabel>
                                        <Select label="Currency" value={companyForm.currency || 'INR'} onChange={(e) => setCompanyForm({ ...companyForm, currency: e.target.value })}>
                                            {CURRENCY_OPTIONS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <FormControl fullWidth>
                                        <InputLabel>Date Format</InputLabel>
                                        <Select label="Date Format" value={companyForm.date_format || 'DD/MM/YYYY'} onChange={(e) => setCompanyForm({ ...companyForm, date_format: e.target.value })}>
                                            {DATE_FORMAT_OPTIONS.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <FormControl fullWidth>
                                        <InputLabel>Financial Year Starts</InputLabel>
                                        <Select
                                            label="Financial Year Starts"
                                            value={companyForm.financial_year_start_month ?? 4}
                                            onChange={(e) => setCompanyForm({ ...companyForm, financial_year_start_month: Number(e.target.value) })}
                                        >
                                            {MONTH_NAMES.map((m, i) => <MenuItem key={m} value={i + 1}>{m}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                </Grid>
                            </Grid>

                            <Divider sx={{ my: 3 }} />
                            <Typography sx={{ fontWeight: 700, mb: 2 }}>Branding</Typography>
                            <Stack direction="row" spacing={3} sx={{ mb: 1 }}>
                                <Stack alignItems="center" spacing={0.5}>
                                    <Typography variant="caption" color="text.secondary">Primary Color</Typography>
                                    <input
                                        type="color"
                                        value={companyForm.theme_primary_color || '#4f46e5'}
                                        onChange={(e) => setCompanyForm({ ...companyForm, theme_primary_color: e.target.value })}
                                        style={{ width: 48, height: 32, border: 'none', background: 'none', cursor: 'pointer' }}
                                    />
                                </Stack>
                                <Stack alignItems="center" spacing={0.5}>
                                    <Typography variant="caption" color="text.secondary">Secondary Color</Typography>
                                    <input
                                        type="color"
                                        value={companyForm.theme_secondary_color || '#6366f1'}
                                        onChange={(e) => setCompanyForm({ ...companyForm, theme_secondary_color: e.target.value })}
                                        style={{ width: 48, height: 32, border: 'none', background: 'none', cursor: 'pointer' }}
                                    />
                                </Stack>
                            </Stack>

                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                                <Button variant="contained" startIcon={<Save size={18} />} onClick={handleSaveCompany} disabled={savingCompany}>
                                    {savingCompany ? 'Saving…' : 'Save Company Profile'}
                                </Button>
                            </Box>
                        </Card>
                    )}

                    {activeTab === 'general' && (
                        <Card sx={{ p: { xs: 2.5, sm: 4 } }}>
                            <Typography variant="h6" sx={{ mb: 0.5 }}>Leave Allocations</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Configure yearly maximums for different leave types.</Typography>

                            <Stack spacing={2} sx={{ mb: 3 }}>
                                {settings.leave_allocations.map((alloc, index) => (
                                    <Stack key={index} direction="row" spacing={2} alignItems="center">
                                        <TextField
                                            label="Type" fullWidth value={alloc.type}
                                            onChange={(e) => {
                                                const next = [...settings.leave_allocations];
                                                next[index] = { ...next[index], type: e.target.value };
                                                setSettings({ ...settings, leave_allocations: next });
                                            }}
                                        />
                                        <TextField
                                            label="Max Days" type="number" sx={{ width: 140 }} value={alloc.days}
                                            onChange={(e) => {
                                                const next = [...settings.leave_allocations];
                                                next[index] = { ...next[index], days: parseInt(e.target.value, 10) || 0 };
                                                setSettings({ ...settings, leave_allocations: next });
                                            }}
                                        />
                                        <IconButton onClick={() => setSettings({ ...settings, leave_allocations: settings.leave_allocations.filter((_, i) => i !== index) })}>
                                            <X size={18} />
                                        </IconButton>
                                    </Stack>
                                ))}
                            </Stack>
                            <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => setSettings({ ...settings, leave_allocations: [...settings.leave_allocations, { type: '', days: 0 }] })}>
                                Add Leave Category
                            </Button>

                            <Divider sx={{ my: 3 }} />
                            <TextField
                                label="Attendance Link"
                                placeholder="e.g. external check-in form / office portal URL"
                                fullWidth
                                value={settings.attendance_link}
                                onChange={(e) => setSettings({ ...settings, attendance_link: e.target.value })}
                                slotProps={{ input: { startAdornment: <Link2 size={16} style={{ marginRight: 8 }} /> } }}
                            />

                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                                <Button variant="contained" startIcon={<Save size={18} />} onClick={handleSaveGeneral} disabled={saving}>
                                    {saving ? 'Saving…' : 'Save Configuration'}
                                </Button>
                            </Box>
                        </Card>
                    )}

                    {activeTab === 'locations' && (
                        <Card sx={{ p: { xs: 2.5, sm: 4 } }}>
                            <Typography variant="h6" sx={{ mb: 0.5 }}>Locations Management</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Add or remove office locations to assign employees and location-specific holidays.</Typography>

                            <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
                                <TextField fullWidth label="Location Name" placeholder="e.g. Bangalore, Kerala, Home Office" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)} />
                                <Button variant="contained" startIcon={<Plus size={18} />} onClick={handleAddLocation} sx={{ whiteSpace: 'nowrap' }}>Add</Button>
                            </Stack>

                            {locations.length === 0 ? (
                                <Typography color="text.secondary">No locations added yet.</Typography>
                            ) : (
                                <Grid container spacing={2}>
                                    {locations.map((loc) => (
                                        <Grid key={loc.id} size={{ xs: 12, sm: 6, md: 4 }}>
                                            <Card variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                <MapPin size={20} />
                                                <Box sx={{ flex: 1 }}>
                                                    <Typography sx={{ fontWeight: 700 }}>{loc.name}</Typography>
                                                    <Chip label="Active Office" size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', mt: 0.3 }} />
                                                </Box>
                                                <IconButton size="small" onClick={() => handleDeleteLocation(loc.id)}><X size={16} /></IconButton>
                                            </Card>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}
                        </Card>
                    )}

                    {activeTab === 'holiday-config' && (
                        <Card sx={{ p: { xs: 2.5, sm: 4 } }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                                <Box>
                                    <Typography variant="h6">Holiday Management</Typography>
                                    <Typography variant="body2" color="text.secondary">Manage the list of regular and Flexi Holidays.</Typography>
                                </Box>
                                <FormControl size="small" sx={{ minWidth: 110 }}>
                                    <InputLabel>Year</InputLabel>
                                    <Select label="Year" value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))}>
                                        {[2025, 2026, 2027, 2028].map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Stack>

                            <Card variant="outlined" sx={{ p: 3, mb: 3 }}>
                                <Typography sx={{ fontWeight: 700, mb: 2 }}>Add New Holiday</Typography>
                                <Grid container spacing={2}>
                                    <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Holiday Name" placeholder="e.g. Independence Day" value={newHoliday.name} onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })} /></Grid>
                                    <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Date" type="date" value={newHoliday.date} onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
                                    <Grid size={12}>
                                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>Applicable Locations</Typography>
                                        <FormGroup row>
                                            <FormControlLabel
                                                control={<Checkbox checked={newHoliday.location_ids.length === 0} onChange={(e) => e.target.checked && setNewHoliday({ ...newHoliday, location_ids: [] })} />}
                                                label="Common (All Locations)"
                                            />
                                            {locations.map((loc) => (
                                                <FormControlLabel
                                                    key={loc.id}
                                                    control={
                                                        <Checkbox
                                                            checked={newHoliday.location_ids.includes(loc.id)}
                                                            onChange={(e) => {
                                                                const ids = e.target.checked ? [...newHoliday.location_ids, loc.id] : newHoliday.location_ids.filter((id) => id !== loc.id);
                                                                setNewHoliday({ ...newHoliday, location_ids: ids });
                                                            }}
                                                        />
                                                    }
                                                    label={loc.name}
                                                />
                                            ))}
                                        </FormGroup>
                                    </Grid>
                                    <Grid size={{ xs: 12, sm: 6 }}>
                                        <ToggleHolidayType value={newHoliday.isFlexi} onChange={(v) => setNewHoliday({ ...newHoliday, isFlexi: v })} />
                                    </Grid>
                                    <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex', alignItems: 'flex-end' }}>
                                        <Button fullWidth variant="contained" startIcon={<Plus size={18} />} onClick={handleAddHoliday}>Add Holiday</Button>
                                    </Grid>
                                </Grid>
                            </Card>

                            <Grid container spacing={2}>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <Typography sx={{ fontWeight: 700, mb: 1.5 }}>Regular Holidays ({viewYear})</Typography>
                                    <HolidayList items={groupHolidays(holidays).filter((h) => new Date(h.date).getFullYear() === viewYear)} onDelete={(ids) => handleDeleteHoliday(ids, false)} />
                                </Grid>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <Typography sx={{ fontWeight: 700, mb: 1.5 }}>Flexi Holidays ({viewYear})</Typography>
                                    <HolidayList items={groupHolidays(flexiHolidays).filter((h) => new Date(h.date).getFullYear() === viewYear)} onDelete={(ids) => handleDeleteHoliday(ids, true)} />
                                </Grid>
                            </Grid>
                        </Card>
                    )}

                    {activeTab === 'attendance-rules' && (
                        <Card sx={{ p: { xs: 2.5, sm: 4 } }}>
                            <Typography variant="h6" sx={{ mb: 0.5 }}>Attendance Rules</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Configure the weekly off days used across attendance calendars and check-in reminders.
                            </Typography>

                            <Typography sx={{ fontWeight: 700, mb: 1 }}>Weekly Off Days</Typography>
                            <FormGroup row sx={{ mb: 3 }}>
                                {WEEKDAY_LABELS.map((label, day) => (
                                    <FormControlLabel key={day} control={<Checkbox checked={attendanceRules.weekly_off_days.includes(day)} onChange={() => toggleWeeklyOff(day)} />} label={label} />
                                ))}
                            </FormGroup>

                            <Typography sx={{ fontWeight: 700, mb: 1 }}>Off Saturdays (by week of month)</Typography>
                            <FormGroup row sx={{ mb: 3 }}>
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <FormControlLabel key={n} control={<Checkbox checked={attendanceRules.nth_saturdays_off.includes(n)} onChange={() => toggleNthSaturday(n)} />} label={`${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} Saturday`} />
                                ))}
                            </FormGroup>

                            <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Attendance Required For</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                Roles left unchecked won't see the daily check-in reminder, missing check-in alerts, or attendance KPI cards. They can still check in manually if they choose to.
                            </Typography>
                            <FormGroup row sx={{ mb: 3 }}>
                                {attendanceRoleOptions.map((role) => (
                                    <FormControlLabel
                                        key={role.code}
                                        control={<Checkbox checked={requiredForRoles.includes(role.code)} onChange={() => toggleRequiredRole(role.code)} />}
                                        label={role.name}
                                    />
                                ))}
                            </FormGroup>

                            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <Button variant="contained" startIcon={<Save size={18} />} onClick={handleSaveAttendanceRules} disabled={savingRules}>
                                    {savingRules ? 'Saving…' : 'Save Rules'}
                                </Button>
                            </Box>
                        </Card>
                    )}

                    {activeTab === 'work-modes' && (
                        <Box>
                            <Typography variant="h6" sx={{ mb: 0.5 }}>Work Modes</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Configure where employees are expected to work from — referenced by attendance policies.
                            </Typography>
                            <WorkModesPage compact />
                        </Box>
                    )}

                    {activeTab === 'payroll-settings' && (
                        <Box>
                            <Typography variant="h6" sx={{ mb: 0.5 }}>Payroll Settings</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Pay cycle, overtime and rounding rules — applied by the calculation engine on every run.
                            </Typography>
                            <PayrollSettingsPage compact />
                        </Box>
                    )}

                    {activeTab === 'salary-grades' && (
                        <Box>
                            <Typography variant="h6" sx={{ mb: 0.5 }}>Salary Grades</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Group salary structures under a grade (Grade → Structure → Employee) so different grades can use different structures.
                            </Typography>
                            <SalaryGradesPage compact />
                        </Box>
                    )}

                    {activeTab === 'menu' && (
                        <Card sx={{ p: { xs: 2.5, sm: 4 } }}>
                            <Typography variant="h6" sx={{ mb: 0.5 }}>Menu Management</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Reorder, rename or hide sidebar navigation entries. New routes still need to be built into the app first.
                            </Typography>

                            <Stack spacing={1.25}>
                                {menuItems.map((item, index) => (
                                    <Stack key={item.id} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                                        <Stack>
                                            <IconButton size="small" disabled={index === 0} onClick={() => moveMenuItem(index, -1)}><ChevronUp size={14} /></IconButton>
                                            <IconButton size="small" disabled={index === menuItems.length - 1} onClick={() => moveMenuItem(index, 1)}><ChevronDown size={14} /></IconButton>
                                        </Stack>
                                        <TextField
                                            size="small" label="Name" value={item.name}
                                            onChange={(e) => setMenuItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, name: e.target.value } : m)))}
                                            sx={{ minWidth: 160 }}
                                        />
                                        <Typography variant="caption" color="text.disabled" sx={{ minWidth: 100 }}>{item.path}</Typography>
                                        {item.is_placeholder && <Chip label="Coming soon" size="small" variant="outlined" />}
                                        <Box sx={{ flex: 1 }} />
                                        <FormControlLabel
                                            control={<Switch checked={item.is_active} onChange={(e) => setMenuItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, is_active: e.target.checked } : m)))} />}
                                            label="Visible"
                                        />
                                        <FormControlLabel
                                            control={<Switch checked={item.is_feature_enabled} onChange={(e) => setMenuItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, is_feature_enabled: e.target.checked } : m)))} />}
                                            label="Feature Enabled"
                                        />
                                    </Stack>
                                ))}
                            </Stack>

                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                                <Button variant="contained" startIcon={<Save size={18} />} onClick={handleSaveMenu} disabled={savingMenu}>
                                    {savingMenu ? 'Saving…' : 'Save Menu'}
                                </Button>
                            </Box>
                        </Card>
                    )}

                    {activeTab === 'roles' && (
                        <Stack spacing={3}>
                            <Card sx={{ p: { xs: 2.5, sm: 4 } }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                                    <Box>
                                        <Typography variant="h6">Roles & Permissions</Typography>
                                        <Typography variant="body2" color="text.secondary">Configure exactly what each role can do — no code deploy required.</Typography>
                                    </Box>
                                    <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => setIsAddRoleOpen(true)}>New Role</Button>
                                </Stack>

                                {roles.map((role) => (
                                    <Accordion key={role.id} disableGutters variant="outlined" sx={{ mb: 1.5, '&:before': { display: 'none' } }}>
                                        <AccordionSummary expandIcon={<ChevronDown size={18} />}>
                                            <Stack sx={{ flex: 1 }}>
                                                <Stack direction="row" spacing={1.5} alignItems="center">
                                                    <Typography sx={{ fontWeight: 700 }}>{role.name}</Typography>
                                                    <Chip size="small" label={`${role.user_count} user${role.user_count === 1 ? '' : 's'}`} />
                                                    {role.is_system && <Chip size="small" label="System" color="primary" variant="outlined" />}
                                                </Stack>
                                                {role.description && <Typography variant="caption" color="text.secondary">{role.description}</Typography>}
                                            </Stack>
                                        </AccordionSummary>
                                        <AccordionDetails>
                                            {Object.entries(
                                                permissions.reduce<Record<string, PermissionRow[]>>((acc, p) => {
                                                    (acc[p.module] ||= []).push(p);
                                                    return acc;
                                                }, {}),
                                            ).map(([module, perms]) => (
                                                <Box key={module} sx={{ mb: 2 }}>
                                                    <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.disabled' }}>{module}</Typography>
                                                    <FormGroup row>
                                                        {perms.map((p) => (
                                                            <FormControlLabel
                                                                key={p.code}
                                                                control={
                                                                    <Checkbox
                                                                        size="small"
                                                                        checked={draftPermissions[role.id]?.has(p.code) ?? false}
                                                                        onChange={() => togglePermission(role.id, p.code)}
                                                                    />
                                                                }
                                                                label={<Typography variant="body2">{p.description || p.code}</Typography>}
                                                            />
                                                        ))}
                                                    </FormGroup>
                                                </Box>
                                            ))}
                                            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
                                                {!role.is_system && (
                                                    <Button color="error" onClick={() => setDeletingRole(role)}>Delete Role</Button>
                                                )}
                                                <Button variant="contained" size="small" disabled={savingRoleId === role.id} onClick={() => handleSaveRolePermissions(role)}>
                                                    {savingRoleId === role.id ? 'Saving…' : 'Save Permissions'}
                                                </Button>
                                            </Stack>
                                        </AccordionDetails>
                                    </Accordion>
                                ))}
                            </Card>
                            <Typography variant="body2" color="text.secondary">
                                Assign roles to a specific employee from the Employees page (Manage Roles action) — a user can hold more than one role at once.
                            </Typography>
                        </Stack>
                    )}

                    {activeTab === 'security' && (
                        <Card sx={{ p: { xs: 2.5, sm: 4 }, maxWidth: 560 }}>
                            <Typography variant="h6" sx={{ mb: 0.5 }}>Password Management</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Ensure your account stays secure by updating your credentials.</Typography>

                            <Box component="form" onSubmit={handlePasswordChange} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                                <TextField label="Current Password" type="password" required fullWidth value={passwordData.oldPassword} onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })} />
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                    <TextField label="New Password" type="password" required fullWidth value={passwordData.newPassword} onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })} />
                                    <TextField label="Confirm Password" type="password" required fullWidth value={passwordData.confirmPassword} onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })} />
                                </Stack>
                                {passwordMessage.text && <Alert severity={passwordMessage.type || 'info'}>{passwordMessage.text}</Alert>}
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button type="submit" variant="contained" startIcon={<Lock size={18} />} disabled={passwordLoading}>
                                        {passwordLoading ? 'Updating…' : 'Update Password'}
                                    </Button>
                                </Box>
                            </Box>
                        </Card>
                    )}
                </Box>
            </Box>

            <Dialog open={isAddRoleOpen} onClose={() => setIsAddRoleOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Create New Role</DialogTitle>
                <Box component="form" onSubmit={handleCreateRole}>
                    <DialogContent>
                        <Stack spacing={2}>
                            <TextField label="Role Name" fullWidth required autoFocus value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Finance Approver" />
                            <TextField label="Description" fullWidth multiline minRows={2} value={newRoleDescription} onChange={(e) => setNewRoleDescription(e.target.value)} placeholder="What this role is for" />
                            <FormControl fullWidth>
                                <InputLabel>Clone permissions from (optional)</InputLabel>
                                <Select label="Clone permissions from (optional)" value={cloneFromRoleId} onChange={(e) => setCloneFromRoleId(e.target.value)}>
                                    <MenuItem value="">Start with no permissions</MenuItem>
                                    {roles.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 3 }}>
                        <Button color="inherit" onClick={() => setIsAddRoleOpen(false)}>Cancel</Button>
                        <Button type="submit" variant="contained">Create Role</Button>
                    </DialogActions>
                </Box>
            </Dialog>

            <ConfirmDialog
                open={!!deletingRole}
                title={`Delete "${deletingRole?.name}"?`}
                description="Users holding this role will lose the permissions it granted."
                confirmLabel="Delete"
                destructive
                onConfirm={confirmDeleteRole}
                onCancel={() => setDeletingRole(null)}
            />
        </Box>
    );
}

function ToggleHolidayType({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>Holiday Type</Typography>
            <Stack direction="row" spacing={1}>
                <Button variant={!value ? 'contained' : 'outlined'} onClick={() => onChange(false)} fullWidth>Regular</Button>
                <Button variant={value ? 'contained' : 'outlined'} onClick={() => onChange(true)} fullWidth>Flexi</Button>
            </Stack>
        </Box>
    );
}

function HolidayList({ items, onDelete }: { items: GroupedHoliday[]; onDelete: (ids: number[]) => void }) {
    if (items.length === 0) return <Typography color="text.secondary" variant="body2">No holidays found for this year.</Typography>;
    return (
        <Stack spacing={1.25} sx={{ maxHeight: 400, overflowY: 'auto' }}>
            {items.map((h) => (
                <Stack key={h.ids.join('-')} direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                    <Box>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{h.name}</Typography>
                        <Typography variant="caption" color="primary.main" sx={{ fontWeight: 700 }}>{new Date(h.date).toLocaleDateString()}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {h.location_names.length > 0 ? h.location_names.join(', ') : 'Common (All Locations)'}
                        </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => onDelete(h.ids)}><X size={16} /></IconButton>
                </Stack>
            ))}
        </Stack>
    );
}
