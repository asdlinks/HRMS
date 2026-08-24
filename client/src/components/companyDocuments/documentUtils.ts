// MSSQL DATE columns serialize as full ISO timestamps
// ("2026-07-10T00:00:00.000Z"), not plain "YYYY-MM-DD" — always slice
// before displaying or comparing (see AttendancePage.tsx's toDateOnly()).
export const formatDateOnly = (value: string | null | undefined) => (value ? value.slice(0, 10) : '—');

export const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const PREVIEWABLE_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif']);
export const isPreviewableMime = (mimeType: string | null | undefined) => !!mimeType && PREVIEWABLE_MIME_TYPES.has(mimeType);

export function triggerBlobDownload(blob: Blob, fileName: string) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

export function openBlobInNewTab(blob: Blob) {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Intentionally not revoking immediately — the new tab needs the URL to
    // stay valid while it loads/renders the file.
}
