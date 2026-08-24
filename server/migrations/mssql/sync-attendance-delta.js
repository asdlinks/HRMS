// Delta sync: copies attendance rows from server/../leave_management.db (SQLite,
// still the production system of record) into the already-migrated MSSQL
// tenant, skipping anything already present. Safe to run repeatedly — dedupes
// by (user_id, date), same pair the DB's own UQ_attendance_user_date enforces.
//
// Use this instead of migrate-data.js for a re-sync: that script refuses to
// run once `tenants` is non-empty (by design, so it can never double-run the
// full one-time migration).
//
// Usage:
//   MSSQL_CONNECTION_STRING="Server=host,port;Database=db;User Id=user;Password=pass;" \
//     node server/migrations/mssql/sync-attendance-delta.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const sql = require('mssql');

const TENANT_SLUG = 'mywe';

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
  // repo root's leave_management.db (server/migrations/mssql -> up 3 -> repo root)
  const dbPath = path.resolve(__dirname, '..', '..', '..', 'leave_management.db');
  console.log(`Reading SQLite attendance from ${dbPath}`);
  return new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
}

function all(db, query) {
  return new Promise((resolve, reject) => {
    db.all(query, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function toDate(s) {
  return s ? new Date(`${s}T00:00:00Z`) : null;
}

function toAttendanceDateTime(checkInTime, dateStr) {
  if (checkInTime && !checkInTime.includes(' ') && !checkInTime.includes('-')) {
    return new Date(`${dateStr}T${checkInTime}Z`);
  }
  return checkInTime ? new Date(`${checkInTime.replace(' ', 'T')}Z`) : null;
}

async function main() {
  const config = loadConfig();
  const sqliteDb = openSqlite();
  console.log(`Connecting to ${config.server}:${config.port}/${config.database} as ${config.user}...`);
  const pool = await sql.connect(config);

  try {
    const tenantResult = await pool.request()
      .input('slug', sql.NVarChar(100), TENANT_SLUG)
      .query('SELECT id FROM tenants WHERE slug = @slug');
    if (tenantResult.recordset.length === 0) {
      console.error(`No tenant found with slug "${TENANT_SLUG}" — run migrate-data.js first.`);
      process.exit(1);
    }
    const tenantId = tenantResult.recordset[0].id;

    const validUsers = await pool.request()
      .input('tenantId', sql.Int, tenantId)
      .query('SELECT id FROM users WHERE tenant_id = @tenantId');
    const validUserIds = new Set(validUsers.recordset.map((u) => u.id));

    const existing = await pool.request()
      .input('tenantId', sql.Int, tenantId)
      .query('SELECT user_id, CONVERT(varchar(10), date, 23) AS date FROM attendance WHERE tenant_id = @tenantId');
    const existingKeys = new Set(existing.recordset.map((r) => `${r.user_id}|${r.date}`));

    const attendanceAll = await all(sqliteDb, 'SELECT * FROM attendance');

    const toInsert = [];
    let skippedOrphan = 0;
    let skippedExisting = 0;
    for (const r of attendanceAll) {
      if (!validUserIds.has(r.user_id)) {
        skippedOrphan++;
        continue;
      }
      if (existingKeys.has(`${r.user_id}|${r.date}`)) {
        skippedExisting++;
        continue;
      }
      toInsert.push(r);
    }

    console.log(`SQLite attendance rows: ${attendanceAll.length}`);
    console.log(`Skipped (unknown user_id): ${skippedOrphan}`);
    console.log(`Skipped (already in MSSQL): ${skippedExisting}`);
    console.log(`New rows to insert: ${toInsert.length}`);

    let inserted = 0;
    for (const r of toInsert) {
      await pool.request()
        .input('tenant_id', sql.Int, tenantId)
        .input('user_id', sql.Int, r.user_id)
        .input('date', sql.Date, toDate(r.date))
        .input('check_in_time', sql.DateTime2, toAttendanceDateTime(r.check_in_time, r.date))
        .input('status', sql.NVarChar(20), r.status)
        .query(
          'INSERT INTO attendance (tenant_id, user_id, date, check_in_time, status) VALUES (@tenant_id, @user_id, @date, @check_in_time, @status)'
        );
      inserted++;
    }

    console.log(`Inserted ${inserted} new attendance row(s).`);
  } finally {
    sqliteDb.close();
    await pool.close();
  }
}

main().catch((err) => {
  console.error('Attendance sync failed:', err.message);
  process.exit(1);
});
