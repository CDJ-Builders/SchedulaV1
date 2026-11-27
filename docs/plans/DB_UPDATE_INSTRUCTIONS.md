# Schedula PostgreSQL Setup and Migrations

## Fresh database

A new empty PostgreSQL database starts from the squashed current schema in one file. The file contains no demo rows and is regenerated from the ordered schema migrations in this repository.

```powershell
cd backend
npm run db:setup
npm run db:migrate
```

`db:setup` refuses to run if application tables already exist. It applies `backend/sql/1setup.sql`, which installs the final schema and creates `schema_migrations` with the baseline recorded. `db:migrate` then applies only migrations added after that baseline. PostgreSQL needs the extensions used by the schema (`pgcrypto`, `citext`, `btree_gist`); enable them for the database if the provider role cannot create extensions.

To update the squashed setup after adding a migration:

```powershell
npm run db:build-setup
```

Review the generated `backend/sql/1setup.sql` and commit it with the migration. Never edit an applied numbered migration; add a new numbered up/down pair. The migration runner stores SHA-256 checksums for incremental migrations and rejects edits to already-applied migration files.

## Existing current-schema database without a ledger

The first `npm run db:migrate` creates `schema_migrations`, verifies the current Schedula schema signature, and records migrations 001–011 as a baseline before applying later migrations. It does not drop or rewrite existing data. If verification fails, it stops and reports missing tables/columns; do not run `db:setup` on a non-empty database.

## Local disposable reset

`npm run db:reset` is destructive and guarded to refuse production and non-loopback database hosts. It drops and recreates the local `public` schema, installs the same squashed setup, and inserts no seed data. Only use it for a disposable local database.

## Connection configuration

The backend reads the existing `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` variables. For Supabase or another provider requiring TLS, set `DB_SSL=true`; certificate verification stays enabled by default. `DB_SSL_REJECT_UNAUTHORIZED=false` is available only for providers whose certificate chain cannot be verified, and should not be used without an operator decision.

Migrations are not automatically run when the API starts. Apply them as a deployment step before rolling out code that depends on the new schema.

## Demo data

Schema setup and reset do not insert demo accounts, schedules, or teams. Use only the explicit admin demo seed command, which writes aggregate request-metric fixtures and no user, personal schedule, or team data.
