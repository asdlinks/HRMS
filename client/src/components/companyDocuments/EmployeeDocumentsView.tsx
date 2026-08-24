import { useEffect, useState } from 'react';
import { Box, IconButton, MenuItem, Stack, TextField, Chip } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { Eye, Download } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getCompanyDocuments, previewDocumentFile, downloadDocumentFile, DOCUMENT_CATEGORIES, type CompanyDocument } from '../../api';
import { DataTable, PageSpinner } from '../ui';
import { getErrorMessage } from '../../types';
import { formatDateOnly, formatFileSize, isPreviewableMime, triggerBlobDownload, openBlobInNewTab } from './documentUtils';

export default function EmployeeDocumentsView() {
    const { enqueueSnackbar } = useSnackbar();
    const [documents, setDocuments] = useState<CompanyDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState('');

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const resp = await getCompanyDocuments();
            setDocuments(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load documents'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
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

    const filtered = category ? documents.filter((d) => d.category === category) : documents;

    const columns: GridColDef<CompanyDocument>[] = [
        { field: 'title', headerName: 'Title', flex: 1, minWidth: 200 },
        { field: 'category', headerName: 'Category', width: 180, renderCell: (p) => <Chip label={p.value} size="small" /> },
        { field: 'version_number', headerName: 'Version', width: 90, valueFormatter: (v: number | null) => (v ? `v${v}` : '—') },
        { field: 'effective_date', headerName: 'Effective Date', width: 140, valueFormatter: (v: string) => formatDateOnly(v) },
        { field: 'size_bytes', headerName: 'Size', width: 100, valueFormatter: (v: number | null) => formatFileSize(v) },
        {
            field: 'actions', headerName: '', width: 100, sortable: false, filterable: false,
            renderCell: (p) => (
                <Stack direction="row" spacing={0.5}>
                    {isPreviewableMime(p.row.mime_type) && (
                        <IconButton size="small" title="Preview" onClick={() => handlePreview(p.row)}><Eye size={16} /></IconButton>
                    )}
                    <IconButton size="small" title="Download" onClick={() => handleDownload(p.row)}><Download size={16} /></IconButton>
                </Stack>
            ),
        },
    ];

    if (loading) return <PageSpinner />;

    return (
        <Box>
            <TextField
                select size="small" label="Category" value={category} onChange={(e) => setCategory(e.target.value)}
                sx={{ minWidth: 220, mb: 2 }}
            >
                <MenuItem value="">All Categories</MenuItem>
                {DOCUMENT_CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>

            <DataTable
                rows={filtered}
                columns={columns}
                withToolbar
                emptyTitle="No documents available"
                emptyDescription="Documents shared with you will appear here."
            />
        </Box>
    );
}
