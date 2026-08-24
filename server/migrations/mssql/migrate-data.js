// One-time data migration: server/leave_management.db (SQLite) -> db_mywe_hrms (SQL Server).
//
// Strategy: create one tenant row ("Mywe Technologies") and copy every table
// into it, preserving the original SQLite row ids via IDENTITY_INSERT so all
// foreign keys (department_id, manager_id, location_id, user_id, ...) carry
// over unchanged — no id-remapping table needed since the target starts empty.
//
// Guarded to refuse to run if the target already has a tenant/data, so it
// can't accidentally double-insert.
//
// Usage:
//   MSSQL_CONNECTION_STRING="Server=host,port;Database=db;User Id=user;Password=pass;" \
//     node server/migrations/mssql/migrate-data.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const sql = require('mssql');

const TENANT = {
  name: 'Mywe Technologies',
  slug: 'mywe',
  status: 'active',
  plan: 'standard',
  timezone: 'Asia/Kolkata',
};

function parseConnectionString(connStr) {
  const parts = Object.fromEntries(
    connStr.split(';').filter(Boolean).map((kv) => {
      const idx = kv.indexOf('=');
      return [kv.slice(0, idx).trim().toLowerCase(), kv.slice(idx + 1).trim()];
    })
  );
  const [server, port] = (parts['server'] || '').split(',');
  return {
    server,
    port: port ? parseInt(port, 10) : 1433,
    database: parts['database'],
    user: parts['user id'] || parts['uid'],
    password: parts['password'] || parts['pwd'],
  };
}

function loadConfig() {
  const base = process.env.MSSQL_CONNECTION_STRING
    ? parseConnectionString(process.env.MSSQL_CONNECTION_STRING)
    : {
        server: process.env.MSSQL_SERVER,
        port: process.env.MSSQL_PORT ? parseInt(process.env.MSSQL_PORT, 10) : 1433,
        database: process.env.MSSQL_DATABASE,
        user: process.env.MSSQL_USER,
        password: process.env.MSSQL_PASSWORD,
      };
  if (!base.server || !base.database || !base.user || !base.password) {
    console.error('Missing SQL Server connection details.');
    process.exit(1);
  }
  return {
    ...base,
    options: {
      encrypt: process.env.MSSQL_ENCRYPT !== 'false',
      trustServerCertificate: process.env.MSSQL_TRUST_CERT !== 'false',
    },
  };
}

function openSqlite() {
  const dbPath = path.resolve(__dirname, '..', '..', 'leave_management.db');
  return new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
}

