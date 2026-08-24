import { useState } from 'react';
import { Box, Tabs, Tab, Card } from '@mui/material';
import { Building, Briefcase, UserCog } from 'lucide-react';
import {
    getDesignations, createDesignation, updateDesignation, deleteDesignation,
    getEmploymentTypes, createEmploymentType, updateEmploymentType, deleteEmploymentType,
} from '../api';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/ui';
import BranchTab from '../components/organization/BranchTab';
import LookupTab from '../components/organization/LookupTab';

// One page, tabbed, for the Organization Structure entities (Phase 10A,
// Employee Category tab removed in Phase 13A) — Branches (the existing
// `locations` table, extended), Designations, Employment Types. Departments
// already has its own dedicated page (/department) and isn't duplicated here.
export default function OrganizationStructurePage() {
    const { hasPermission } = useAuth();
    const [tab, setTab] = useState(0);

    const tabs = [
        { label: 'Branches', icon: <Building size={16} />, canManage: hasPermission('locations.manage') },
        { label: 'Designations', icon: <Briefcase size={16} />, canManage: hasPermission('designations.manage') },
        { label: 'Employment Types', icon: <UserCog size={16} />, canManage: hasPermission('employment-types.manage') },
    ];

    return (
        <Box className="fade-in" sx={{ maxWidth: 900, mx: 'auto' }}>
            <PageHeader
                title="Organization Structure"
                subtitle="Branches, designations and employment types used across Employees, Attendance, Leave and Payroll."
            />

            <Card sx={{ mb: 3 }}>
                <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
                    {tabs.map((t) => (
                        <Tab key={t.label} icon={t.icon} iconPosition="start" label={t.label} sx={{ minHeight: 48 }} />
                    ))}
                </Tabs>
            </Card>

            {tab === 0 && <BranchTab canManage={tabs[0].canManage} />}
            {tab === 1 && (
                <LookupTab
                    entityLabel="Designation"
                    icon={<Briefcase size={18} />}
                    canManage={tabs[1].canManage}
                    list={getDesignations}
                    create={createDesignation}
                    update={updateDesignation}
                    remove={deleteDesignation}
                    deleteBlockedMessage="Employees might be assigned to this designation — reassign them before it can be deleted."
                />
            )}
            {tab === 2 && (
                <LookupTab
                    entityLabel="Employment Type"
                    icon={<UserCog size={18} />}
                    canManage={tabs[2].canManage}
                    list={getEmploymentTypes}
                    create={createEmploymentType}
                    update={updateEmploymentType}
                    remove={deleteEmploymentType}
                    deleteBlockedMessage="Employees might be assigned to this employment type — reassign them before it can be deleted."
                />
            )}
        </Box>
    );
}
