import { useEffect, useState } from 'react';
import { Box, Card, List, ListItemButton, ListItemText, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { PageHeader, EmptyState, PageSpinner } from '../../components/ui';
import ReportsNav from '../../components/reports/ReportsNav';
import { getReportCatalog, getFavoriteReportIds, type ReportCatalogEntry } from '../../api/reports';

export default function ReportsFavoritesPage() {
    const [reports, setReports] = useState<ReportCatalogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        Promise.all([getReportCatalog(), getFavoriteReportIds()])
            .then(([catalogResp, favResp]) => {
                const favSet = new Set(favResp.data);
                setReports(catalogResp.data.filter((r) => favSet.has(r.id)));
            })
            .catch(() => setReports([]))
            .finally(() => setLoading(false));
    }, []);

    return (
        <Box className="fade-in" sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
            <ReportsNav />
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <PageHeader title="Favorite Reports" subtitle="Reports you've starred for quick access" />
                <Card sx={{ p: reports.length === 0 ? 0 : 1 }}>
                    {loading ? <PageSpinner /> : reports.length === 0 ? (
                        <EmptyState title="No favorites yet" description="Star a report from its page to pin it here." />
                    ) : (
                        <List dense>
                            {reports.map((r) => (
                                <ListItemButton key={r.id} onClick={() => navigate(`/reports/${r.category}?report=${r.id}`)} sx={{ borderRadius: 2 }}>
                                    <ListItemText primary={r.title} secondary={r.description} />
                                    <Chip size="small" label={r.category} variant="outlined" />
                                </ListItemButton>
                            ))}
                        </List>
                    )}
                </Card>
            </Box>
        </Box>
    );
}