function all(db, query) {
  return new Promise((resolve, reject) => {
    db.all(query, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

/** 'YYYY-MM-DD' -> UTC Date at midnight, for DATE columns. Null-safe. */
function toDate(s) {
  return s ? new Date(`${s}T00:00:00Z`) : null;
}

/** 'YYYY-MM-DD HH:MM:SS' (SQLite datetime('now'), already UTC) -> Date, for DATETIME2 columns. Null-safe. */
function toDateTime(s) {
  return s ? new Date(`${s.replace(' ', 'T')}Z`) : null;
}

/**
 * Same as toDateTime, but repairs the one known data bug in attendance:
 * a handful of check_in_time values were stored as a bare "HH:MM:SS" with
 * no date part. Reconstructed from the row's own `date` column, since that's
 * unambiguously the day the check-in happened.
 */
function toAttendanceDateTime(checkInTime, dateStr) {
  if (checkInTime && !checkInTime.includes(' ') && !checkInTime.includes('-')) {
    return new Date(`${dateStr}T${checkInTime}Z`);
  }
  return toDateTime(checkInTime);
}

async function insertRows(pool, table, columns, rows, mapRow) {
  if (rows.length === 0) return;
  await pool.request().batch(`SET IDENTITY_INSERT ${table} ON`);
  try {
    for (const row of rows) {
      const values = mapRow(row);
      const request = pool.request();
      columns.forEach((col) => request.input(col, values[col]));
      const columnList = columns.join(', ');
      const paramList = columns.map((c) => `@${c}`).join(', ');
      await request.query(`INSERT INTO ${table} (${columnList}) VALUES (${paramList})`);
    }
  } finally {
    await pool.request().batch(`SET IDENTITY_INSERT ${table} OFF`);
  }
}

async function main() {
  const config = loadConfig();
  const sqliteDb = openSqlite();
  console.log(`Connecting to ${config.server}:${config.port}/${config.database} as ${config.user}...`);
  const pool = await sql.connect(config);

  const existingTenants = await pool.request().query('SELECT COUNT(*) AS c FROM tenants');
  if (existingTenants.recordset[0].c > 0) {
    console.error('Refusing to run: tenants table is not empty. This script only supports a single first-time migration.');
    process.exit(1);
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const tenantResult = await new sql.Request(transaction)
      .input('name', sql.NVarChar(255), TENANT.name)
      .input('slug', sql.NVarChar(100), TENANT.slug)
      .input('status', sql.NVarChar(20), TENANT.status)
      .input('plan', sql.NVarChar(50), TENANT.plan)
      .input('timezone', sql.NVarChar(50), TENANT.timezone)
      .query(
        `INSERT INTO tenants (name, slug, status, [plan], timezone) OUTPUT INSERTED.id VALUES (@name, @slug, @status, @plan, @timezone)`
      );
    const tenantId = tenantResult.recordset[0].id;
    console.log(`Created tenant "${TENANT.name}" (id ${tenantId})`);

    const departments = await all(sqliteDb, 'SELECT * FROM departments');
    await insertRows(transaction, 'departments', ['id', 'tenant_id', 'name'], departments, (r) => ({
      id: r.id,
      tenant_id: tenantId,
      name: r.name,
    }));
    console.log(`departments: ${departments.length} rows`);

    const locations = await all(sqliteDb, 'SELECT * FROM locations');
    await insertRows(transaction, 'locations', ['id', 'tenant_id', 'name'], locations, (r) => ({
      id: r.id,
      tenant_id: tenantId,
      name: r.name,
    }));
    console.log(`locations: ${locations.length} rows`);

    const users = await all(sqliteDb, 'SELECT * FROM users');
    const userColumns = [
      'id', 'tenant_id', 'employee_id', 'name', 'email', 'password', 'role', 'designation',
      'department_id', 'manager_id', 'probation_period', 'joining_date', 'profile_photo',
      'location_id', 'created_at', 'probation_message_shown',
    ];
    // manager_id is self-referencing; inserted as NULL first, backfilled in a second pass
    // below so insert order never has to worry about a manager row not existing yet.
    await insertRows(transaction, 'users', userColumns, users, (r) => ({
      id: r.id,
      tenant_id: tenantId,
      employee_id: r.employee_id,
      name: r.name,
      email: r.email,
      password: r.password,
      role: r.role,
      designation: r.designation,
      department_id: r.department_id,
      manager_id: null,
      probation_period: r.probation_period ?? 0,
      joining_date: toDate(r.joining_date),
      profile_photo: r.profile_photo,
      location_id: r.location_id,
      created_at: toDateTime(r.created_at),
      probation_message_shown: !!r.probation_message_shown,
    }));
    console.log(`users: ${users.length} rows`);

    const usersWithManager = users.filter((u) => u.manager_id !== null && u.manager_id !== undefined);
    for (const u of usersWithManager) {
      await new sql.Request(transaction)
        .input('id', sql.Int, u.id)
        .input('managerId', sql.Int, u.manager_id)
        .query('UPDATE users SET manager_id = @managerId WHERE id = @id');
    }
    console.log(`users.manager_id backfilled: ${usersWithManager.length} rows`);

    const leaves = await all(sqliteDb, 'SELECT * FROM leaves');
    await insertRows(
      transaction,
      'leaves',
      ['id', 'tenant_id', 'user_id', 'type', 'start_date', 'end_date', 'reason', 'status', 'cancellation_reason', 'applied_at', 'is_half_day', 'half_day_session'],
      leaves,
      (r) => ({
        id: r.id,
        tenant_id: tenantId,
        user_id: r.user_id,
        type: r.type,
        start_date: toDate(r.start_date),
        end_date: toDate(r.end_date),
        reason: r.reason,
        status: r.status,
        cancellation_reason: r.cancellation_reason,
        applied_at: toDateTime(r.applied_at),
        is_half_day: !!r.is_half_day,
        half_day_session: r.half_day_session,
      })
    );
    console.log(`leaves: ${leaves.length} rows`);

    const settings = await all(sqliteDb, 'SELECT * FROM settings');
    for (const s of settings) {
      await new sql.Request(transaction)
        .input('tenant_id', sql.Int, tenantId)
        .input('key', sql.NVarChar(100), s.key)
        .input('value', sql.NVarChar(sql.MAX), s.value)
        .query('INSERT INTO settings (tenant_id, [key], value) VALUES (@tenant_id, @key, @value)');
    }
    console.log(`settings: ${settings.length} rows`);

    const holidays = await all(sqliteDb, 'SELECT * FROM holidays');
    await insertRows(transaction, 'holidays', ['id', 'tenant_id', 'name', 'date', 'location_id'], holidays, (r) => ({
      id: r.id,
      tenant_id: tenantId,
      name: r.name,
      date: toDate(r.date),
      location_id: r.location_id,
    }));
    console.log(`holidays: ${holidays.length} rows`);

    const flexiHolidays = await all(sqliteDb, 'SELECT * FROM flexi_holidays');
    await insertRows(transaction, 'flexi_holidays', ['id', 'tenant_id', 'name', 'date', 'location_id'], flexiHolidays, (r) => ({
      id: r.id,
      tenant_id: tenantId,
      name: r.name,
      date: toDate(r.date),
      location_id: r.location_id,
    }));
    console.log(`flexi_holidays: ${flexiHolidays.length} rows`);

    const notifications = await all(sqliteDb, 'SELECT * FROM notifications');
    await insertRows(
      transaction,
      'notifications',
      ['id', 'tenant_id', 'user_id', 'message', 'type', 'is_read', 'created_at'],
      notifications,
      (r) => ({
        id: r.id,
        tenant_id: tenantId,
        user_id: r.user_id,
        message: r.message,
        type: r.type,
        is_read: !!r.is_read,
        created_at: toDateTime(r.created_at),
      })
    );
    console.log(`notifications: ${notifications.length} rows`);

    const validUserIds = new Set(users.map((u) => u.id));
    const attendanceAll = await all(sqliteDb, 'SELECT * FROM attendance');
    const attendance = attendanceAll.filter((r) => validUserIds.has(r.user_id));
    const skippedAttendance = attendanceAll.filter((r) => !validUserIds.has(r.user_id));
    if (skippedAttendance.length > 0) {
      console.warn(
        `Skipping ${skippedAttendance.length} attendance row(s) referencing a user_id that no longer exists in the source (pre-existing orphaned data): ${JSON.stringify(skippedAttendance)}`
      );
    }
    await insertRows(
      transaction,
      'attendance',
      ['id', 'tenant_id', 'user_id', 'date', 'check_in_time', 'status'],
      attendance,
      (r) => ({
        id: r.id,
        tenant_id: tenantId,
        user_id: r.user_id,
        date: toDate(r.date),
        check_in_time: toAttendanceDateTime(r.check_in_time, r.date),
        status: r.status,
      })
    );
    console.log(`attendance: ${attendance.length} rows`);

    await transaction.commit();
    console.log('Migration committed successfully.');
  } catch (err) {
    console.error('Migration failed, rolling back:', err.message);
    await transaction.rollback();
    process.exit(1);
  } finally {
    sqliteDb.close();
    await pool.close();
  }
}

main();
