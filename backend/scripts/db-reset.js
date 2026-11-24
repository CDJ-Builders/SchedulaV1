const fs = require('fs');
const path = require('path');
const net = require('net');
const { Client } = require('pg');

require('../config/env');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const MIGRATIONS = [
  '001_schedula_schema.up.sql',
  '002_demo_seed.up.sql',
  '003_preferences_rebuild.up.sql',
  '004_account_deletion_cascade.up.sql',
  '005_preferred_break.up.sql',
  '006_back_to_back_tolerance.up.sql',
  '007_teams_features.up.sql',
  '008_teams_demo_seed.up.sql',
  '009_team_proposal_description.up.sql',
  '010_session_idle_timeout.up.sql'
];

function assertLocalDevelopmentTarget() {
  const host = String(process.env.DB_HOST || '').toLowerCase();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset a production database.');
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error('Refusing to reset: DB_HOST must be localhost, 127.0.0.1, or ::1.');
  }
  if (!process.env.DB_NAME || !process.env.DB_USER) {
    throw new Error('Refusing to reset: DB_NAME and DB_USER must be configured.');
  }
}

function isLoopbackAddress(address) {
  if (!address) return false;
  if (net.isIPv4(address)) return address.startsWith('127.');
  if (net.isIPv6(address)) return address === '::1' || address.toLowerCase().startsWith('::ffff:127.');
  return false;
}

function withoutTransactionWrapper(sql) {
  return sql.replace(/^\s*BEGIN\s*;/i, '').replace(/\s*COMMIT\s*;\s*$/i, '');
}

async function main() {
  assertLocalDevelopmentTarget();

  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
  });

  try {
    await client.connect();
    const address = await client.query('SELECT inet_server_addr()::text AS address');
    if (!isLoopbackAddress(address.rows[0]?.address)) {
      throw new Error('Refusing to reset: PostgreSQL did not confirm a loopback server address.');
    }

    await client.query('BEGIN');
    await client.query('DROP EXTENSION IF EXISTS btree_gist CASCADE');
    await client.query('DROP EXTENSION IF EXISTS citext CASCADE');
    await client.query('DROP EXTENSION IF EXISTS pgcrypto CASCADE');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public AUTHORIZATION CURRENT_USER');
    await client.query('GRANT USAGE ON SCHEMA public TO PUBLIC');

    const migrationDirectory = path.join(__dirname, '..', 'sql', 'migrations');
    for (const file of MIGRATIONS) {
      const sql = fs.readFileSync(path.join(migrationDirectory, file), 'utf8');
      await client.query(withoutTransactionWrapper(sql));
    }
    await client.query('COMMIT');
    console.log('Local development database reset complete. Applied 10 ordered migrations.');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Database reset failed: ' + error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch(error => {
  console.error('Database reset refused: ' + error.message);
  process.exitCode = 1;
});
