import { useEffect, useState } from 'react';
import { Box, IconButton, MenuItem, Stack, TextField, Chip, Button, Tabs, Tab } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { Plus, Eye, Download, UploadCloud, Pencil, History, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { useSnackbar } from 'notistack';
import {
    getCompanyDocuments, previewDocumentFile, downloadDocumentFile, uploadDocumentVersion,
    archiveDocument, restoreDocument, deleteCompanyDocument, DOCUMENT_CATEGORIES, type CompanyDocument,
} from '../../api';
import { DataTable, PageSpinner, ConfirmDialog } from '../ui';
import { getErrorMessage } from '../../types';
import { formatDateOnly, formatFileSize, isPreviewableMime, triggerBlobDownload, openBlobInNewTab } from './documentUtils';
import DocumentFormDialog from './DocumentFormDialog';
import VersionHistoryDialog from './VersionHistoryDialog';

export default function AdminDocumentsView() {
    const { enqueueSnackbar } = useSnackbar();
    const [documents, setDocuments] = useState<CompanyDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<'active' | 'archived'>('active');
    const [category, setCategory] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [versionHistoryId, setVersionHistoryId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<CompanyDocument | null>(null);

    useEffect(() => { fetchAll(); }, [status, category]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        setLoading(true);
        try {
            const resp = await getCompanyDocuments({ status, category: category || undefined });
            setDocuments(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load documents'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const openAdd = () => { setEditingId(null); setDialogOpen(true); };
    const openEdit = (doc: CompanyDocument) => { setEditingId(doc.id); setDialogOpen(true); };

    const handleSaved = () => {
        setDialogOpen(false);
        fetchAll();
    };

    const handlePreview = async (doc: CompanyDocument) => {
        try {
            const resp = await previewDocumentFile(doc.id);
            openBlobInNewTab(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to preview document'), { variant: 'error' });
        }
    };

    const handleDownload = async (doc: CompanyDocument) => {
        try {
            const resp = await downloadDocumentFile(doc.id);
            triggerBlobDownload(resp.data, doc.original_file_name || doc.title);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to download document'), { variant: 'error' });
        }
    };

    const handleVersionUpload = async (doc: CompanyDocument, file: File | null | undefined) => {
        if (!file) return;
        try {
            await uploadDocumentVersion(doc.id, file);
            enqueueSnackbar('New version uploaded', { variant: 'success' });
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to upload new version'), { variant: 'error' });
        }
    };

    const handleArchiveToggle = async (doc: CompanyDocument) => {
        try {
            if (doc.status === 'active') {
                await archiveDocument(doc.id);
                enqueueSnackbar('Document archived', { variant: 'success' });
            } else {
                await restoreDocument(doc.id);
                enqueueSnackbar('Document restored', { variant: 'success' });
            }
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to update document status'), { variant: 'error' });
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await deleteCompanyDocument(deleting.id);
            enqueueSnackbar('Document deleted', { variant: 'success' });
            setDocuments((prev) => prev.filter((d) => d.id !== deleting.id));
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to delete document'), { variant: 'error' });
        } finally {
            setDeleting(null);
        }
    };

    const columns: GridColDef<CompanyDocument>[] = [
        { field: 'title', headerName: 'Title', flex: 1, minWidth: 200 },
        { field: 'category', headerName: 'Category', width: 170, renderCell: (p) => <Chip label={p.value} size="small" /> },
        { field: 'version_number', headerName: 'Version', width: 90, valueFormatter: (v: number | null) => (v ? `v${v}` : '—') },
        { field: 'effective_date', headerName: 'Effective Date', width: 130, valueFormatter: (v: string) => formatDateOnly(v) },
        { field: 'expiry_date', headerName: 'Expiry Date', width: 130, valueFormatter: (v: string | null) => (v ? formatDateOnly(v) : '—') },
        { field: 'uploaded_by_name', headerName: 'Uploaded By', width: 150, valueFormatter: (v: string | null) => v || '—' },
        { field: 'size_bytes', headerName: 'Size', width: 90, valueFormatter: (v: number | null) => formatFileSize(v) },
        {
            field: 'actions', headerName: '', width: 260, sortable: false, filterable: false,
            renderCell: (p) => (
                <Stack direction="row" spacing={0.25}>
                    {isPreviewableMime(p.row.mime_type) && (
                        <IconButton size="small" title="Preview" onClick={() => handlePreview(p.row)}><Eye size={16} /></IconButton>
                    )}
                    <IconButton size="small" title="Download" onClick={() => handleDownload(p.row)}><Download size={16} /></IconButton>
                    <IconButton size="small" title="Upload new version" component="label">
                        <UploadCloud size={16} />
                        <input
                            type="file" hidden
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
                            onChange={(e) => handleVersionUpload(p.row, e.target.files?.[0])}
                        />
                    </IconButton>
                    <IconButton size="small" title="Edit" onClick={() => openEdit(p.row)}><Pencil size={16} /></IconButton>
                    <IconButton size="small" title="Version history" onClick={() => setVersionHistoryId(p.row.id)}><History size={16} /></IconButton>
                    <IconButton size="small" title={p.row.status === 'active' ? 'Archive' : 'Restore'} onClick={() => handleArchiveToggle(p.row)}>
                        {p.row.status === 'active' ? <Archive size={16} /> : <ArchiveRestore size={16} />}
                    </IconButton>
                    <IconButton size="small" title="Delete" onClick={() => setDeleting(p.row)}><Trash2 size={16} /></IconButton>
                </Stack>
            ),
        },
    ];

    return (
        <Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
                <Tabs value={status} onChange={(_e, v) => setStatus(v)}>
                    <Tab label="Active" value="active" />
                    <Tab label="Archived" value="archived" />
                </Tabs>
                <Stack direction="row" spacing={2}>
                    <TextField select size="small" label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 200 }}>
                        <MenuItem value="">All Categories</MenuItem>
                        {DOCUMENT_CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </TextField>
                    <Button variant="contained" startIcon={<Plus size={18} />} onClick={openAdd}>Upload Document</Button>
                </Stack>
            </Stack>

            {loading ? <PageSpinner /> : (
                <DataTable
                    rows={documents}
                    columns={columns}
                    withToolbar
                    emptyTitle={status === 'active' ? 'No active documents' : 'No archived documents'}
                    emptyDescription="Upload a document to make it available to employees."
                />
            )}

            <DocumentFormDialog open={dialogOpen} editingId={editingId} onClose={() => setDialogOpen(false)} onSaved={handleSaved} />
            <VersionHistoryDialog documentId={versionHistoryId} onClose={() => setVersionHistoryId(null)} />
            <ConfirmDialog
                open={!!deleting}
                title={`Delete "${deleting?.title}"?`}
                description="This permanently removes the document and every version of it. This cannot be undone."
                confirmLabel="Delete"
                destructive
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </Box>
    );
}
