const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('../config/env');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined
  });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query("SELECT pg_advisory_lock(hashtext('schedula-schema-migrations'))");
    const tables = await client.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
        AND table_name <> 'schema_migrations' LIMIT 1`);
    if (tables.rowCount) throw new Error('Fresh setup only runs on an empty database. No changes were made.');
    const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', '1setup.sql'), 'utf8');
    await client.query(sql);
    console.log('Fresh Schedula schema installed. Demo data was not inserted.');
  } finally {
    if (connected) await client.query("SELECT pg_advisory_unlock(hashtext('schedula-schema-migrations'))").catch(() => {});
    await client.end().catch(() => {});
  }
}

main().catch(error => {
  console.error(`Fresh database setup failed: ${error.message}`);
  process.exitCode = 1;
});
