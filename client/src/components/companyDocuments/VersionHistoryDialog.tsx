import { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItem, ListItemText, IconButton, Stack } from '@mui/material';
import { Download } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getDocumentVersions, downloadDocumentFile, type DocumentVersion } from '../../api';
import { PageSpinner, EmptyState } from '../ui';
import { getErrorMessage } from '../../types';
import { formatFileSize } from './documentUtils';

export default function VersionHistoryDialog({
    documentId, onClose,
}: {
    documentId: number | null;
    onClose: () => void;
}) {
    const { enqueueSnackbar } = useSnackbar();
    const [versions, setVersions] = useState<DocumentVersion[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (documentId == null) return;
        setLoading(true);
        getDocumentVersions(documentId)
            .then((resp) => setVersions(resp.data))
            .catch((err) => enqueueSnackbar(getErrorMessage(err, 'Failed to load version history'), { variant: 'error' }))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentId]);

    const handleDownload = async (versionId: number, fileName: string) => {
        try {
            const resp = await downloadDocumentFile(documentId as number, versionId);
            const link = document.createElement('a');
            link.href = URL.createObjectURL(resp.data);
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to download version'), { variant: 'error' });
        }
    };

    return (
        <Dialog open={documentId != null} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Version History</DialogTitle>
            <DialogContent>
                {loading ? <PageSpinner /> : versions.length === 0 ? (
                    <EmptyState title="No versions found" />
                ) : (
                    <List>
                        {versions.map((v) => (
                            <ListItem
                                key={v.id}
                                secondaryAction={
                                    <IconButton size="small" title="Download this version" onClick={() => handleDownload(v.id, v.original_file_name)}>
                                        <Download size={16} />
                                    </IconButton>
                                }
                            >
                                <ListItemText
                                    primary={<Stack direction="row" spacing={1} alignItems="center">{`v${v.version_number} — ${v.original_file_name}`}</Stack>}
                                    secondary={`${v.uploaded_by_name} · ${new Date(v.uploaded_at).toLocaleString()} · ${formatFileSize(v.size_bytes)}`}
                                />
                            </ListItem>
                        ))}
                    </List>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
}
