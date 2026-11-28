const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
require('../config/env');

const migrationsDir = path.join(__dirname, '..', 'sql', 'migrations');
const migrationPattern = /^(\d{3})_(.+)\.up\.sql$/;

function dbConfig() {
  return {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined
  };
}

function loadMigrations() {
  return fs.readdirSync(migrationsDir)
    .map(name => ({ name, match: name.match(migrationPattern) }))
    .filter(item => item.match)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))
    .map(item => ({ version: item.match[1], name: item.name, sql: fs.readFileSync(path.join(migrationsDir, item.name), 'utf8') }));
}

function stripTransactionWrapper(sql) {
  return sql.replace(/^\s*BEGIN\s*;\s*/i, '').replace(/\s*COMMIT\s*;\s*$/i, '');
}

function checksum(sql) {
  return crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

async function ensureLedger(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function verifyCurrentSchema(client) {
  const required = {
    users: ['id', 'email', 'password_hash', 'platform_role', 'created_at', 'updated_at', 'deleted_at'],
    profiles: ['id', 'user_id', 'display_name', 'timezone', 'locale', 'avatar_url', 'working_hours', 'created_at', 'updated_at', 'deleted_at'],
    preferences: ['id', 'user_id', 'preferred_break_minutes', 'max_back_to_back', 'preferred_modality'],
    groups: ['id', 'owner_user_id', 'name', 'group_code', 'created_at', 'updated_at', 'deleted_at'],
    schedules: ['id', 'owner_user_id', 'group_id', 'title', 'timezone', 'color', 'created_at', 'updated_at', 'deleted_at'],
    schedule_context: ['id', 'schedule_id', 'context', 'created_at', 'updated_at', 'deleted_at'],
    events: ['id', 'schedule_id', 'owner_user_id', 'title', 'start_at', 'end_at', 'event_window', 'created_at', 'updated_at', 'deleted_at'],
    memberships: ['id', 'group_id', 'user_id', 'role', 'created_at', 'updated_at', 'deleted_at'],
    team_events: ['id', 'group_id', 'created_by_user_id', 'title', 'weekday', 'start_time', 'end_time', 'modality', 'created_at', 'updated_at'],
    team_proposals: ['id', 'group_id', 'proposed_by_user_id', 'title', 'description', 'weekday', 'start_time', 'end_time', 'modality', 'status', 'created_at', 'updated_at'],
    proposal_responses: ['id', 'proposal_id', 'user_id', 'response', 'responded_at'],
    schedule_shares: ['id', 'schedule_id', 'shared_with_user_id', 'shared_with_group_id', 'permission', 'show_details', 'created_at', 'updated_at', 'deleted_at'],
    invitations: ['id', 'group_id', 'invited_by_user_id', 'email', 'token_hash', 'expires_at', 'accepted_at', 'created_at', 'updated_at', 'deleted_at'],
    refresh_tokens: ['id', 'user_id', 'token_hash', 'session_id', 'last_activity_at', 'expires_at', 'revoked_at', 'created_at', 'updated_at', 'deleted_at'],
    password_reset_tokens: ['id', 'user_id', 'token_hash', 'expires_at', 'used_at', 'created_at', 'updated_at', 'deleted_at']
  };
  for (const [table, columns] of Object.entries(required)) {
    const result = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 AND column_name = ANY($2::text[])`,
      [table, columns]
    );
    const found = new Set(result.rows.map(row => row.column_name));
    const missing = columns.filter(column => !found.has(column));
    if (missing.length) throw new Error(`Cannot adopt this database as the current Schedula schema: ${table} is missing ${missing.join(', ')}.`);
  }
}

async function adoptCurrentSchema(client, migrations) {
  const existing = await client.query('SELECT COUNT(*)::integer AS count FROM schema_migrations');
  if (existing.rows[0].count) return;
  const tables = await client.query(`SELECT COUNT(*)::integer AS count FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations'`);
  if (!tables.rows[0].count) {
    throw new Error('This database has no migration history. Apply backend/sql/1setup.sql to a new database, then run db:migrate.');
  }
  await verifyCurrentSchema(client);
  await client.query('BEGIN');
  try {
    for (const migration of migrations.filter(item => Number(item.version) <= 11)) {
      await client.query(
        'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, NULL) ON CONFLICT (version) DO NOTHING',
        [migration.version, migration.name]
      );
    }
    await client.query('COMMIT');
    console.log('Recorded the verified pre-ledger schema as baseline migrations 001–011.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const client = new Client(dbConfig());
  const migrations = loadMigrations();
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query("SELECT pg_advisory_lock(hashtext('schedula-schema-migrations'))");
    await ensureLedger(client);
    await adoptCurrentSchema(client, migrations);
    const applied = await client.query('SELECT version, checksum FROM schema_migrations');
    const byVersion = new Map(applied.rows.map(row => [row.version, row.checksum]));
    for (const migration of migrations) {
      if (byVersion.has(migration.version)) {
        const recordedChecksum = byVersion.get(migration.version);
        if (recordedChecksum && recordedChecksum !== checksum(migration.sql)) {
          throw new Error(`Applied migration ${migration.version} has changed. Add a new migration instead of editing it.`);
        }
        continue;
      }
      const migrationChecksum = checksum(migration.sql);
      await client.query('BEGIN');
      try {
        await client.query(stripTransactionWrapper(migration.sql));
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [migration.version, migration.name, migrationChecksum]
        );
        await client.query('COMMIT');
        console.log(`Applied ${migration.version} ${migration.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${migration.version} failed: ${error.message}`);
      }
    }
  } finally {
    if (connected) await client.query("SELECT pg_advisory_unlock(hashtext('schedula-schema-migrations'))").catch(() => {});
    await client.end().catch(() => {});
  }
}

main().catch(error => {
  console.error(`Database migration failed: ${error.message}`);
  process.exitCode = 1;
});
