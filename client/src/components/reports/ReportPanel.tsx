import { useEffect, useMemo, useState } from 'react';
import {
    Box, Card, Button, Menu, MenuItem, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import type { GridColDef, GridPaginationModel, GridSortModel } from '@mui/x-data-grid';
import { Download, Star } from 'lucide-react';
import { PageHeader, DataTable, PageSpinner, EmptyState } from '../ui';
import ReportFilterBar, { type ReportFilterValues } from './ReportFilterBar';
import ReportChart from './ReportChart';
import {
    getReportData, exportReport, downloadBlobResponse,
    getFavoriteReportIds, addFavoriteReport, removeFavoriteReport, saveReportFilter,
    type ReportCatalogEntry,
} from '../../api/reports';

interface ReportPanelProps {
    entry: ReportCatalogEntry;
    /** Extra filters applied on top of whatever the user picks (e.g. a drill-down departmentId) — merged in, user filters still win if they touch the same key. */
    initialFilters?: ReportFilterValues;
    /** Suppresses the built-in PageHeader (title/description) — used when the host page renders its own heading, e.g. inside a workspace's tab strip. */
    showHeader?: boolean;
    /** Forwarded to ReportChart — the host page (which knows the target report/filter for a drill-down) decides what a clicked bar/pie slice's row means. */
    onDrillDown?: (row: Record<string, unknown>) => void;
}

// The guts of what used to be the single ReportViewer page — extracted so
// both the legacy single-report route and the new AnalyticsWorkspace tabs
// can render identical filter/chart/table/export/favorite/save-filter
// behavior for a given catalog entry, entirely driven by that entry's
// registry-derived shape (columns/filters/chart/stub).
export default function ReportPanel({ entry, initialFilters, showHeader = true, onDrillDown }: ReportPanelProps) {
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState<ReportFilterValues>(initialFilters || {});
    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
    const [sortModel, setSortModel] = useState<GridSortModel>([]);
    const [isFavorite, setIsFavorite] = useState(false);
    const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [saveName, setSaveName] = useState('');

    // Reset paging/sorting/filters whenever the user switches to a different
    // report (not on every re-render of the SAME report).
    useEffect(() => {
        setFilters(initialFilters || {});
        setPaginationModel({ page: 0, pageSize: 25 });
        setSortModel(entry.defaultSortField ? [{ field: entry.defaultSortField, sort: 'asc' }] : []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entry.id]);

    useEffect(() => {
        if (entry.stub) { setRows([]); setTotal(0); setLoading(false); return; }
        let cancelled = false;
        setLoading(true);
        getReportData(entry.id, {
            page: paginationModel.page + 1,
            pageSize: paginationModel.pageSize,
            sortField: sortModel[0]?.field,
            sortDir: sortModel[0]?.sort as 'asc' | 'desc' | undefined,
            ...filters,
        }).then((r) => {
            if (cancelled) return;
            setRows(r.data.rows);
            setTotal(r.data.total);
        }).catch(() => { if (!cancelled) { setRows([]); setTotal(0); } })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [entry, filters, paginationModel, sortModel]);

    useEffect(() => {
        getFavoriteReportIds().then((r) => setIsFavorite(r.data.includes(entry.id))).catch(() => {});
    }, [entry.id]);

    const columns: GridColDef[] = useMemo(
        () => (entry.columns || []).map((c) => ({ field: c.field, headerName: c.headerName, flex: 1, minWidth: 130 })),
        [entry],
    );

    const toggleFavorite = async () => {
        if (isFavorite) await removeFavoriteReport(entry.id); else await addFavoriteReport(entry.id);
        setIsFavorite((v) => !v);
    };

    const handleExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
        setExportMenuAnchor(null);
        const resp = await exportReport(entry.id, format, {
            sortField: sortModel[0]?.field,
            sortDir: sortModel[0]?.sort as 'asc' | 'desc' | undefined,
            ...filters,
        });
        downloadBlobResponse(resp.data, `${entry.id}.${format}`);
    };

    const handleSaveFilter = async () => {
        if (!saveName.trim()) return;
        await saveReportFilter({ reportId: entry.id, name: saveName.trim(), filters });
        setSaveDialogOpen(false);
        setSaveName('');
    };

    return (
        <Box>
            {showHeader && (
                <PageHeader
                    title={entry.title}
                    subtitle={entry.description}
                    actions={entry.stub ? undefined : (
                        <>
                            <IconButton onClick={toggleFavorite} color={isFavorite ? 'warning' : 'default'} title="Toggle favorite">
                                <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} />
                            </IconButton>
                            <Button variant="outlined" startIcon={<Download size={16} />} onClick={(e) => setExportMenuAnchor(e.currentTarget)}>
                                Export
                            </Button>
                            <Menu anchorEl={exportMenuAnchor} open={!!exportMenuAnchor} onClose={() => setExportMenuAnchor(null)}>
                                <MenuItem onClick={() => handleExport('csv')}>CSV</MenuItem>
                                <MenuItem onClick={() => handleExport('xlsx')}>Excel</MenuItem>
                                <MenuItem onClick={() => handleExport('pdf')}>PDF</MenuItem>
                                <MenuItem onClick={() => { setExportMenuAnchor(null); window.print(); }}>Print</MenuItem>
                            </Menu>
                        </>
                    )}
                />
            )}

            {!showHeader && !entry.stub && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 2 }}>
                    <IconButton onClick={toggleFavorite} color={isFavorite ? 'warning' : 'default'} title="Toggle favorite" size="small">
                        <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} />
                    </IconButton>
                    <Button size="small" variant="outlined" startIcon={<Download size={16} />} onClick={(e) => setExportMenuAnchor(e.currentTarget)}>
                        Export
                    </Button>
                    <Menu anchorEl={exportMenuAnchor} open={!!exportMenuAnchor} onClose={() => setExportMenuAnchor(null)}>
                        <MenuItem onClick={() => handleExport('csv')}>CSV</MenuItem>
                        <MenuItem onClick={() => handleExport('xlsx')}>Excel</MenuItem>
                        <MenuItem onClick={() => handleExport('pdf')}>PDF</MenuItem>
                        <MenuItem onClick={() => { setExportMenuAnchor(null); window.print(); }}>Print</MenuItem>
                    </Menu>
                </Box>
            )}

            {entry.stub ? (
                <Card sx={{ p: 2 }}>
                    <EmptyState title="Coming Soon" description={entry.description || 'This report is on the roadmap and not yet available.'} />
                </Card>
            ) : (
                <>
                    <ReportFilterBar
                        filterKeys={entry.filters}
                        values={filters}
                        onChange={(v) => { setFilters(v); setPaginationModel((p) => ({ ...p, page: 0 })); }}
                        onSaveFilter={() => setSaveDialogOpen(true)}
                    />

                    {entry.chart && (
                        <ReportChart
                            config={entry.chart}
                            rows={rows}
                            title={`${entry.title} — Chart`}
                            onSliceClick={onDrillDown}
                        />
                    )}

                    <Card sx={{ p: 2 }}>
                        {loading ? <PageSpinner /> : (
                            <DataTable
                                rows={rows}
                                columns={columns}
                                getRowId={(row: Record<string, unknown>) => rows.indexOf(row)}
                                paginationMode="server"
                                sortingMode="server"
                                rowCount={total}
                                paginationModel={paginationModel}
                                onPaginationModelChange={setPaginationModel}
                                sortModel={sortModel}
                                onSortModelChange={setSortModel}
                                pageSizeOptions={[10, 25, 50, 100]}
                                emptyTitle="No records match these filters"
                                withToolbar
                            />
                        )}
                    </Card>
                </>
            )}

            <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
                <DialogTitle>Save current filters</DialogTitle>
                <DialogContent>
                    <TextField autoFocus fullWidth label="Filter name" value={saveName} onChange={(e) => setSaveName(e.target.value)} sx={{ mt: 1 }} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleSaveFilter} disabled={!saveName.trim()}>Save</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
