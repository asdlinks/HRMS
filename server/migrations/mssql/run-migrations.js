// Applies every *.sql file in this folder, in filename order, to a SQL
// Server database — skipping any already recorded in the __migrations
// tracking table. Connection details are read from environment variables
// only (never hardcode credentials here):
//   MSSQL_CONNECTION_STRING="Server=host,port;Database=db;User Id=user;Password=pass;"
// or the discrete MSSQL_SERVER / MSSQL_PORT / MSSQL_DATABASE / MSSQL_USER / MSSQL_PASSWORD.
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

function parseConnectionString(connStr) {
    const parts = Object.fromEntries(
        connStr.split(';').filter(Boolean).map(kv => {
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
        console.error('Missing SQL Server connection details. Set MSSQL_CONNECTION_STRING or MSSQL_SERVER/MSSQL_DATABASE/MSSQL_USER/MSSQL_PASSWORD.');
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

async function ensureMigrationsTable(pool) {
    await pool.request().batch(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '__migrations')
        CREATE TABLE __migrations (
            filename     NVARCHAR(255) NOT NULL PRIMARY KEY,
            applied_at   DATETIME2 NOT NULL CONSTRAINT DF___migrations_applied_at DEFAULT (SYSUTCDATETIME())
        );
    `);
}

async function main() {
    const config = loadConfig();
    const dir = __dirname;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

    console.log(`Connecting to ${config.server}:${config.port}/${config.database} as ${config.user}...`);
    const pool = await sql.connect(config);

    try {
        await ensureMigrationsTable(pool);
        const applied = new Set(
            (await pool.request().query('SELECT filename FROM __migrations')).recordset.map(r => r.filename)
        );

        for (const file of files) {
            if (applied.has(file)) {
                console.log(`Skipping ${file} (already applied)`);
                continue;
            }

            const sqlText = fs.readFileSync(path.join(dir, file), 'utf8');
            const batches = sqlText.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(Boolean);

            console.log(`Applying ${file} (${batches.length} batches)...`);
            for (const [i, batch] of batches.entries()) {
                try {
                    await pool.request().batch(batch);
                } catch (err) {
                    console.error(`${file}: batch ${i + 1}/${batches.length} FAILED:\n${batch}\n`);
                    throw err;
                }
            }

            await pool.request()
                .input('filename', sql.NVarChar(255), file)
                .query('INSERT INTO __migrations (filename) VALUES (@filename)');
            console.log(`${file} applied.`);
        }

        console.log('All migrations up to date.');
    } finally {
        await pool.close();
    }
}

main().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
