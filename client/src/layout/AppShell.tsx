import { useState, useEffect, type ReactNode } from 'react';
import { Box, IconButton, Typography, Fab, Zoom } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Mic } from 'lucide-react';
import TopNav from './TopNav';
import ContextSidebar from './ContextSidebar';
import VoiceConfirmationModal from '../components/VoiceConfirmationModal';
import useVoiceCommands from '../hooks/useVoiceCommands';
import { getDailyAttendance, getHolidays, getSettings } from '../api';
import { useAuth } from '../auth/AuthContext';
import { TOPNAV_HEIGHT } from './dimensions';
import { getActiveModuleKey } from '../config/menuConfig';
import type { AttendanceRules, AuthUser } from '../types';

const DEFAULT_RULES: AttendanceRules = { weekly_off_days: [0], nth_saturdays_off: [2] };
const SIDEBAR_COLLAPSED_KEY = 'hrms.sidebar-collapsed';

// Phase 12B: a role is required to check in unless the tenant has opted it
// out via Settings > Attendance Rules > Attendance Required For. Undefined
// (tenant hasn't saved the setting) falls back to today's behavior — every
// role except Organization Administrator (super_admin). Mirrors the same
// helper in EmployeeDashboard.tsx.
function isAttendanceRequired(rules: AttendanceRules, role: string): boolean {
    if (rules.required_for_roles) return rules.required_for_roles.includes(role);
    return role !== 'super_admin';
}

function isDayOff(date: Date, rules: AttendanceRules): boolean {
    const dayOfWeek = date.getDay();
    if (rules.weekly_off_days.includes(dayOfWeek)) return true;
    if (dayOfWeek === 6 && rules.nth_saturdays_off.length > 0) {
        const nth = Math.ceil(date.getDate() / 7);
        if (rules.nth_saturdays_off.includes(nth)) return true;
    }
    return false;
}

export default function AppShell({ children }: { children: ReactNode }) {
    const { user, hasPermission, navTree } = useAuth() as { user: AuthUser } & ReturnType<typeof useAuth>;
    const [sidebarCollapsed, setSidebarCollapsed] = useState(
        () => typeof window !== 'undefined' && window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1',
    );
    const [hasCheckedInToday, setHasCheckedInToday] = useState(true);
    const [dismissedPopup, setDismissedPopup] = useState(false);
    const [pendingVoiceAction, setPendingVoiceAction] = useState<{ intent: string;[k: string]: unknown } | null>(null);

    const navigate = useNavigate();
    const location = useLocation();
    const { isListening, transcript, toggleListening } = useVoiceCommands(user);

    const activeModule = navTree.find((m) => m.key === getActiveModuleKey(location.pathname, navTree));
    const showSidebar = Boolean(activeModule?.children?.length);

    const toggleSidebarCollapsed = () => {
        setSidebarCollapsed((prev) => {
            const next = !prev;
            window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
            return next;
        });
    };

    useEffect(() => {
        const handleVoiceIntent = (e: Event) => {
            const data = (e as CustomEvent).detail;
            const modifyingIntents = ['APPROVE_LEAVE', 'REJECT_LEAVE', 'CANCEL_LEAVE', 'ADD_HOLIDAY', 'ADD_LOCATION', 'CHANGE_CATEGORY'];
            if (modifyingIntents.includes(data.intent)) {
                setPendingVoiceAction(data);
            } else {
                if (data.intent === 'SHOW_TEAM') navigate('/employees');
                if (data.intent === 'NEXT_HOLIDAY') navigate('/holidays');
            }
        };
        window.addEventListener('voiceIntentParsed', handleVoiceIntent);
        return () => window.removeEventListener('voiceIntentParsed', handleVoiceIntent);
    }, [navigate]);

    useEffect(() => {
        if (!user || !hasPermission('attendance.checkin')) return;
        (async () => {
            try {
                const [respAtt, respHol, respSettings] = await Promise.all([
                    getDailyAttendance(),
                    getHolidays(user.location_id ?? undefined),
                    getSettings(),
                ]);
                const attendances = respAtt.data;
                const holidays: { date: string }[] = respHol.data;
                const rules: AttendanceRules = respSettings.data.attendance_rules ?? DEFAULT_RULES;

                // Phase 12B: no reminder for a role the tenant has opted out of
                // attendance (e.g. Organization Administrator, unchecked by default).
                if (!isAttendanceRequired(rules, user.role)) {
                    setHasCheckedInToday(true);
                    return;
                }

                const today = new Date();
                const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                const isHoliday = holidays.some((h) => h.date === dateStr);
                const isOff = isHoliday || isDayOff(today, rules);

                const hasCheckedIn = attendances.some((a: { user_id: number }) => a.user_id === user.id);
                const trackingStart = user.created_at ? String(user.created_at).split(' ')[0] : user.joining_date;
                const isJoiningDay = trackingStart === dateStr;

                if (!hasCheckedIn && !isJoiningDay && !isOff) {
                    setHasCheckedInToday(false);
                    setDismissedPopup(false);
                } else {
                    setHasCheckedInToday(true);
                }
            } catch (err) {
                console.error('Failed to check daily attendance:', err);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const shouldShowPopup = user && !hasCheckedInToday && !dismissedPopup && location.pathname !== '/attendance' && location.pathname !== '/login';

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            <TopNav isListening={isListening} transcript={transcript} toggleListening={toggleListening} />
            {showSidebar && activeModule && (
                <ContextSidebar module={activeModule} collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebarCollapsed} />
            )}

            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    minWidth: 0,
                    mt: `${TOPNAV_HEIGHT}px`,
                    p: { xs: 2, sm: 3, md: 4 },
                }}
            >
                {children}
            </Box>

            {shouldShowPopup && (
                <Box
                    onClick={() => { setDismissedPopup(true); navigate('/attendance'); }}
                    sx={{
                        position: 'fixed', inset: 0, bgcolor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400,
                    }}
                >
                    <Box
                        onClick={(e) => e.stopPropagation()}
                        sx={{
                            bgcolor: 'background.paper', borderRadius: 6, p: 4, maxWidth: 340, width: '90%',
                            textAlign: 'center', position: 'relative', boxShadow: 24,
                        }}
                    >
                        <IconButton
                            size="small"
                            onClick={() => setDismissedPopup(true)}
                            sx={{ position: 'absolute', top: 12, right: 12, bgcolor: 'action.hover' }}
                        >
                            <X size={16} />
                        </IconButton>
                        <Typography variant="h1" sx={{ fontSize: '2.5rem', mb: 1 }}>👋</Typography>
                        <Typography variant="h6">Hello, {user?.name ? user.name.split(' ')[0] : 'there'}!</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            It looks like you haven't checked in yet today. Tap here to start your day! ✨
                        </Typography>
                    </Box>
                </Box>
            )}

            <Zoom in>
                <Fab
                    color={isListening ? 'success' : 'primary'}
                    onClick={toggleListening}
                    sx={{ position: 'fixed', bottom: 24, right: 24, display: { md: 'none' }, zIndex: 1300 }}
                    aria-label="AI voice assistant"
                >
                    <Mic size={24} />
                </Fab>
            </Zoom>

            {pendingVoiceAction && (
                <VoiceConfirmationModal
                    actionData={pendingVoiceAction}
                    onClose={(success: boolean) => {
                        setPendingVoiceAction(null);
                        if (success) {
                            console.info('Voice command executed successfully');
                        }
                    }}
                />
            )}
        </Box>
    );
}
