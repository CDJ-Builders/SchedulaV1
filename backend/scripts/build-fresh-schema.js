const fs = require('fs');
const path = require('path');

const sqlDirectory = path.join(__dirname, '..', 'sql');
const migrationsDirectory = path.join(sqlDirectory, 'migrations');
function isSeedMigration(item) {
  return /(^|_)demo_seed\.up\.sql$/.test(item.name);
}

function stripTransactionWrapper(sql) {
  return sql.replace(/^\s*BEGIN\s*;\s*/i, '').replace(/\s*COMMIT\s*;\s*$/i, '').trim();
}

function main() {
  const migrations = fs.readdirSync(migrationsDirectory)
    .map(name => ({ name, match: name.match(/^(\d{3})_(.+)\.up\.sql$/) }))
    .filter(item => item.match)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));
  const applied = migrations.filter(item => !isSeedMigration(item));
  const parts = [
    '-- Schedula squashed fresh-database schema. Apply this single file to a new, empty PostgreSQL database.',
    '-- It incorporates schema changes through the latest migration and excludes demo seed data.',
    '-- Regenerate with `npm run db:build-setup` after adding a schema migration.',
    'BEGIN;'
  ];

  for (const migration of applied) {
    parts.push(`-- Schema changes from ${migration.name}\n${stripTransactionWrapper(fs.readFileSync(path.join(migrationsDirectory, migration.name), 'utf8'))}`);
  }
  parts.push('-- The preference backup in migration 003 is upgrade-only; it is not part of the final schema.\nDROP TABLE IF EXISTS preferences_backup;');
  parts.push(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  for (const migration of migrations) {
    const version = migration.match[1];
    parts.push(`INSERT INTO schema_migrations (version, name, checksum) VALUES ('${version}', '${migration.name}', NULL) ON CONFLICT (version) DO NOTHING;`);
  }
  parts.push('COMMIT;');
  fs.writeFileSync(path.join(sqlDirectory, '1setup.sql'), `${parts.join('\n\n')}\n`);
  console.log(`Generated backend/sql/1setup.sql through schema migration ${migrations.at(-1)?.match[1] || 'none'}.`);
}

main();
