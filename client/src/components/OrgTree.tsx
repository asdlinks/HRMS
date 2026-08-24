import { useState, useEffect, type ReactNode } from 'react';
import { Box, Avatar, IconButton, Typography, Chip, Tooltip } from '@mui/material';
import { User, Eye, Users, Edit2, Trash2, Key, LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { EmptyState } from './ui';

interface OrgUser {
    id: number;
    name: string;
    role: string;
    designation?: string;
    department_name?: string;
    manager_id?: number | string | null;
    profile_photo?: string | null;
    children?: OrgUser[];
}

interface OrgTreeProps {
    users: OrgUser[];
    rootId?: number | string | null;
    onEdit?: (user: OrgUser) => void;
    onDelete?: (id: number) => void;
    onReset?: (user: OrgUser) => void;
    hideActions?: boolean;
}

// Wraps up to 2 lines and only then ellipsizes — long names/designations
// (e.g. "Product Support & Design Engineer") read in full instead of
// spilling past the card's fixed width. `height` (not minHeight) on the
// Typography itself is what keeps every sibling card the same height
// regardless of how many lines any one card's text actually needs.
const clampTwoLines = {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    wordBreak: 'break-word',
} as const;

export default function OrgTree({ users, rootId = null, onEdit, onDelete, onReset, hideActions = false }: OrgTreeProps) {
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const [activeDept, setActiveDept] = useState<string | null>(null);

    // hr and super_admin both hold users.view.all; manager holds users.view.team
    // instead — this reproduces the legacy "hr or super_admin" edit/delete gate
    // without letting managers into org-tree edit actions they never had.
    const isAdmin = hasPermission('users.view.all');
    const isSuperAdminLike = hasPermission('users.view.team') && hasPermission('users.view.all');

    const filteredUsers = users.filter((u) => u.role !== 'super_admin');
    const departments = [...new Set(filteredUsers.map((u) => u.department_name || ''))].sort();

    useEffect(() => {
        if (departments.length > 0 && !activeDept) setActiveDept(departments[0]);
    }, [departments, activeDept]);

    const buildHierarchy = (data: OrgUser[], parentId: number | null | undefined): OrgUser[] =>
        data.filter((u) => u.manager_id === parentId).map((u) => ({ ...u, children: buildHierarchy(data, u.id) }));

    const TreeNode = ({ node }: { node: OrgUser }) => (
        <li className="tree-li">
            <Box className="tree-node-card">
                <Avatar src={node.profile_photo ?? undefined} variant="rounded" sx={{ width: 48, height: 48 }}>
                    <User size={20} />
                </Avatar>
                <Box sx={{ minWidth: 0, width: '100%' }}>
                    <Typography sx={{ ...clampTwoLines, fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.25, height: '2.5em' }}>
                        {node.name}
                    </Typography>
                    <Typography variant="caption" sx={{ ...clampTwoLines, color: 'primary.main', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.3, height: '2.6em' }}>
                        {node.designation}
                    </Typography>
                </Box>
                {!hideActions && (
                    <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: '1px dashed', borderColor: 'divider', width: '100%', justifyContent: 'center' }}>
                        <Tooltip title="View Profile">
                            <IconButton size="small" onClick={() => navigate(`/profile/${node.id}`)} sx={{ bgcolor: 'info.light', color: 'info.dark' }}>
                                <Eye size={13} />
                            </IconButton>
                        </Tooltip>
                        {isAdmin && (
                            <Tooltip title="Edit">
                                <IconButton size="small" onClick={() => onEdit?.(node)} sx={{ bgcolor: 'success.light', color: 'success.dark' }}>
                                    <Edit2 size={13} />
                                </IconButton>
                            </Tooltip>
                        )}
                        {isSuperAdminLike && (
                            <Tooltip title="Reset Password">
                                <IconButton size="small" onClick={() => onReset?.(node)} sx={{ bgcolor: 'warning.light', color: 'warning.dark' }}>
                                    <Key size={13} />
                                </IconButton>
                            </Tooltip>
                        )}
                        {isAdmin && (
                            <Tooltip title="Delete">
                                <IconButton size="small" onClick={() => onDelete?.(node.id)} sx={{ bgcolor: 'error.light', color: 'error.dark' }}>
                                    <Trash2 size={13} />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                )}
            </Box>
            {node.children && node.children.length > 0 && (
                <ul className="tree-ul">
                    {node.children.map((child) => <TreeNode key={child.id} node={child} />)}
                </ul>
            )}
        </li>
    );

    const renderHierarchy = (): ReactNode => {
        if (rootId) {
            const rootUser = filteredUsers.find((u) => u.id === Number(rootId));
            if (!rootUser) return null;
            const hierarchy = { ...rootUser, children: buildHierarchy(filteredUsers, rootUser.id) };
            return (
                <div className="dept-tree-wrapper">
                    <ul className="tree-ul root-ul"><TreeNode node={hierarchy} /></ul>
                </div>
            );
        }

        if (departments.length === 0) return <EmptyState title="No team data found" />;

        const deptName = activeDept || departments[0];
        const deptUsers = filteredUsers.filter((u) => (u.department_name || '') === deptName);
        if (deptUsers.length === 0) return null;

        const deptUserIds = deptUsers.map((u) => u.id);
        const deptRoots = deptUsers.filter((u) => !u.manager_id || !deptUserIds.includes(Number(u.manager_id)));

        return (
            <Box key={deptName} className="fade-in">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, p: 2.5, borderRadius: 3, bgcolor: 'action.hover', borderLeft: '6px solid', borderColor: 'primary.main' }}>
                    <Users size={20} />
                    <Typography variant="h6" sx={{ m: 0 }}>{deptName || 'General'} Organization</Typography>
                </Box>
                <div className="dept-tree-wrapper">
                    <ul className="tree-ul root-ul">
                        {deptRoots.map((root) => (
                            <TreeNode key={root.id} node={{ ...root, children: buildHierarchy(deptUsers, root.id) }} />
                        ))}
                    </ul>
                </div>
            </Box>
        );
    };

    return (
        <Box className="org-tree-hybrid">
            {!rootId && departments.length > 1 && (
                <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 0.5, mb: 2 }}>
                    {departments.map((dept) => (
                        <Chip
                            key={dept}
                            icon={<LayoutGrid size={14} />}
                            label={dept || 'General'}
                            onClick={() => setActiveDept(dept)}
                            color={activeDept === dept ? 'primary' : undefined}
                            variant={activeDept === dept ? 'filled' : 'outlined'}
                            sx={{ fontWeight: 700 }}
                        />
                    ))}
                </Box>
            )}

            {renderHierarchy()}

            <style>{`
                .dept-tree-wrapper { display: flex; justify-content: center; min-width: 100%; padding: 2rem 1rem; overflow-x: auto; -webkit-overflow-scrolling: touch; }
                .tree-ul { padding-top: 20px; position: relative; display: flex; justify-content: center; }
                .tree-li { float: left; text-align: center; list-style-type: none; position: relative; padding: 20px 5px 0 5px; }
                .tree-li::before, .tree-li::after { content: ''; position: absolute; top: 0; right: 50%; border-top: 2px solid var(--mui-palette-divider, #cbd5e1); width: 50%; height: 20px; }
                .tree-li::after { right: auto; left: 50%; border-left: 2px solid var(--mui-palette-divider, #cbd5e1); }
                .tree-li:only-child::after, .tree-li:only-child::before { display: none; }
                .tree-li:only-child { padding-top: 0; }
                .tree-li:first-child::before, .tree-li:last-child::after { border: 0 none; }
                .tree-li:last-child::before { border-right: 2px solid var(--mui-palette-divider, #cbd5e1); border-radius: 0 5px 0 0; }
                .tree-li:first-child::after { border-radius: 5px 0 0 0; }
                .tree-ul ul::before { content: ''; position: absolute; top: 0; left: 50%; border-left: 2px solid var(--mui-palette-divider, #cbd5e1); width: 0; height: 20px; }
                .tree-node-card {
                    display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
                    padding: 18px 14px; background: var(--mui-palette-background-paper, #fff); border: 1px solid var(--mui-palette-divider, #e2e8f0);
                    border-radius: 16px; width: 190px; min-height: 210px; text-align: center; position: relative; z-index: 10;
                    transition: all 0.25s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.05);
                }
                .tree-node-card:hover { border-color: var(--mui-palette-primary-main, #4f46e5); transform: translateY(-4px); }
                .root-ul { padding-top: 0; }
                @media (max-width: 768px) {
                    .dept-tree-wrapper { justify-content: flex-start; }
                    .tree-node-card { width: 140px; min-height: 195px; padding: 14px 10px; }
                }
            `}</style>
        </Box>
    );
}
