import { useEffect, useState } from 'react';
import { Box, Button, IconButton, Stack, Chip, Typography, Card, TextField } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { Plus, RotateCw, Ban, CheckCircle2, Link2, Save } from 'lucide-react';
import { useSnackbar } from 'notistack';
import {
    getKioskDevices, createKioskDevice, rotateKioskDeviceKey, setKioskDeviceStatus, getLocations,
    getKioskAppConfig, updateKioskAppUrl,
} from '../api';
import { PageHeader, DataTable, ConfirmDialog, PageSpinner } from '../components/ui';
import KioskDeviceFormDialog from '../components/attendanceAdmin/KioskDeviceFormDialog';
import DeviceKeyRevealDialog from '../components/attendanceAdmin/DeviceKeyRevealDialog';
import QrCode from '../components/attendanceAdmin/QrCode';
import { getErrorMessage } from '../types';

interface KioskDevice {
    id: number;
    device_name: string;
    location_id: number | null;
    location_name: string | null;
    status: 'Active' | 'Revoked';
    last_sync_at: string | null;
    created_at: string;
}
interface LocationOption { id: number; name: string }

export default function KioskDevicesPage() {
    const { enqueueSnackbar } = useSnackbar();
    const [devices, setDevices] = useState<KioskDevice[]>([]);
    const [locations, setLocations] = useState<LocationOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [revoking, setRevoking] = useState<KioskDevice | null>(null);
    const [keyReveal, setKeyReveal] = useState<{ deviceName: string; deviceKey: string } | null>(null);
    const [kioskAppUrl, setKioskAppUrl] = useState<string | null>(null);
    const [urlInput, setUrlInput] = useState('');
    const [urlSaving, setUrlSaving] = useState(false);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const [devicesResp, locationsResp, configResp] = await Promise.all([getKioskDevices(), getLocations(), getKioskAppConfig()]);
            setDevices(devicesResp.data);
            setLocations(locationsResp.data);
            setKioskAppUrl(configResp.data.kioskAppUrl);
            setUrlInput(configResp.data.kioskAppUrl || '');
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load kiosk devices'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const saveUrl = async () => {
        setUrlSaving(true);
        try {
            await updateKioskAppUrl(urlInput.trim() || null);
            setKioskAppUrl(urlInput.trim() || null);
            enqueueSnackbar('Kiosk app URL saved', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save kiosk app URL'), { variant: 'error' });
        } finally {
            setUrlSaving(false);
        }
    };

    const handleCreate = async (values: { device_name: string; location_id: number | null }) => {
        try {
            const resp = await createKioskDevice(values);
            enqueueSnackbar('Device registered', { variant: 'success' });
            setDialogOpen(false);
            setKeyReveal({ deviceName: resp.data.deviceName, deviceKey: resp.data.deviceKey });
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to register device'), { variant: 'error' });
        }
    };

    const handleRotate = async (device: KioskDevice) => {
        try {
            const resp = await rotateKioskDeviceKey(device.id);
            setKeyReveal({ deviceName: device.device_name, deviceKey: resp.data.deviceKey });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to rotate device key'), { variant: 'error' });
        }
    };

    const toggleStatus = async (device: KioskDevice) => {
        if (device.status === 'Active') { setRevoking(device); return; }
        try {
            await setKioskDeviceStatus(device.id, 'Active');
            enqueueSnackbar('Device reactivated', { variant: 'success' });
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to reactivate device'), { variant: 'error' });
        }
    };

    const confirmRevoke = async () => {
        if (!revoking) return;
        try {
            await setKioskDeviceStatus(revoking.id, 'Revoked');
            enqueueSnackbar('Device revoked', { variant: 'success' });
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to revoke device'), { variant: 'error' });
        } finally {
            setRevoking(null);
        }
    };

    const columns: GridColDef<KioskDevice>[] = [
        { field: 'device_name', headerName: 'Device Name', flex: 1, minWidth: 180 },
        { field: 'location_name', headerName: 'Location', width: 160, valueFormatter: (v: string | null) => v || 'Unassigned' },
        { field: 'status', headerName: 'Status', width: 110, renderCell: (p) => <Chip label={p.value} size="small" color={p.value === 'Active' ? 'success' : 'error'} /> },
        {
            field: 'last_sync_at', headerName: 'Last Sync', width: 180,
            valueFormatter: (v: string | null) => (v ? new Date(v).toLocaleString() : 'Never'),
        },
        {
            field: 'actions', headerName: '', width: 140, sortable: false, filterable: false,
            renderCell: (p) => (
                <Stack direction="row" spacing={0.5}>
                    <IconButton size="small" title="Rotate key" onClick={() => handleRotate(p.row)}><RotateCw size={16} /></IconButton>
                    <IconButton size="small" title={p.row.status === 'Active' ? 'Revoke device' : 'Reactivate device'} onClick={() => toggleStatus(p.row)}>
                        {p.row.status === 'Active' ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                    </IconButton>
                </Stack>
            ),
        },
    ];

    if (loading) return <PageSpinner />;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1200, mx: 'auto' }}>
            <PageHeader
                title="Kiosk Devices"
                subtitle="Register office kiosks for Face Recognition attendance and manage their access keys."
                actions={<Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setDialogOpen(true)}>Register Device</Button>}
            />

            <Card sx={{ p: 3, mb: 3 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Link2 size={18} />
                    <Typography variant="h6">Kiosk App URL</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Where the Face Recognition kiosk app is deployed. Only visible here and to admins who can manage kiosk
                    devices — never exposed through general Settings.
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }}>
                    <Stack direction="row" spacing={1.5} sx={{ flex: 1, width: '100%' }}>
                        <TextField
                            fullWidth size="small" placeholder="https://kiosk.yourcompany.com"
                            value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                        />
                        <Button variant="contained" startIcon={<Save size={16} />} disabled={urlSaving} onClick={saveUrl}>
                            Save
                        </Button>
                    </Stack>
                    {kioskAppUrl && <QrCode value={kioskAppUrl} size={88} />}
                </Stack>
            </Card>

            <DataTable
                rows={devices}
                columns={columns}
                emptyTitle="No kiosk devices registered"
                emptyDescription="Register a device, then enter the one-time device key into the kiosk app's registration screen."
            />

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                A revoked device is immediately locked out, even mid-session — it can be reactivated without a new key.
            </Typography>

            <KioskDeviceFormDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                onSubmit={handleCreate}
                locations={locations}
            />

            <DeviceKeyRevealDialog
                open={!!keyReveal}
                deviceName={keyReveal?.deviceName ?? null}
                deviceKey={keyReveal?.deviceKey ?? null}
                kioskAppUrl={kioskAppUrl}
                onClose={() => setKeyReveal(null)}
            />

            <ConfirmDialog
                open={!!revoking}
                title={`Revoke "${revoking?.device_name}"?`}
                description="The kiosk will be locked out of check-ins immediately, even if it's mid-session. It can be reactivated later without a new key."
                confirmLabel="Revoke"
                destructive
                onConfirm={confirmRevoke}
                onCancel={() => setRevoking(null)}
            />
        </Box>
    );
}
