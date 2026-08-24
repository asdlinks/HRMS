import { DataGrid, GridToolbar, type DataGridProps, type GridColDef } from '@mui/x-data-grid';
import { Box } from '@mui/material';
import EmptyState from './EmptyState';

interface DataTableProps<T> extends Partial<DataGridProps> {
    rows: T[];
    columns: GridColDef[];
    loading?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
    getRowId?: (row: T) => string | number;
    /** Adds the built-in quick-search / column filter / density / CSV export toolbar. */
    withToolbar?: boolean;
}

// Thin wrapper around MUI DataGrid with consistent chrome (no cell borders,
// house empty-state, sensible density) so every table in the app looks the same.
export default function DataTable<T extends object>({
    rows,
    columns,
    loading,
    emptyTitle = 'No records found',
    emptyDescription,
    getRowId,
    withToolbar = false,
    ...rest
}: DataTableProps<T>) {
    if (!loading && rows.length === 0) {
        return (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
                <EmptyState title={emptyTitle} description={emptyDescription} />
            </Box>
        );
    }

    return (
        <Box sx={{ width: '100%', bgcolor: 'background.paper', borderRadius: 3, overflow: 'hidden' }}>
            <DataGrid
                rows={rows}
                columns={columns}
                loading={loading}
                getRowId={getRowId as DataGridProps['getRowId']}
                disableRowSelectionOnClick
                autoHeight
                pageSizeOptions={[10, 25, 50]}
                {...rest}
                initialState={{
                    pagination: { paginationModel: { pageSize: 10 } },
                    ...(rest.initialState as object),
                }}
                slots={withToolbar ? { toolbar: GridToolbar } : undefined}
                slotProps={withToolbar ? { toolbar: { showQuickFilter: true } } : undefined}
                sx={{
                    border: 'none',
                    '--DataGrid-rowBorderColor': 'transparent',
                    '& .MuiDataGrid-columnHeaders': {
                        bgcolor: 'action.hover',
                        borderRadius: 0,
                    },
                    '& .MuiDataGrid-toolbarContainer': { p: 1.5, gap: 1 },
                    '& .MuiDataGrid-cell': { borderColor: 'divider' },
                    '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
                    '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': { outline: 'none' },
                    ...(rest.sx as object),
                }}
            />
        </Box>
    );
}
