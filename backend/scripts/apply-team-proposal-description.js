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
    await client.query('BEGIN');
    const sqlPath = path.join(__dirname, '..', 'sql', 'migrations', '009_team_proposal_description.up.sql');
    await client.query(fs.readFileSync(sqlPath, 'utf8'));
    await client.query('COMMIT');
    console.log('Migration 009 applied: team proposals now support descriptions.');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Migration 009 failed: ' + error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch(error => {
  console.error('Migration 009 failed: ' + error.message);
  process.exitCode = 1;
});
