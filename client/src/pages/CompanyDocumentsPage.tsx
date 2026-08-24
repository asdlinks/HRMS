import { Box } from '@mui/material';
import { PageHeader } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import AdminDocumentsView from '../components/companyDocuments/AdminDocumentsView';
import EmployeeDocumentsView from '../components/companyDocuments/EmployeeDocumentsView';

// Single route for both sides of the module: admins get full manage/version/
// visibility controls, everyone else gets a read-only browse+download view
// scoped server-side to what's shared with them — same permission-branch
// pattern the API route itself uses (hasManage in companyDocuments.routes.js).
export default function CompanyDocumentsPage() {
    const { hasAnyPermission } = useAuth();
    const canManage = hasAnyPermission(['company-documents.manage']);

    return (
        <Box className="fade-in" sx={{ maxWidth: 1200, mx: 'auto' }}>
            <PageHeader
                title="Company Documents"
                subtitle={canManage
                    ? 'Upload, version and control visibility of company-wide documents.'
                    : 'Policies, forms and other documents shared with you.'}
            />
            {canManage ? <AdminDocumentsView /> : <EmployeeDocumentsView />}
        </Box>
    );
}
