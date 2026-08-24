import { useState, useEffect, type FormEvent } from 'react';
import {
    Box, Card, Typography, Stack, Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, FormControl, InputLabel, Select, MenuItem, IconButton, Grid2 as Grid,
} from '@mui/material';
import { Plus, Gift, MapPin, Trash2, CalendarDays, PartyPopper, Building } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getHolidays, addHoliday, deleteHoliday, getLocations } from '../api';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, EmptyState, StatCard, ConfirmDialog } from '../components/ui';
import { getErrorMessage, type AuthUser } from '../types';

interface Holiday { id: number; name: string; date: string; location_name?: string; location_id?: number | null }
interface Location { id: number; name: string }
interface GroupedHoliday extends Holiday { locations: string[]; ids: number[] }

export default function HolidayCalendarPage() {
    const { user, hasPermission } = useAuth() as { user: AuthUser } & ReturnType<typeof useAuth>;
    const { enqueueSnackbar } = useSnackbar();
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newHoliday, setNewHoliday] = useState<{ name: string; date: string; location_id: number | string | null }>({ name: '', date: '', location_id: '' });
    const [locations, setLocations] = useState<Location[]>([]);
    const [selectedLocationId, setSelectedLocationId] = useState(user.location_id ?? '');
    const [deletingHoliday, setDeletingHoliday] = useState<GroupedHoliday | null>(null);

    const canManageHolidays = hasPermission('holidays.manage');

    useEffect(() => {
        fetchLocations();
    }, []);

    useEffect(() => {
        fetchHolidays();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedLocationId]);

    const fetchLocations = async () => {
        try {
            const resp = await getLocations();
            setLocations(resp.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchHolidays = async () => {
        try {
            const resp = await getHolidays(selectedLocationId || undefined);
            setHolidays(resp.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleAddHoliday = async (e: FormEvent) => {
        e.preventDefault();
        try {
            await addHoliday(newHoliday);
            setShowAddModal(false);
            setNewHoliday({ name: '', date: '', location_id: '' });
            fetchHolidays();
            enqueueSnackbar('Holiday added successfully!', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to add holiday. Please try again.'), { variant: 'error' });
        }
    };

    const confirmDeleteHoliday = async () => {
        if (!deletingHoliday) return;
        try {
            await Promise.all(deletingHoliday.ids.map((id) => deleteHoliday(id)));
            setHolidays((prev) => prev.filter((h) => !deletingHoliday.ids.includes(h.id)));
            enqueueSnackbar('Holiday removed', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to remove holiday'), { variant: 'error' });
        } finally {
            setDeletingHoliday(null);
        }
    };

    const groupedHolidays = holidays.reduce<Record<string, GroupedHoliday[]>>((acc, h) => {
        const month = new Date(h.date).toLocaleString('default', { month: 'long', year: 'numeric' });
        if (!acc[month]) acc[month] = [];
        const existing = acc[month].find((gh) => gh.name === h.name && gh.date === h.date);
        if (existing) {
            if (h.location_name && !existing.locations.includes(h.location_name)) existing.locations.push(h.location_name);
            existing.ids.push(h.id);
        } else {
            acc[month].push({ ...h, locations: h.location_name ? [h.location_name] : [], ids: [h.id] });
        }
        return acc;
    }, {});

    const currentYear = new Date().getFullYear();
    const todayStr = new Date().toISOString().split('T')[0];
    const holidaysThisYear = holidays.filter((h) => new Date(h.date).getFullYear() === currentYear).length;
    const nextHoliday = [...holidays].filter((h) => h.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))[0];
    const daysToNext = nextHoliday ? Math.ceil((new Date(nextHoliday.date).getTime() - new Date(todayStr).getTime()) / 86400000) : null;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1000, mx: 'auto' }}>
            <PageHeader
                title="Holiday Calendar"
                subtitle="Upcoming public holidays and company off-days"
                actions={
                    <>
                        {canManageHolidays && (
                            <FormControl size="small" sx={{ minWidth: 180 }}>
                                <InputLabel>Location</InputLabel>
                                <Select
                                    label="Location"
                                    value={selectedLocationId}
                                    onChange={(e) => setSelectedLocationId(e.target.value)}
                                    startAdornment={<MapPin size={15} style={{ marginRight: 6 }} />}
                                >
                                    <MenuItem value="">All Locations</MenuItem>
                                    {locations.map((loc) => <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        )}
                        {canManageHolidays && (
                            <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setShowAddModal(true)}>Add Holiday</Button>
                        )}
                    </>
                }
            />

            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <StatCard label={`Holidays in ${currentYear}`} value={holidaysThisYear} icon={<CalendarDays size={20} />} color="primary" />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <StatCard
                        label="Next Holiday"
                        value={nextHoliday ? `${nextHoliday.name} · ${daysToNext === 0 ? 'Today' : `${daysToNext}d`}` : 'None upcoming'}
                        icon={<PartyPopper size={20} />}
                        color="warning"
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <StatCard label="Locations" value={locations.length} icon={<Building size={20} />} color="info" />
                </Grid>
            </Grid>

            {Object.keys(groupedHolidays).length === 0 ? (
                <Card sx={{ p: 4 }}><EmptyState title="No holidays listed" description="No holidays are listed for this location yet." /></Card>
            ) : (
                Object.entries(groupedHolidays).map(([month, monthHolidays]) => (
                    <Box key={month} sx={{ mb: 4 }}>
                        <Typography variant="h6" sx={{ mb: 2, pb: 1, borderBottom: '2px solid', borderColor: 'primary.main', color: 'primary.main', opacity: 0.9 }}>
                            {month}
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 2 }}>
                            {monthHolidays.map((h) => (
                                <Card key={h.id} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Stack alignItems="center" justifyContent="center" sx={{ width: 56, height: 56, borderRadius: 2, bgcolor: 'primary.main', color: 'primary.contrastText', flexShrink: 0 }}>
                                        <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', lineHeight: 1 }}>{new Date(h.date).getDate()}</Typography>
                                        <Typography variant="caption" sx={{ textTransform: 'uppercase', fontWeight: 700, opacity: 0.9 }}>
                                            {new Date(h.date).toLocaleString('default', { weekday: 'short' })}
                                        </Typography>
                                    </Stack>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography sx={{ fontWeight: 700 }}>{h.name}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{new Date(h.date).toDateString()}</Typography>
                                        {h.locations.length > 0 ? (
                                            <Stack direction="row" flexWrap="wrap" gap={0.5}>
                                                {h.locations.map((loc) => (
                                                    <Chip key={loc} size="small" icon={<MapPin size={10} />} label={loc} sx={{ height: 20, fontSize: '0.65rem' }} />
                                                ))}
                                            </Stack>
                                        ) : (
                                            <Chip size="small" label="All Locations" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                                        )}
                                    </Box>
                                    {canManageHolidays ? (
                                        <IconButton size="small" onClick={() => setDeletingHoliday(h)} sx={{ flexShrink: 0 }}>
                                            <Trash2 size={16} />
                                        </IconButton>
                                    ) : (
                                        <Gift size={22} style={{ opacity: 0.2, flexShrink: 0 }} />
                                    )}
                                </Card>
                            ))}
                        </Box>
                    </Box>
                ))
            )}

            <Dialog open={showAddModal} onClose={() => setShowAddModal(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Add New Holiday</DialogTitle>
                <Box component="form" onSubmit={handleAddHoliday}>
                    <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        <TextField label="Holiday Name" placeholder="e.g., Christmas" fullWidth required value={newHoliday.name} onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })} />
                        <TextField label="Date" type="date" fullWidth required value={newHoliday.date} onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                        <FormControl fullWidth>
                            <InputLabel>Location</InputLabel>
                            <Select label="Location" value={newHoliday.location_id ?? ''} onChange={(e) => setNewHoliday({ ...newHoliday, location_id: e.target.value || null })}>
                                <MenuItem value="">Common (All Locations)</MenuItem>
                                {locations.map((loc) => <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 3 }}>
                        <Button color="inherit" onClick={() => setShowAddModal(false)}>Cancel</Button>
                        <Button type="submit" variant="contained">Save Holiday</Button>
                    </DialogActions>
                </Box>
            </Dialog>

            <ConfirmDialog
                open={!!deletingHoliday}
                title={`Remove "${deletingHoliday?.name}"?`}
                description="This removes the holiday for every location it was scheduled against."
                confirmLabel="Remove"
                destructive
                onConfirm={confirmDeleteHoliday}
                onCancel={() => setDeletingHoliday(null)}
            />
        </Box>
    );
}
