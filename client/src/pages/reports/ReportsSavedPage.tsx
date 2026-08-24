import { useEffect, useState } from 'react';
import { Box, Card, List, ListItemButton, ListItemText, IconButton, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { PageHeader, EmptyState, PageSpinner } from '../../components/ui';
import ReportsNav from '../../components/reports/ReportsNav';
import { getReportCatalog, getSavedFilters, deleteSavedFilter, type ReportCatalogEntry, type SavedReportFilter } from '../../api/reports';

export default function ReportsSavedPage() {
    const [saved, setSaved] = useState<SavedReportFilter[]>([]);
    const [catalog, setCatalog] = useState<ReportCatalogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const load = () => {
        setLoading(true);
        Promise.all([getSavedFilters(), getReportCatalog()])
            .then(([savedResp, catalogResp]) => { setSaved(savedResp.data); setCatalog(catalogResp.data); })
            .catch(() => setSaved([]))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const titleFor = (reportId: string) => catalog.find((c) => c.id === reportId)?.title || reportId;

    const open = (item: SavedReportFilter) => {
        const category = catalog.find((c) => c.id === item.report_id)?.category;
        if (!category) return;
        const params = new URLSearchParams({ ...(item.filters as Record<string, string>), report: item.report_id });
        navigate(`/reports/${category}?${params.toString()}`);
    };

    const remove = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        await deleteSavedFilter(id);
        load();
    };

    return (
        <Box className="fade-in" sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
            <ReportsNav />
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <PageHeader title="Saved Reports" subtitle="Your saved filter presets for quick reuse" />
                <Card sx={{ p: saved.length === 0 ? 0 : 1 }}>
                    {loading ? <PageSpinner /> : saved.length === 0 ? (
                        <EmptyState title="No saved filters yet" description="Save a filter combination from any report to reuse it later." />
                    ) : (
                        <List dense>
                            {saved.map((item) => (
                                <ListItemButton key={item.id} onClick={() => open(item)} sx={{ borderRadius: 2 }}>
                                    <ListItemText primary={item.name} secondary={titleFor(item.report_id)} />
                                    <Chip size="small" label={new Date(item.created_at).toLocaleDateString()} variant="outlined" sx={{ mr: 1 }} />
                                    <IconButton size="small" onClick={(e) => remove(item.id, e)}><Trash2 size={16} /></IconButton>
                                </ListItemButton>
                            ))}
                        </List>
                    )}
                </Card>
            </Box>
        </Box>
    );
}
