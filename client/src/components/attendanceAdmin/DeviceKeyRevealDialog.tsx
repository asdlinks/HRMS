import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Alert, Box, Typography, IconButton, Tooltip, Stack, Divider } from '@mui/material';
import { Copy, Check } from 'lucide-react';
import QrCode from './QrCode';

interface DeviceKeyRevealDialogProps {
    open: boolean;
    deviceName: string | null;
    deviceKey: string | null;
    kioskAppUrl?: string | null;
    onClose: () => void;
}

// Shown exactly once — right after POST /kiosk-devices or a key rotation,
// which are the only two moments the server ever returns the raw key. Once
// this dialog is closed there is no way to view it again (only rotate).
// Also surfaces the kiosk app's URL (+ QR code) here, since this is the one
// moment an admin has both "the key" and "where to enter it" in front of
// them — handing the physical kiosk setup to someone else means giving them
// this whole screen, not just the key.
export default function DeviceKeyRevealDialog({ open, deviceName, deviceKey, kioskAppUrl, onClose }: DeviceKeyRevealDialogProps) {
    const [copied, setCopied] = useState(false);
    const [urlCopied, setUrlCopied] = useState(false);

    const copy = async () => {
        if (!deviceKey) return;
        await navigator.clipboard.writeText(deviceKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const copyUrl = async () => {
        if (!kioskAppUrl) return;
        await navigator.clipboard.writeText(kioskAppUrl);
        setUrlCopied(true);
        setTimeout(() => setUrlCopied(false), 2000);
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>Device Key — {deviceName}</DialogTitle>
            <DialogContent>
                <Alert severity="warning" sx={{ mb: 2 }}>
                    This key is shown only once. Enter it into the kiosk app's Device Registration screen now — you'll need to rotate the key to see a new one later.
                </Alert>
                <Box sx={{
                    display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 2,
                    bgcolor: 'action.hover', fontFamily: 'monospace', wordBreak: 'break-all',
                }}>
                    <Typography sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}>{deviceKey}</Typography>
                    <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                        <IconButton size="small" onClick={copy}>
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                        </IconButton>
                    </Tooltip>
                </Box>

                {kioskAppUrl && (
                    <>
                        <Divider sx={{ my: 2.5 }} />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                            Open this on the kiosk device
                        </Typography>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <QrCode value={kioskAppUrl} size={120} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ wordBreak: 'break-all', mb: 1 }}>{kioskAppUrl}</Typography>
                                <Button size="small" startIcon={urlCopied ? <Check size={14} /> : <Copy size={14} />} onClick={copyUrl}>
                                    {urlCopied ? 'Copied' : 'Copy URL'}
                                </Button>
                            </Box>
                        </Stack>
                    </>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button variant="contained" onClick={onClose}>Done</Button>
            </DialogActions>
        </Dialog>
    );
}
