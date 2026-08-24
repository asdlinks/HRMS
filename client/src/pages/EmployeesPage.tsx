import { useState, useEffect, useMemo } from 'react';
import {
    Box, Card, TextField, InputAdornment, Select, MenuItem, FormControl, InputLabel,
    Button, Typography, Avatar, Chip, IconButton, ToggleButtonGroup, ToggleButton, Tooltip, Grid2 as Grid,
    Dialog, DialogTitle, DialogContent, DialogActions, Stack, Checkbox, FormGroup, FormControlLabel, Alert,
} from '@mui/material';
import type { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';
import {
    Search, Filter, UserPlus, Network, Table2, Download, Eye, Edit2, Key, Trash2, Users, Building2, UserCog, UserRoundPlus,
    UserX, UserCheck, Unlock, ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import {
    getUsers, getDepartments, createUser, updateUser, deleteUser, getLocations, adminResetPassword,
    setUserStatus, unlockUser, getRoles, assignUserRoles,
    getDesignations, getEmploymentTypes, getUserById, updateUserPii, updateUserBanking,
} from '../api';
import OrgTree from '../components/OrgTree';
import EmployeeFormDialog, {
    type EmployeeFormValues, type EmployeeFormSubmitValues, type EmployeeOption, type EmployeePiiValues, type EmployeeBankingValues,
} from '../components/employees/EmployeeFormDialog';
import { useHeaderSearch } from '../layout/SearchContext';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, PageSpinner, ConfirmDialog, StatCard, DataTable } from '../components/ui';
import { getErrorMessage } from '../types';

interface Employee {
    id: number;
    name: string;
    email: string;
    role: string;
    employee_id?: string;
    department_id?: number | string | null;
    department_name?: string;
    location_name?: string;
    manager_id?: number | string | null;
    designation?: string;
    designation_id?: number | string | null;
    employment_type_id?: number | string | null;
    employment_type_name?: string;
    date_of_birth?: string | null;
    probation_period?: number | string;
    joining_date?: string;
    location_id?: number | string | null;
    profile_photo?: string | null;
    status?: 'active' | 'disabled' | 'exited';
    locked_until?: string | null;
    role_ids?: string | null;
    role_names?: string | null;
}
interface RoleOption { id: number; name: string }
interface Department { id: number; name: string }
interface Location { id: number; name: string }
interface LookupOption { id: number; name: string }

export default function EmployeesPage() {
    const { enqueueSnackbar } = useSnackbar();
    const { searchQuery, setSearchQuery } = useHeaderSearch();
    const { hasPermission, companyProfile } = useAuth();
    const navigate = useNavigate();
    const canManageUsers = hasPermission('users.manage');
    const canResetPassword = hasPermission('users.password.reset');
    const canUnlock = hasPermission('users.unlock');
    const canManageRoles = hasPermission('roles.manage');
    const canManagePii = hasPermission('users.pii.manage');
    const canManageBanking = hasPermission('payroll.assign');

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [designations, setDesignations] = useState<LookupOption[]>([]);
    const [employmentTypes, setEmploymentTypes] = useState<LookupOption[]>([]);
    const [roles, setRoles] = useState<RoleOption[]>([]);
    const [editingPii, setEditingPii] = useState<EmployeePiiValues>({});
    const [editingBanking, setEditingBanking] = useState<EmployeeBankingValues>({});
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('');
    const [selectedDesignation, setSelectedDesignation] = useState('');
    const [selectedEmploymentType, setSelectedEmploymentType] = useState('');
    const [selectedRole, setSelectedRole] = useState('');
    const [view, setView] = useState<'tree' | 'table'>('tree');
    const [loading, setLoading] = useState(true);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [resetData, setResetData] = useState<{ id: number | null; name: string; password: string }>({ id: null, name: '', password: '' });
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [statusChangeTarget, setStatusChangeTarget] = useState<Employee | null>(null);
    const [managingRolesFor, setManagingRolesFor] = useState<Employee | null>(null);
    const [draftRoleIds, setDraftRoleIds] = useState<Set<number>>(new Set());
    const [savingRoles, setSavingRoles] = useState(false);
    const [selectionModel, setSelectionModel] = useState<GridRowSelectionModel>([]);

    useEffect(() => {
        fetchData();
    }, []);

    // Aadhaar/PAN and banking fields are both excluded from the employee
    // list/directory response — only GET /users/:id merges them in (each
    // independently gated by users.pii.manage / payroll.assign), so fetch
    // once when Edit opens and pull out whichever the caller is permitted.
    useEffect(() => {
        if (!editingEmployee || (!canManagePii && !canManageBanking)) {
            setEditingPii({});
            setEditingBanking({});
            return;
        }
        getUserById(editingEmployee.id)
            .then((r) => {
                setEditingPii({ aadhaar_number: r.data.aadhaar_number, pan_number: r.data.pan_number });
                setEditingBanking({
                    bank_account_holder_name: r.data.bank_account_holder_name,
                    bank_name: r.data.bank_name,
                    bank_branch: r.data.bank_branch,
                    bank_account_number: r.data.bank_account_number,
                    bank_ifsc_code: r.data.bank_ifsc_code,
                    bank_upi_id: r.data.bank_upi_id,
                });
            })
            .catch(() => { setEditingPii({}); setEditingBanking({}); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingEmployee, canManagePii, canManageBanking]);

    const fetchData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [usersResp, deptsResp, locsResp, desigResp, etResp] = await Promise.all([
                getUsers(), getDepartments(), getLocations(), getDesignations(), getEmploymentTypes(),
            ]);
            setEmployees(usersResp.data);
            setDepartments(deptsResp.data);
            setLocations(locsResp.data);
            setDesignations(desigResp.data);
            setEmploymentTypes(etResp.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }

        if (canManageRoles) {
            try {
                const rolesResp = await getRoles();
                setRoles(rolesResp.data);
            } catch (err) {
                console.error(err);
            }
        }
    };

    const openManageRoles = (emp: Employee) => {
        const currentIds = (emp.role_ids || '').split(',').filter(Boolean).map(Number);
        setDraftRoleIds(new Set(currentIds));
        setManagingRolesFor(emp);
    };

    const handleSaveRoles = async () => {
        if (!managingRolesFor) return;
        setSavingRoles(true);
        try {
            await assignUserRoles(managingRolesFor.id, Array.from(draftRoleIds));
            enqueueSnackbar('Roles updated', { variant: 'success' });
            setManagingRolesFor(null);
            fetchData(true);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to update roles'), { variant: 'error' });
        } finally {
            setSavingRoles(false);
        }
    };

    const confirmStatusChange = async () => {
        if (!statusChangeTarget) return;
        const nextStatus = statusChangeTarget.status === 'disabled' ? 'active' : 'disabled';
        try {
            await setUserStatus(statusChangeTarget.id, nextStatus);
            enqueueSnackbar(nextStatus === 'active' ? 'Employee enabled' : 'Employee disabled', { variant: 'success' });
            setStatusChangeTarget(null);
            fetchData(true);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to update account status'), { variant: 'error' });
        }
    };

    const handleUnlock = async (emp: Employee) => {
        try {
            await unlockUser(emp.id);
            enqueueSnackbar(`${emp.name}'s account unlocked`, { variant: 'success' });
            fetchData(true);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to unlock account'), { variant: 'error' });
        }
    };

    const filteredEmployees = useMemo(() => {
        let result = employees.filter((e) => e.role !== 'super_admin');
        if (searchQuery) result = result.filter((e) => e.name.toLowerCase().includes(searchQuery.toLowerCase()));
        if (selectedDept) result = result.filter((e) => String(e.department_id) === selectedDept);
        if (selectedBranch) result = result.filter((e) => String(e.location_id) === selectedBranch);
        if (selectedDesignation) result = result.filter((e) => String(e.designation_id) === selectedDesignation);
        if (selectedEmploymentType) result = result.filter((e) => String(e.employment_type_id) === selectedEmploymentType);
        if (selectedRole) result = result.filter((e) => e.role === selectedRole);
        return result;
    }, [employees, searchQuery, selectedDept, selectedBranch, selectedDesignation, selectedEmploymentType, selectedRole]);

    const managerOptions: EmployeeOption[] = employees.filter((e) => e.role === 'manager' || (e.designation && e.designation.toLowerCase().includes('manager')));

    const handleAddEmployee = async (values: EmployeeFormSubmitValues) => {
        const { pii, banking, ...employeeValues } = values;
        try {
            const { data } = await createUser(employeeValues);
            setIsAddModalOpen(false);
            fetchData();

            // Employee record is created first, so a failure saving PII/banking
            // shouldn't be reported as "failed to add employee" — the record
            // exists and both can still be filled in later from Edit.
            const followUpErrors: string[] = [];
            if (pii) {
                await updateUserPii(data.id, pii).catch(() => { followUpErrors.push('identity information'); });
            }
            if (banking) {
                await updateUserBanking(data.id, banking).catch(() => { followUpErrors.push('banking information'); });
            }
            if (followUpErrors.length > 0) {
                enqueueSnackbar(`Employee added, but failed to save ${followUpErrors.join(' and ')}. Add it from Edit.`, { variant: 'warning' });
            } else {
                enqueueSnackbar('Employee added', { variant: 'success' });
            }
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to add employee'), { variant: 'error' });
            throw err;
        }
    };

    const handleEditEmployee = async (values: EmployeeFormValues) => {
        if (!editingEmployee) return;
        try {
            await updateUser(editingEmployee.id, values);
            setEditingEmployee(null);
            enqueueSnackbar('Employee updated', { variant: 'success' });
            fetchData(true);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to update employee'), { variant: 'error' });
            throw err;
        }
    };

    const confirmDelete = async () => {
        if (deletingId === null) return;
        try {
            setEmployees((prev) => prev.filter((e) => e.id !== deletingId));
            await deleteUser(deletingId);
            enqueueSnackbar('Employee deleted', { variant: 'success' });
            fetchData(true);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to delete employee'), { variant: 'error' });
        } finally {
            setDeletingId(null);
        }
    };

    const handleResetPassword = async () => {
        if (resetData.id === null) return;
        try {
            await adminResetPassword(resetData.id, { password: resetData.password });
            setResetData({ id: null, name: '', password: '' });
            enqueueSnackbar('Password reset successfully', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to reset password'), { variant: 'error' });
        }
    };

    const exportSelectedCSV = () => {
        const selectedIds = new Set(selectionModel.map(String));
        const rows = selectedIds.size > 0 ? filteredEmployees.filter((e) => selectedIds.has(String(e.id))) : filteredEmployees;
        const headers = ['Employee ID,Name,Email,Department,Designation,Role,Joining Date'];
        const csvRows = rows.map((e) => [e.employee_id, e.name, e.email, e.department_name || '', e.designation || '', e.role, e.joining_date || '']
            .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
        const blob = new Blob([headers.concat(csvRows).join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'employee_directory.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const editDefaultValues = editingEmployee ? {
        name: editingEmployee.name,
        email: editingEmployee.email,
        date_of_birth: editingEmployee.date_of_birth ? editingEmployee.date_of_birth.slice(0, 10) : '',
        location_id: editingEmployee.location_id != null ? String(editingEmployee.location_id) : '',
        department_id: editingEmployee.department_id != null ? String(editingEmployee.department_id) : '',
        designation_id: editingEmployee.designation_id != null ? String(editingEmployee.designation_id) : '',
        employment_type_id: editingEmployee.employment_type_id != null ? String(editingEmployee.employment_type_id) : '',
        employee_id: editingEmployee.employee_id || '',
        probation_period: String(editingEmployee.probation_period ?? '0'),
        // <input type="date"> requires a bare YYYY-MM-DD — the API returns a
        // full ISO datetime, so trim it rather than let the field silently
        // fail to prefill.
        joining_date: editingEmployee.joining_date ? editingEmployee.joining_date.slice(0, 10) : '',
        role: (editingEmployee.role as 'employee' | 'manager' | 'hr') || 'employee',
        manager_id: editingEmployee.manager_id != null ? String(editingEmployee.manager_id) : '',
    } : {};

    const columns: GridColDef<Employee>[] = [
        {
            field: 'name', headerName: 'Employee', flex: 1.2, minWidth: 170,
            renderCell: (p) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, height: '100%' }}>
                    <Avatar src={p.row.profile_photo ?? undefined} sx={{ width: 28, height: 28 }}>{p.row.name.charAt(0)}</Avatar>
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{p.row.name}</Typography>
                </Box>
            ),
        },
        { field: 'email', headerName: 'Email', flex: 1.2, minWidth: 180 },
        { field: 'employee_id', headerName: 'Emp ID', width: 150 },
        { field: 'department_name', headerName: 'Department', flex: 1, minWidth: 130, valueGetter: (_v, row) => row.department_name || '—' },
        { field: 'designation', headerName: 'Designation', flex: 1, minWidth: 140 },
        { field: 'location_name', headerName: 'Branch', flex: 1, minWidth: 130, valueGetter: (_v, row) => row.location_name || '—' },
        { field: 'employment_type_name', headerName: 'Employment Type', flex: 1, minWidth: 140, valueGetter: (_v, row) => row.employment_type_name || '—' },
        {
            field: 'role_names', headerName: 'Roles', flex: 1.2, minWidth: 160, sortable: false,
            renderCell: (p) => (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ py: 0.5 }}>
                    {(p.row.role_names ? p.row.role_names.split(', ') : []).map((r: string) => (
                        <Chip key={r} label={r} size="small" variant="outlined" />
                    ))}
                    {!p.row.role_names && <Typography variant="caption" color="text.secondary">No role assigned</Typography>}
                </Stack>
            ),
        },
        {
            field: 'status', headerName: 'Status', width: 100,
            renderCell: (p) => {
                const status = p.row.status || 'active';
                const color = status === 'active' ? 'success' : status === 'disabled' ? 'warning' : 'default';
                return <Chip label={status} size="small" color={color} sx={{ textTransform: 'capitalize' }} />;
            },
        },
        {
            field: 'joining_date', headerName: 'Joined', width: 120,
            valueGetter: (_v, row) => row.joining_date ? new Date(row.joining_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
        },
        {
            field: 'actions', headerName: 'Actions', width: 260, sortable: false, filterable: false,
            renderCell: (p) => {
                const isLocked = !!p.row.locked_until && new Date(p.row.locked_until) > new Date();
                return (
                    <Stack direction="row" spacing={0.5}>
                        <Tooltip title="View Profile">
                            <IconButton size="small" onClick={() => navigate(`/profile/${p.row.id}`)}><Eye size={15} /></IconButton>
                        </Tooltip>
                        {canManageUsers && (
                            <Tooltip title="Edit">
                                <IconButton size="small" onClick={() => setEditingEmployee(p.row)}><Edit2 size={15} /></IconButton>
                            </Tooltip>
                        )}
                        {canManageRoles && (
                            <Tooltip title="Manage Roles">
                                <IconButton size="small" onClick={() => openManageRoles(p.row)}><ShieldCheck size={15} /></IconButton>
                            </Tooltip>
                        )}
                        {canResetPassword && (
                            <Tooltip title="Reset Password">
                                <IconButton size="small" onClick={() => setResetData({ id: p.row.id, name: p.row.name, password: '' })}><Key size={15} /></IconButton>
                            </Tooltip>
                        )}
                        {canUnlock && isLocked && (
                            <Tooltip title="Unlock Account">
                                <IconButton size="small" onClick={() => handleUnlock(p.row)}><Unlock size={15} /></IconButton>
                            </Tooltip>
                        )}
                        {canManageUsers && (
                            <Tooltip title={p.row.status === 'disabled' ? 'Enable' : 'Disable'}>
                                <IconButton size="small" onClick={() => setStatusChangeTarget(p.row)}>
                                    {p.row.status === 'disabled' ? <UserCheck size={15} /> : <UserX size={15} />}
                                </IconButton>
                            </Tooltip>
                        )}
                        {canManageUsers && (
                            <Tooltip title="Delete Permanently">
                                <IconButton size="small" onClick={() => setDeletingId(p.row.id)}><Trash2 size={15} /></IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                );
            },
        },
    ];

    const managerCount = employees.filter((e) => e.role === 'manager').length;
    const newJoinersThisMonth = employees.filter((e) => {
        if (!e.joining_date) return false;
        const jd = new Date(e.joining_date);
        const now = new Date();
        return jd.getMonth() === now.getMonth() && jd.getFullYear() === now.getFullYear();
    }).length;

    if (loading) return <PageSpinner />;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1400, mx: 'auto' }}>
            <PageHeader
                title="Employee Directory"
                subtitle="Global view of all organization members"
                actions={
                    <>
                        <Button variant="outlined" startIcon={<Download size={18} />} onClick={exportSelectedCSV}>
                            Export{selectionModel.length > 0 ? ` (${selectionModel.length})` : ''}
                        </Button>
                        {canManageUsers && (
                            <Button variant="contained" startIcon={<UserPlus size={18} />} onClick={() => setIsAddModalOpen(true)}>Add New Employee</Button>
                        )}
                    </>
                }
            />

            {canManageUsers && companyProfile?.max_employees != null && (() => {
                const max = companyProfile.max_employees as number;
                const used = employees.length;
                const ratio = used / max;
                if (ratio < 0.9) return null;
                return (
                    <Alert severity={ratio >= 1 ? 'error' : 'warning'} sx={{ mb: 3 }}>
                        {ratio >= 1
                            ? `You've reached your subscription plan's employee limit (${used}/${max}). Upgrade your plan to add more employees.`
                            : `Approaching your subscription plan's employee limit (${used}/${max}).`}
                    </Alert>
                );
            })()}

            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard label="Total Employees" value={filteredEmployees.length} icon={<Users size={20} />} color="primary" />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard label="Departments" value={departments.length} icon={<Building2 size={20} />} color="info" />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard label="Managers" value={managerCount} icon={<UserCog size={20} />} color="warning" />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard label="New Joiners (This Month)" value={newJoinersThisMonth} icon={<UserRoundPlus size={20} />} color="success" />
                </Grid>
            </Grid>

            <Card sx={{ p: 2.5, mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                <TextField
                    placeholder="Search by name…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    sx={{ flex: 1, minWidth: 220 }}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={17} /></InputAdornment> } }}
                />
                <FormControl sx={{ minWidth: 200 }}>
                    <InputLabel>Department</InputLabel>
                    <Select
                        label="Department"
                        value={selectedDept}
                        onChange={(e) => setSelectedDept(e.target.value)}
                        startAdornment={<InputAdornment position="start"><Filter size={16} /></InputAdornment>}
                    >
                        <MenuItem value="">All Departments</MenuItem>
                        {departments.map((d) => <MenuItem key={d.id} value={String(d.id)}>{d.name}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl sx={{ minWidth: 160 }}>
                    <InputLabel>Branch</InputLabel>
                    <Select label="Branch" value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                        <MenuItem value="">All Branches</MenuItem>
                        {locations.map((l) => <MenuItem key={l.id} value={String(l.id)}>{l.name}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl sx={{ minWidth: 170 }}>
                    <InputLabel>Designation</InputLabel>
                    <Select label="Designation" value={selectedDesignation} onChange={(e) => setSelectedDesignation(e.target.value)}>
                        <MenuItem value="">All Designations</MenuItem>
                        {designations.map((d) => <MenuItem key={d.id} value={String(d.id)}>{d.name}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl sx={{ minWidth: 180 }}>
                    <InputLabel>Employment Type</InputLabel>
                    <Select label="Employment Type" value={selectedEmploymentType} onChange={(e) => setSelectedEmploymentType(e.target.value)}>
                        <MenuItem value="">All Employment Types</MenuItem>
                        {employmentTypes.map((e) => <MenuItem key={e.id} value={String(e.id)}>{e.name}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl sx={{ minWidth: 160 }}>
                    <InputLabel>Role</InputLabel>
                    <Select label="Role" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                        <MenuItem value="">All Roles</MenuItem>
                        <MenuItem value="employee">Employee</MenuItem>
                        <MenuItem value="manager">Manager</MenuItem>
                        <MenuItem value="hr">HR</MenuItem>
                    </Select>
                </FormControl>
                <ToggleButtonGroup value={view} exclusive size="small" onChange={(_e, v) => v && setView(v)}>
                    <ToggleButton value="tree"><Tooltip title="Org Tree"><Network size={16} /></Tooltip></ToggleButton>
                    <ToggleButton value="table"><Tooltip title="Table View"><Table2 size={16} /></Tooltip></ToggleButton>
                </ToggleButtonGroup>
            </Card>

            {view === 'tree' ? (
                <Card sx={{ p: 2, minHeight: 500 }}>
                    <OrgTree
                        users={filteredEmployees}
                        onEdit={(emp) => setEditingEmployee(emp as Employee)}
                        onDelete={(id) => setDeletingId(id)}
                        onReset={(emp) => setResetData({ id: emp.id, name: emp.name, password: '' })}
                    />
                </Card>
            ) : (
                <Card sx={{ p: 2 }}>
                    <DataTable
                        rows={filteredEmployees}
                        columns={columns}
                        emptyTitle="No employees match your filters"
                        withToolbar
                        checkboxSelection
                        rowSelectionModel={selectionModel}
                        onRowSelectionModelChange={setSelectionModel}
                        initialState={{ columns: { columnVisibilityModel: { email: false } } }}
                    />
                </Card>
            )}

            <EmployeeFormDialog
                mode="add"
                open={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSubmit={handleAddEmployee}
                departments={departments}
                locations={locations}
                designations={designations}
                employmentTypes={employmentTypes}
                managerOptions={managerOptions}
                defaultValues={{}}
                canManagePii={canManagePii}
                canManageBanking={canManageBanking}
            />

            <EmployeeFormDialog
                mode="edit"
                open={!!editingEmployee}
                onClose={() => setEditingEmployee(null)}
                onSubmit={handleEditEmployee}
                departments={departments}
                locations={locations}
                designations={designations}
                employmentTypes={employmentTypes}
                managerOptions={managerOptions}
                defaultValues={editDefaultValues}
                excludeManagerId={editingEmployee?.id}
                canManagePii={canManagePii}
                piiDefaultValues={editingPii}
                onSavePii={editingEmployee ? (values) => updateUserPii(editingEmployee.id, values).then(() => {}) : undefined}
                canManageBanking={canManageBanking}
                bankingDefaultValues={editingBanking}
                onSaveBanking={editingEmployee ? (values) => updateUserBanking(editingEmployee.id, values).then(() => {}) : undefined}
            />

            <Dialog open={resetData.id !== null} onClose={() => setResetData({ id: null, name: '', password: '' })} maxWidth="xs" fullWidth>
                <DialogTitle>Reset Password</DialogTitle>
                <Box component="form" onSubmit={(e) => { e.preventDefault(); handleResetPassword(); }}>
                    <DialogContent>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Set a new password for <strong>{resetData.name}</strong>.
                        </Typography>
                        <TextField
                            label="New Password"
                            fullWidth
                            required
                            value={resetData.password}
                            onChange={(e) => setResetData({ ...resetData, password: e.target.value })}
                        />
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 3 }}>
                        <Button color="inherit" onClick={() => setResetData({ id: null, name: '', password: '' })}>Cancel</Button>
                        <Button type="submit" variant="contained">Reset Password</Button>
                    </DialogActions>
                </Box>
            </Dialog>

            <ConfirmDialog
                open={deletingId !== null}
                title="Permanently delete this employee?"
                description="This removes the employee record and all their leave/attendance history outright — it cannot be undone. Consider Disable instead if you just want to revoke their access."
                confirmLabel="Delete Permanently"
                destructive
                onConfirm={confirmDelete}
                onCancel={() => setDeletingId(null)}
            />

            <ConfirmDialog
                open={statusChangeTarget !== null}
                title={statusChangeTarget?.status === 'disabled' ? `Enable ${statusChangeTarget?.name}?` : `Disable ${statusChangeTarget?.name}?`}
                description={
                    statusChangeTarget?.status === 'disabled'
                        ? 'They will be able to log in again immediately.'
                        : 'They will no longer be able to log in, but their record and history are kept intact.'
                }
                confirmLabel={statusChangeTarget?.status === 'disabled' ? 'Enable' : 'Disable'}
                destructive={statusChangeTarget?.status !== 'disabled'}
                onConfirm={confirmStatusChange}
                onCancel={() => setStatusChangeTarget(null)}
            />

            <Dialog open={!!managingRolesFor} onClose={() => setManagingRolesFor(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Manage Roles — {managingRolesFor?.name}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        A user can hold one or more roles — their permissions are the union of everything checked below.
                    </Typography>
                    <FormGroup>
                        {roles.map((r) => (
                            <FormControlLabel
                                key={r.id}
                                control={
                                    <Checkbox
                                        checked={draftRoleIds.has(r.id)}
                                        onChange={(e) => {
                                            setDraftRoleIds((prev) => {
                                                const next = new Set(prev);
                                                if (e.target.checked) next.add(r.id); else next.delete(r.id);
                                                return next;
                                            });
                                        }}
                                    />
                                }
                                label={r.name}
                            />
                        ))}
                    </FormGroup>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button color="inherit" onClick={() => setManagingRolesFor(null)}>Cancel</Button>
                    <Button variant="contained" disabled={savingRoles} onClick={handleSaveRoles}>
                        {savingRoles ? 'Saving…' : 'Save Roles'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
