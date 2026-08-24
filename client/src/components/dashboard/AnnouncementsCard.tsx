import { useState, useEffect, type FormEvent } from 'react';
import { Card, Typography, Stack, Box, IconButton, Button, TextField, Collapse } from '@mui/material';
import { Megaphone, Plus, Trash2 } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getAnnouncements, createAnnouncement, deleteAnnouncement } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { getErrorMessage } from '../../types';
import EmptyState from '../ui/EmptyState';

interface Announcement {
    id: number;
    title: string;
    body: string;
    created_at: string;
    author_name: string;
}

export default function AnnouncementsCard() {
    const { hasPermission } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const canManage = hasPermission('announcements.manage');

    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ title: '', body: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchAnnouncements();
    }, []);

    const fetchAnnouncements = async () => {
        try {
            const resp = await getAnnouncements();
            setAnnouncements(resp.data);
        } catch {
            // non-critical widget
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await createAnnouncement(form);
            setForm({ title: '', body: '' });
            setShowForm(false);
            enqueueSnackbar('Announcement posted', { variant: 'success' });
            fetchAnnouncements();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to post announcement'), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await deleteAnnouncement(id);
            setAnnouncements((prev) => prev.filter((a) => a.id !== id));
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to remove announcement'), { variant: 'error' });
        }
    };

    if (loading) return null;

    return (
        <Card sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6">Company Announcements</Typography>
                {canManage && (
                    <IconButton size="small" onClick={() => setShowForm((v) => !v)}>
                        <Plus size={18} />
                    </IconButton>
                )}
            </Stack>

            {canManage && (
                <Collapse in={showForm}>
                    <Box component="form" onSubmit={handleCreate} sx={{ mb: 2 }}>
                        <Stack spacing={1.5}>
                            <TextField
                                label="Title" size="small" required fullWidth
                                value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                            />
                            <TextField
                                label="Message" size="small" required fullWidth multiline minRows={2}
                                value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                            />
                            <Button type="submit" variant="contained" size="small" disabled={saving} sx={{ alignSelf: 'flex-start' }}>
                                {saving ? 'Posting…' : 'Post announcement'}
                            </Button>
                        </Stack>
                    </Box>
                </Collapse>
            )}

            {announcements.length === 0 ? (
                <EmptyState icon={<Megaphone size={28} />} title="No announcements yet" />
            ) : (
                <Stack spacing={1.5}>
                    {announcements.slice(0, 4).map((a) => (
                        <Stack key={a.id} direction="row" spacing={1.5} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{a.title}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{a.body}</Typography>
                                <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                                    {a.author_name} · {new Date(a.created_at + 'Z').toLocaleDateString()}
                                </Typography>
                            </Box>
                            {canManage && (
                                <IconButton size="small" onClick={() => handleDelete(a.id)} sx={{ alignSelf: 'flex-start' }}>
                                    <Trash2 size={15} />
                                </IconButton>
                            )}
                        </Stack>
                    ))}
                </Stack>
            )}
        </Card>
    );
}
