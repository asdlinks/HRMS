// One-time, idempotent bootstrap: inserts the first `platform_admins` row so
// there's someone who can log into the Platform Admin portal at all. There is
// deliberately no self-registration for platform admins — this script (or a
// direct INSERT by an operator) is the only way to create one.
//
// Usage:
//   MSSQL_CONNECTION_STRING="Server=host,port;Database=db;User Id=user;Password=pass;" \
//     PLATFORM_ADMIN_SEED_NAME="Mywe Ops" \
//     PLATFORM_ADMIN_SEED_EMAIL="ops@mywetechnologies.com" \
//     PLATFORM_ADMIN_SEED_PASSWORD="change-me-immediately" \
//     node server/migrations/mssql/027_seed_first_platform_admin.js
const path = require('path');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const { getDbConfig } = require(path.join(__dirname, '..', '..', 'config', 'env'));

async function main() {
    const name = process.env.PLATFORM_ADMIN_SEED_NAME;
    const email = process.env.PLATFORM_ADMIN_SEED_EMAIL;
    const password = process.env.PLATFORM_ADMIN_SEED_PASSWORD;

    if (!name || !email || !password) {
        console.error('PLATFORM_ADMIN_SEED_NAME, PLATFORM_ADMIN_SEED_EMAIL and PLATFORM_ADMIN_SEED_PASSWORD are all required.');
        process.exit(1);
    }

    const pool = await new sql.ConnectionPool(getDbConfig()).connect();
    try {
        const existing = await pool.request()
            .input('email', sql.NVarChar(255), email)
            .query('SELECT id FROM platform_admins WHERE email = @email');

        if (existing.recordset.length > 0) {
            console.log(`Platform admin "${email}" already exists (id ${existing.recordset[0].id}) — nothing to do.`);
            return;
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const inserted = await pool.request()
            .input('name', sql.NVarChar(255), name)
            .input('email', sql.NVarChar(255), email)
            .input('password', sql.NVarChar(255), passwordHash)
            .query('INSERT INTO platform_admins (name, email, password) OUTPUT INSERTED.id VALUES (@name, @email, @password)');

        console.log(`Created platform admin "${email}" (id ${inserted.recordset[0].id}).`);
    } finally {
        await pool.close();
    }
}

main().catch((err) => {
    console.error('Platform admin seed failed:', err.message);
    process.exit(1);
});
