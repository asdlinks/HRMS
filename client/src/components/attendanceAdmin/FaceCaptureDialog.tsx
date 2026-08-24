import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Alert, CircularProgress } from '@mui/material';
import { Camera, RefreshCw } from 'lucide-react';

// Descriptive model identifier stored per enrollment row — lets a future
// migration to a different face-api.js model version distinguish old
// embeddings from new ones without guessing. Must stay within
// face_enrollments.model_version's NVARCHAR(50) column limit (the mssql/tedious
// driver rejects an oversized RPC parameter outright rather than truncating).
export const FACE_MODEL_VERSION = 'face-api.js@0.22.2';

const MODEL_URL = '/models';
let modelsLoadPromise: Promise<typeof import('face-api.js')> | null = null;

// Models are ~4.5MB — loaded once, lazily, only the first time this dialog
// is opened anywhere in the app (not on every HRMS page load).
function loadFaceApiModels() {
    if (!modelsLoadPromise) {
        modelsLoadPromise = import('face-api.js').then(async (faceapi) => {
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            ]);
            return faceapi;
        });
    }
    return modelsLoadPromise;
}

interface FaceCaptureDialogProps {
    open: boolean;
    employeeName: string;
    onClose: () => void;
    onCapture: (embedding: number[]) => Promise<void>;
}

type CaptureState = 'loading-models' | 'starting-camera' | 'ready' | 'detecting' | 'captured' | 'saving' | 'error';

export default function FaceCaptureDialog({ open, employeeName, onClose, onCapture }: FaceCaptureDialogProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [state, setState] = useState<CaptureState>('loading-models');
    const [error, setError] = useState('');
    const [descriptor, setDescriptor] = useState<Float32Array | null>(null);
    const [detectionHint, setDetectionHint] = useState('Position your face in the frame');

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        const setup = async () => {
            setState('loading-models');
            setError('');
            setDescriptor(null);
            try {
                await loadFaceApiModels();
                if (cancelled) return;
                setState('starting-camera');
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
                if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
                setState('ready');
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to access camera or load face models');
                    setState('error');
                }
            }
        };
        setup();

        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        };
    }, [open]);

    const handleDetect = async () => {
        if (!videoRef.current) return;
        setState('detecting');
        setDetectionHint('Detecting…');
        try {
            const faceapi = await loadFaceApiModels();
            const result = await faceapi
                .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!result) {
                setDetectionHint('No face detected — center your face and try again');
                setState('ready');
                return;
            }
            setDescriptor(result.descriptor);
            setState('captured');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Detection failed');
            setState('error');
        }
    };

    const retake = () => { setDescriptor(null); setDetectionHint('Position your face in the frame'); setState('ready'); };

    const save = async () => {
        if (!descriptor) return;
        setState('saving');
        try {
            await onCapture(Array.from(descriptor));
        } catch {
            setState('captured'); // let the caller's own error toast explain it; allow retry from here
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>Capture Face — {employeeName}</DialogTitle>
            <DialogContent>
                <Box sx={{ position: 'relative', width: '100%', aspectRatio: '4/3', bgcolor: 'action.hover', borderRadius: 2, overflow: 'hidden' }}>
                    <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                    {(state === 'loading-models' || state === 'starting-camera') && (
                        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                            <CircularProgress size={28} />
                            <Typography variant="caption">{state === 'loading-models' ? 'Loading face recognition model…' : 'Starting camera…'}</Typography>
                        </Box>
                    )}
                </Box>

                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                {!error && state !== 'loading-models' && state !== 'starting-camera' && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                        {state === 'captured' ? 'Face captured — save it, or retake.' : detectionHint}
                    </Typography>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button color="inherit" onClick={onClose}>Cancel</Button>
                {state === 'captured' ? (
                    <>
                        <Button startIcon={<RefreshCw size={16} />} onClick={retake}>Retake</Button>
                        <Button variant="contained" onClick={save}>Save Enrollment</Button>
                    </>
                ) : (
                    <Button
                        variant="contained" startIcon={<Camera size={18} />}
                        disabled={state !== 'ready'} onClick={handleDetect}
                    >
                        {state === 'detecting' ? 'Detecting…' : 'Capture'}
                    </Button>
                )}
                {state === 'saving' && <CircularProgress size={20} sx={{ ml: 1 }} />}
            </DialogActions>
        </Dialog>
    );
}
