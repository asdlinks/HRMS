import api, { noCache } from './client';

export interface DocumentVisibility {
    allEmployees?: boolean;
    roleIds?: Array<number | string>;
    departmentIds?: Array<number | string>;
    locationIds?: Array<number | string>;
}

export interface CompanyDocumentMetadata {
    title: string;
    category: string;
    description?: string | null;
    effective_date: string;
    expiry_date?: string | null;
    visibility: DocumentVisibility;
}

export interface CompanyDocument {
    id: number;
    title: string;
    category: string;
    description: string | null;
    effective_date: string;
    expiry_date: string | null;
    status: 'active' | 'archived';
    created_by: number;
    created_by_name: string | null;
    created_at: string;
    updated_at: string;
    current_version_id: number | null;
    version_number: number | null;
    original_file_name: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    uploaded_at: string | null;
    uploaded_by_name: string | null;
}

export interface DocumentVersion {
    id: number;
    version_number: number;
    original_file_name: string;
    mime_type: string;
    size_bytes: number;
    uploaded_at: string;
    uploaded_by_name: string;
}

export const DOCUMENT_CATEGORIES = [
    'Leave Policies', 'HR Policies', 'Employee Handbook', 'Code of Conduct', 'IT Policies',
    'Payroll Policies', 'Holiday Lists', 'Insurance Documents', 'Company Forms', 'Templates', 'Other Documents',
];

export const getCompanyDocuments = (params?: { status?: string; category?: string; search?: string }) =>
    api.get('/company-documents', { params: { ...noCache(), ...params } });

export const getCompanyDocument = (id: number | string) => api.get(`/company-documents/${id}`, { params: noCache() });

export const createCompanyDocument = (metadata: CompanyDocumentMetadata, file: File) => {
    const formData = new FormData();
    formData.append('title', metadata.title);
    formData.append('category', metadata.category);
    formData.append('description', metadata.description || '');
    formData.append('effective_date', metadata.effective_date);
    formData.append('expiry_date', metadata.expiry_date || '');
    formData.append('visibility', JSON.stringify(metadata.visibility));
    formData.append('file', file);
    return api.post('/company-documents', formData);
};

export const updateCompanyDocument = (id: number | string, metadata: CompanyDocumentMetadata) =>
    api.patch(`/company-documents/${id}`, metadata);

export const uploadDocumentVersion = (id: number | string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/company-documents/${id}/versions`, formData);
};

export const archiveDocument = (id: number | string) => api.patch(`/company-documents/${id}/archive`);
export const restoreDocument = (id: number | string) => api.patch(`/company-documents/${id}/restore`);
export const deleteCompanyDocument = (id: number | string) => api.delete(`/company-documents/${id}`);
export const getDocumentVersions = (id: number | string) => api.get(`/company-documents/${id}/versions`, { params: noCache() });
export const getCompanyDocumentRoleOptions = () => api.get('/company-documents/lookups/roles', { params: noCache() });

// The download/preview routes require the Authorization header, so a plain
// <a href> can't be used — fetch as a blob via the authenticated axios
// instance, then hand the browser an object URL.
export const downloadDocumentFile = (id: number | string, versionId?: number | string) =>
    api.get(`/company-documents/${id}/download`, { params: versionId ? { versionId } : undefined, responseType: 'blob' });

export const previewDocumentFile = (id: number | string) =>
    api.get(`/company-documents/${id}/preview`, { responseType: 'blob' });
