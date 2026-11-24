const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

require('../config/env');

async function main() {
  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
  });

  try {
    await client.connect();
    const migrationPath = path.join(__dirname, '..', 'sql', 'migrations', '010_session_idle_timeout.up.sql');
    await client.query(fs.readFileSync(migrationPath, 'utf8'));
    console.log('Migration 010 applied: sessions now track API activity for idle logout.');
  } catch (error) {
    console.error('Migration 010 failed: ' + error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch(error => {
  console.error('Migration 010 failed: ' + error.message);
  process.exitCode = 1;
});
