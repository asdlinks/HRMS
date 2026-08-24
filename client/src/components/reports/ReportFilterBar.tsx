import { useEffect, useState } from 'react';
import { Card, Grid2 as Grid, FormControl, InputLabel, Select, MenuItem, TextField, Button, Stack } from '@mui/material';
import { RotateCcw, Save } from 'lucide-react';
import {
    getDepartments, getLocations, getEmploymentTypes,
    getDesignations, getShifts, getWorkModes, getUsers,
} from '../../api';

interface LookupOption { id: number | string; name: string }

export interface ReportFilterValues {
    branchId?: string;
    departmentId?: string;
    designationId?: string;
    employmentTypeId?: string;
    managerId?: string;
    shiftId?: string;
    workModeId?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    // Allows spreading into ReportDataParams (which has its own index
    // signature for report-specific filter keys like periodYear/monthsBack).
    [key: string]: string | undefined;
}

interface ReportFilterBarProps {
    filterKeys: string[]; // dimension filter keys THIS report declares (e.g. ['branchId','departmentId'])
    values: ReportFilterValues;
    onChange: (values: ReportFilterValues) => void;
    onSaveFilter?: () => void;
}

const STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'disabled', label: 'Disabled' },
    { value: 'exited', label: 'Exited' },
];

// Renders only the dropdowns a report actually declared in its registry
// `filters` array, plus a search box and date range that are always shown
// (harmless no-ops server-side for reports whose query has no matching
// column to filter by — see reportFilters.js's buildDimensionFilters).
export default function ReportFilterBar({ filterKeys, values, onChange, onSaveFilter }: ReportFilterBarProps) {
    const [departments, setDepartments] = useState<LookupOption[]>([]);
    const [branches, setBranches] = useState<LookupOption[]>([]);
    const [designations, setDesignations] = useState<LookupOption[]>([]);
    const [employmentTypes, setEmploymentTypes] = useState<LookupOption[]>([]);
    const [shifts, setShifts] = useState<LookupOption[]>([]);
    const [workModes, setWorkModes] = useState<LookupOption[]>([]);
    const [managers, setManagers] = useState<LookupOption[]>([]);

    useEffect(() => {
        if (filterKeys.includes('departmentId')) getDepartments().then((r) => setDepartments(r.data)).catch(() => {});
        if (filterKeys.includes('branchId')) getLocations().then((r) => setBranches(r.data)).catch(() => {});
        if (filterKeys.includes('designationId')) getDesignations().then((r) => setDesignations(r.data)).catch(() => {});
        if (filterKeys.includes('employmentTypeId')) getEmploymentTypes().then((r) => setEmploymentTypes(r.data)).catch(() => {});
        if (filterKeys.includes('shiftId')) getShifts().then((r) => setShifts(r.data)).catch(() => {});
        if (filterKeys.includes('workModeId')) getWorkModes().then((r) => setWorkModes(r.data)).catch(() => {});
        if (filterKeys.includes('managerId')) getUsers().then((r) => setManagers(r.data)).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterKeys.join(',')]);

    const set = (key: keyof ReportFilterValues) => (value: string) => onChange({ ...values, [key]: value || undefined });

    const dropdown = (key: keyof ReportFilterValues, label: string, options: LookupOption[]) => (
        <Grid key={key} size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl size="small" fullWidth>
                <InputLabel>{label}</InputLabel>
                <Select label={label} value={values[key] || ''} onChange={(e) => set(key)(e.target.value)}>
                    <MenuItem value="">All</MenuItem>
                    {options.map((o) => <MenuItem key={o.id} value={String(o.id)}>{o.name}</MenuItem>)}
                </Select>
            </FormControl>
        </Grid>
    );

    const reset = () => onChange({});

    return (
        <Card sx={{ p: 2, mb: 3 }}>
            <Grid container spacing={2} alignItems="center">
                {filterKeys.includes('branchId') && dropdown('branchId', 'Branch', branches)}
                {filterKeys.includes('departmentId') && dropdown('departmentId', 'Department', departments)}
                {filterKeys.includes('designationId') && dropdown('designationId', 'Designation', designations)}
                {filterKeys.includes('employmentTypeId') && dropdown('employmentTypeId', 'Employment Type', employmentTypes)}
                {filterKeys.includes('shiftId') && dropdown('shiftId', 'Shift', shifts)}
                {filterKeys.includes('workModeId') && dropdown('workModeId', 'Work Mode', workModes)}
                {filterKeys.includes('managerId') && dropdown('managerId', 'Manager', managers)}
                {filterKeys.includes('status') && dropdown('status', 'Status', STATUS_OPTIONS.map((s) => ({ id: s.value, name: s.label })))}

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField
                        size="small" fullWidth label="Search" placeholder="Name, email…"
                        value={values.search || ''} onChange={(e) => set('search')(e.target.value)}
                    />
                </Grid>
                <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                    <TextField
                        size="small" fullWidth label="From" type="date" InputLabelProps={{ shrink: true }}
                        value={values.dateFrom || ''} onChange={(e) => set('dateFrom')(e.target.value)}
                    />
                </Grid>
                <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                    <TextField
                        size="small" fullWidth label="To" type="date" InputLabelProps={{ shrink: true }}
                        value={values.dateTo || ''} onChange={(e) => set('dateTo')(e.target.value)}
                    />
                </Grid>

                <Grid size={{ xs: 12, md: 'grow' }}>
                    <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
                        <Button size="small" startIcon={<RotateCcw size={16} />} onClick={reset}>Reset</Button>
                        {onSaveFilter && (
                            <Button size="small" startIcon={<Save size={16} />} onClick={onSaveFilter}>Save filter</Button>
                        )}
                    </Stack>
                </Grid>
            </Grid>
        </Card>
    );
}
