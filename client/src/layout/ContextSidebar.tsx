import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography, IconButton, Tooltip } from '@mui/material';
import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, LayoutDashboard, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { withDefaultViewChild, type NavModule } from '../config/menuConfig';
import { TOPNAV_HEIGHT, SIDEBAR_WIDTH, SIDEBAR_RAIL_WIDTH } from './dimensions';
import { NAV_ICONS } from './navIcons';

interface ContextSidebarProps {
    module: NavModule;
    collapsed: boolean;
    onToggleCollapsed: () => void;
}

// Desktop-only permanent panel showing the active module's sub-pages.
// Mobile navigation (module switcher + sub-pages together) lives in
// TopNav's drawer instead — see layout/TopNav.tsx.
export default function ContextSidebar({ module, collapsed, onToggleCollapsed }: ContextSidebarProps) {
    const { hasPermission, hasAnyPermission } = useAuth();
    const width = collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH;

    const children = (withDefaultViewChild(module).children ?? []).filter((item) => {
        if (item.permission) return hasPermission(item.permission);
        if (item.anyPermission) return hasAnyPermission(item.anyPermission);
        return true;
    });

    return (
        <Drawer
            variant="permanent"
            sx={{
                width,
                flexShrink: 0,
                display: { xs: 'none', md: 'block' },
                transition: (theme) => theme.transitions.create('width', { duration: theme.transitions.duration.shorter }),
                '& .MuiDrawer-paper': {
                    width,
                    boxSizing: 'border-box',
                    top: TOPNAV_HEIGHT,
                    height: `calc(100% - ${TOPNAV_HEIGHT}px)`,
                    borderRight: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    transition: (theme) => theme.transitions.create('width', { duration: theme.transitions.duration.shorter }),
                    overflowX: 'hidden',
                },
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', px: collapsed ? 0 : 2, py: 2 }}>
                {!collapsed && (
                    <Typography variant="kicker" color="text.secondary">
                        {module.name}
                    </Typography>
                )}
                <Tooltip title={collapsed ? 'Expand' : 'Collapse'} placement="right">
                    <IconButton size="small" onClick={onToggleCollapsed}>
                        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                    </IconButton>
                </Tooltip>
            </Box>

            <List sx={{ px: 1.25 }}>
                {children.map((item) => {
                    const Icon: LucideIcon = NAV_ICONS[item.icon] ?? LayoutDashboard;
                    const button = (
                        <ListItemButton
                            key={item.path}
                            component={NavLink}
                            to={item.path}
                            sx={{
                                borderRadius: 2,
                                mb: 0.5,
                                justifyContent: collapsed ? 'center' : 'flex-start',
                                px: collapsed ? 1 : 1.5,
                                color: 'text.secondary',
                                '&:hover': { bgcolor: 'action.hover' },
                                '&.active': {
                                    bgcolor: 'primary.main',
                                    color: 'primary.contrastText',
                                    '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                                },
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, color: 'inherit', justifyContent: 'center' }}>
                                <Icon size={18} />
                            </ListItemIcon>
                            {!collapsed && (
                                <ListItemText
                                    primary={item.name}
                                    slotProps={{ primary: { sx: { fontWeight: 500, fontSize: '0.875rem' } } }}
                                />
                            )}
                        </ListItemButton>
                    );
                    return collapsed ? (
                        <Tooltip key={item.path} title={item.name} placement="right">
                            {button}
                        </Tooltip>
                    ) : button;
                })}
            </List>
        </Drawer>
    );
}
