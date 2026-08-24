import { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Stack,
    Box,
    Typography,
    Alert,
} from '@mui/material';
import { AlertCircle, Check, X } from 'lucide-react';
import { processVoiceExecution } from '../api';
import { getErrorMessage } from '../types';

interface VoiceActionData {
    intent: string;
    transcript?: string;
    entities?: {
        user?: { name?: string };
        date?: string;
        location?: { name?: string };
        leaveCategory?: { name?: string };
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

interface VoiceConfirmationModalProps {
    actionData: VoiceActionData;
    onClose: (success: boolean) => void;
}

export default function VoiceConfirmationModal({ actionData, onClose }: VoiceConfirmationModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const { intent, entities = {}, transcript } = actionData;

    const executeAction = async () => {
        setLoading(true);
        setError('');
        try {
            await processVoiceExecution(actionData);
            onClose(true);
        } catch (err) {
            setError(getErrorMessage(err, 'Failed to execute command.'));
        } finally {
            setLoading(false);
        }
    };

    const getActionDescription = () => {
        switch (intent) {
            case 'APPROVE_LEAVE':
                return `Approve leave for ${entities.user?.name || 'unknown employee'} on ${entities.date || 'unknown date'}`;
            case 'REJECT_LEAVE':
                return `Reject leave for ${entities.user?.name || 'unknown employee'} on ${entities.date || 'unknown date'}`;
            case 'CANCEL_LEAVE':
                return `Cancel your leave on ${entities.date || 'unknown date'}`;
            case 'ADD_HOLIDAY':
                return `Add holiday for ${entities.location?.name || 'all locations'} on ${entities.date || 'unknown date'}`;
            case 'ADD_LOCATION':
                return `Add new location: ${entities.location?.name || 'unknown location'}`;
            case 'CHANGE_CATEGORY':
                return `Change leave category for ${entities.leaveCategory?.name || 'unknown category'}`;
            default:
                return `Execute unknown command: "${transcript}"`;
        }
    };

    return (
        <Dialog open onClose={() => !loading && onClose(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.25, fontWeight: 700 }}>
                <Box
                    sx={{
                        width: 36, height: 36, borderRadius: 2, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', flexShrink: 0,
                    }}
                >
                    <AlertCircle size={19} />
                </Box>
                Confirm Voice Action
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                        You asked to:
                    </Typography>
                    <Typography sx={{ fontWeight: 600 }}>{getActionDescription()}</Typography>
                    {error && <Alert severity="error">{error}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={() => onClose(false)} color="inherit" disabled={loading} startIcon={<X size={16} />}>
                    Cancel
                </Button>
                <Button onClick={executeAction} variant="contained" disabled={loading} startIcon={<Check size={16} />}>
                    {loading ? 'Executing…' : 'Confirm'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
