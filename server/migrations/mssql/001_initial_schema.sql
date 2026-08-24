-- ============================================================
-- Mywe HR — SQL Server schema (Phase 1)
-- Migrated from SQLite: server/leave_management.db (server/db.js)
-- Target DB: db_mywe_hrms
-- Idempotent: safe to re-run (each object is created only if missing)
-- ============================================================

-- ---------------- departments ----------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'departments')
CREATE TABLE departments (
    id      INT IDENTITY(1,1) NOT NULL,
    name    NVARCHAR(255) NOT NULL,
    CONSTRAINT PK_departments PRIMARY KEY (id),
    CONSTRAINT UQ_departments_name UNIQUE (name)
);
GO

-- ---------------- locations ----------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'locations')
CREATE TABLE locations (
    id      INT IDENTITY(1,1) NOT NULL,
    name    NVARCHAR(255) NOT NULL,
    CONSTRAINT PK_locations PRIMARY KEY (id),
    CONSTRAINT UQ_locations_name UNIQUE (name)
);
GO

-- ---------------- users ----------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'users')
CREATE TABLE users (
    id                         INT IDENTITY(1,1) NOT NULL,
    employee_id                NVARCHAR(50) NULL,
    name                       NVARCHAR(255) NOT NULL,
    email                      NVARCHAR(255) NOT NULL,
    password                   NVARCHAR(255) NOT NULL,
    role                       NVARCHAR(20) NOT NULL,
    designation                NVARCHAR(255) NULL,
    department_id              INT NULL,
    manager_id                 INT NULL,
    probation_period           INT NOT NULL CONSTRAINT DF_users_probation_period DEFAULT (0),
    joining_date               DATE NULL,
    profile_photo              NVARCHAR(500) NULL,
    location_id                INT NULL,
    created_at                 DATETIME2 NULL,
    probation_message_shown    BIT NOT NULL CONSTRAINT DF_users_probation_message_shown DEFAULT (0),
    CONSTRAINT PK_users PRIMARY KEY (id),
    CONSTRAINT UQ_users_email UNIQUE (email),
    CONSTRAINT CK_users_role CHECK (role IN ('employee', 'manager', 'hr', 'super_admin')),
    CONSTRAINT FK_users_department FOREIGN KEY (department_id) REFERENCES departments(id),
    CONSTRAINT FK_users_manager FOREIGN KEY (manager_id) REFERENCES users(id),
    CONSTRAINT FK_users_location FOREIGN KEY (location_id) REFERENCES locations(id)
);
GO

-- employee_id is UNIQUE-but-nullable in SQLite (many rows may have no employee_id yet).
-- A plain UNIQUE constraint in SQL Server only tolerates a single NULL, so uniqueness
-- on non-null values is enforced via a filtered index instead.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_users_employee_id' AND object_id = OBJECT_ID('users'))
CREATE UNIQUE INDEX UX_users_employee_id ON users(employee_id) WHERE employee_id IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_users_department_id' AND object_id = OBJECT_ID('users'))
CREATE INDEX IX_users_department_id ON users(department_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_users_manager_id' AND object_id = OBJECT_ID('users'))
CREATE INDEX IX_users_manager_id ON users(manager_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_users_location_id' AND object_id = OBJECT_ID('users'))
CREATE INDEX IX_users_location_id ON users(location_id);
GO

-- ---------------- leaves ----------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'leaves')
CREATE TABLE leaves (
    id                     INT IDENTITY(1,1) NOT NULL,
    user_id                INT NOT NULL,
    type                   NVARCHAR(50) NOT NULL,
    start_date             DATE NOT NULL,
    end_date               DATE NOT NULL,
    reason                 NVARCHAR(MAX) NULL,
    status                 NVARCHAR(30) NOT NULL CONSTRAINT DF_leaves_status DEFAULT ('Pending'),
    cancellation_reason    NVARCHAR(MAX) NULL,
    applied_at             DATETIME2 NOT NULL CONSTRAINT DF_leaves_applied_at DEFAULT (SYSUTCDATETIME()),
    is_half_day            BIT NOT NULL CONSTRAINT DF_leaves_is_half_day DEFAULT (0),
    half_day_session       NVARCHAR(20) NULL,
    CONSTRAINT PK_leaves PRIMARY KEY (id),
    CONSTRAINT CK_leaves_status CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled', 'Cancellation Pending')),
    CONSTRAINT FK_leaves_user FOREIGN KEY (user_id) REFERENCES users(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leaves_user_id' AND object_id = OBJECT_ID('leaves'))
CREATE INDEX IX_leaves_user_id ON leaves(user_id);
GO

-- ---------------- settings ----------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'settings')
CREATE TABLE settings (
    [key]   NVARCHAR(100) NOT NULL,
    value   NVARCHAR(MAX) NOT NULL,
    CONSTRAINT PK_settings PRIMARY KEY ([key])
);
GO

-- ---------------- holidays ----------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'holidays')
CREATE TABLE holidays (
    id             INT IDENTITY(1,1) NOT NULL,
    name           NVARCHAR(255) NOT NULL,
    date           DATE NOT NULL,
    location_id    INT NULL,
    CONSTRAINT PK_holidays PRIMARY KEY (id),
    CONSTRAINT FK_holidays_location FOREIGN KEY (location_id) REFERENCES locations(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_holidays_location_id' AND object_id = OBJECT_ID('holidays'))
CREATE INDEX IX_holidays_location_id ON holidays(location_id);
GO

-- ---------------- flexi_holidays ----------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'flexi_holidays')
CREATE TABLE flexi_holidays (
    id             INT IDENTITY(1,1) NOT NULL,
    name           NVARCHAR(255) NOT NULL,
    date           DATE NOT NULL,
    location_id    INT NULL,
    CONSTRAINT PK_flexi_holidays PRIMARY KEY (id),
    CONSTRAINT FK_flexi_holidays_location FOREIGN KEY (location_id) REFERENCES locations(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_flexi_holidays_location_id' AND object_id = OBJECT_ID('flexi_holidays'))
CREATE INDEX IX_flexi_holidays_location_id ON flexi_holidays(location_id);
GO

-- ---------------- notifications ----------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'notifications')
CREATE TABLE notifications (
    id            INT IDENTITY(1,1) NOT NULL,
    user_id       INT NOT NULL,
    message       NVARCHAR(MAX) NOT NULL,
    type          NVARCHAR(50) NULL,
    is_read       BIT NOT NULL CONSTRAINT DF_notifications_is_read DEFAULT (0),
    created_at    DATETIME2 NOT NULL CONSTRAINT DF_notifications_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_notifications PRIMARY KEY (id),
    CONSTRAINT FK_notifications_user FOREIGN KEY (user_id) REFERENCES users(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_notifications_user_id' AND object_id = OBJECT_ID('notifications'))
CREATE INDEX IX_notifications_user_id ON notifications(user_id);
GO

-- ---------------- attendance ----------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'attendance')
CREATE TABLE attendance (
    id               INT IDENTITY(1,1) NOT NULL,
    user_id          INT NOT NULL,
    date             DATE NOT NULL,
    check_in_time    DATETIME2 NOT NULL CONSTRAINT DF_attendance_check_in_time DEFAULT (SYSUTCDATETIME()),
    status           NVARCHAR(20) NOT NULL CONSTRAINT DF_attendance_status DEFAULT ('Present'),
    CONSTRAINT PK_attendance PRIMARY KEY (id),
    CONSTRAINT UQ_attendance_user_date UNIQUE (user_id, date),
    CONSTRAINT FK_attendance_user FOREIGN KEY (user_id) REFERENCES users(id)
);
GO
