-- ============================================================
-- Mywe HR — Configurable navigation menu (Phase 2)
--
-- Replaces the static client/src/config/menuConfig.ts array as the source
-- of truth: a System Administrator can now reorder, rename, hide or add
-- navigation entries per tenant through Settings > Menu Management
-- (routes/menu.routes.js) without a code deploy. The client array remains
-- as a seed/fallback only, used if this table is ever empty for a tenant.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'menu_items')
CREATE TABLE menu_items (
    id              INT IDENTITY(1,1) NOT NULL,
    tenant_id       INT NOT NULL,
    name            NVARCHAR(100) NOT NULL,
    path            NVARCHAR(200) NOT NULL,
    icon            NVARCHAR(50) NOT NULL,
    permission      NVARCHAR(100) NULL,
    any_permission  NVARCHAR(400) NULL, -- comma-separated permission codes; NULL if not used
    sort_order      INT NOT NULL CONSTRAINT DF_menu_items_sort_order DEFAULT (0),
    is_active       BIT NOT NULL CONSTRAINT DF_menu_items_is_active DEFAULT (1),
    is_placeholder  BIT NOT NULL CONSTRAINT DF_menu_items_is_placeholder DEFAULT (0),
    CONSTRAINT PK_menu_items PRIMARY KEY (id),
    CONSTRAINT UQ_menu_items_tenant_path UNIQUE (tenant_id, path),
    CONSTRAINT FK_menu_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_menu_items_tenant_id' AND object_id = OBJECT_ID('menu_items'))
CREATE INDEX IX_menu_items_tenant_id ON menu_items(tenant_id);
GO

-- Seed every existing tenant with the current default navigation (parity
-- with client/src/config/menuConfig.ts at the time of this migration).
INSERT INTO menu_items (tenant_id, name, path, icon, permission, any_permission, sort_order, is_placeholder)
SELECT t.id, v.name, v.path, v.icon, v.permission, v.any_permission, v.sort_order, v.is_placeholder
FROM tenants t
CROSS JOIN (VALUES
    ('Dashboard',           '/dashboard',    'LayoutDashboard', NULL,               NULL,                             0,  0),
    ('Daily Check-In',      '/attendance',   'ClipboardList',   NULL,               NULL,                             10, 0),
    ('Employees',           '/employees',    'Users',           NULL,               'users.view.team,users.view.all', 20, 0),
    ('Department',          '/department',   'Building2',       'departments.manage', NULL,                          30, 0),
    ('Leaves',              '/leaves',       'CalendarClock',   NULL,               NULL,                             40, 0),
    ('Leave Cancellation',  '/cancellation', 'XSquare',         NULL,               NULL,                             50, 0),
    ('Holiday Calendar',    '/holidays',     'CalendarDays',    NULL,               NULL,                             60, 0),
    ('My Team',             '/my-team',      'Users',           NULL,               NULL,                             70, 0),
    ('Reports',             '/reports',      'FileText',        'reports.view',     NULL,                             80, 0),
    ('Payroll',             '/payroll',      'Wallet',          'settings.manage',  NULL,                             90, 1),
    ('Recruitment',         '/recruitment',  'UserSearch',      'settings.manage',  NULL,                             100, 1),
    ('Performance',         '/performance',  'Target',          'settings.manage',  NULL,                             110, 1),
    ('Assets',              '/assets',       'Boxes',           'settings.manage',  NULL,                             120, 1),
    ('Settings',            '/settings',     'Settings',        'settings.manage',  NULL,                             130, 0)
) AS v(name, path, icon, permission, any_permission, sort_order, is_placeholder)
WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.tenant_id = t.id AND mi.path = v.path);
GO
