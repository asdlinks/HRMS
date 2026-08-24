import { useEffect, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { PageSpinner } from '../../components/ui';
import { getReportCatalog } from '../../api/reports';

// Legacy single-report route, kept only so old bookmarks/saved-filter links
// built against the pre-Analytics-Center /reports/:reportId path still
// resolve — looks up the report's category from the catalog and forwards
// into its workspace with the report pre-selected via `?report=`.
export default function ReportViewer() {
    const { reportId } = useParams<{ reportId: string }>();
    const navigate = useNavigate();
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        getReportCatalog().then((r) => {
            const entry = r.data.find((c) => c.id === reportId);
            if (!entry) { setNotFound(true); return; }
            navigate(`/reports/${entry.category}?report=${entry.id}`, { replace: true });
        }).catch(() => setNotFound(true));
    }, [reportId, navigate]);

    if (notFound) return <Navigate to="/reports" replace />;
    return <Box sx={{ p: 4 }}><PageSpinner /></Box>;
}
