import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Button,
} from '@mui/material';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    loading = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
            {description && (
                <DialogContent>
                    <DialogContentText>{description}</DialogContentText>
                </DialogContent>
            )}
            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={onCancel} color="inherit" disabled={loading}>
                    {cancelLabel}
                </Button>
                <Button
                    onClick={onConfirm}
                    variant="contained"
                    color={destructive ? 'error' : 'primary'}
                    disabled={loading}
                >
                    {loading ? 'Please wait…' : confirmLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
