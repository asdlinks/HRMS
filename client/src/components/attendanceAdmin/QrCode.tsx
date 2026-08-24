import { useEffect, useState } from 'react';
import { Box, Skeleton } from '@mui/material';
import QRCode from 'qrcode';

interface QrCodeProps {
    value: string;
    size?: number;
}

// Renders entirely client-side (no third-party QR-generation API call) —
// the kiosk URL is admin-only, so it should never leave the browser to get
// turned into an image.
export default function QrCode({ value, size = 160 }: QrCodeProps) {
    const [dataUrl, setDataUrl] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        QRCode.toDataURL(value, { width: size, margin: 1 }).then((url) => {
            if (!cancelled) setDataUrl(url);
        });
        return () => { cancelled = true; };
    }, [value, size]);

    if (!dataUrl) return <Skeleton variant="rounded" width={size} height={size} />;
    return (
        <Box
            component="img"
            src={dataUrl}
            alt="QR code"
            sx={{ width: size, height: size, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
        />
    );
}
