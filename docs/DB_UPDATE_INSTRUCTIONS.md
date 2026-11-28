# Schedula Database Update Instructions

The repository now contains generic PostgreSQL migrations under `backend/sql/migrations/`. Docker is not required. Apply them to an existing PostgreSQL database with either `psql` or pgAdmin.

## Before You Start

Have these values for the target database:

- host, normally `localhost`
- port, normally `5432`
- database name
- database user
- password

The migration replaces the academic schema. Back up any database that contains data you need before applying it. The old academic schedule JSON is not automatically converted into generic events.

## psql on Windows PowerShell

Set connection variables for the current PowerShell session. Do not commit them:

```powershell
$env:PGHOST = "localhost"
$env:PGPORT = "5432"
$env:PGDATABASE = "schedula"
$env:PGUSER = "postgres"
$env:PGPASSWORD = "replace-with-your-password"
```

Check the connection without printing the password:

```powershell
psql -c "SELECT current_database(), current_user, version();"
```

Apply the schema and demo data in order:

```powershell
Get-Content .\backend\sql\migrations\001_schedula_schema.up.sql | psql
Get-Content .\backend\sql\migrations\002_demo_seed.up.sql | psql
Get-Content .\backend\sql\migrations\005_scheduling_requests.up.sql | psql
```

For an existing database, apply `005_scheduling_requests.up.sql` to enable persisted Quick Add requests. Verify the resulting tables:

```powershell
psql -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
psql -c "SELECT email, platform_role FROM users ORDER BY email;"
psql -c "SELECT s.title, COUNT(e.id) AS event_count FROM schedules s LEFT JOIN events e ON e.schedule_id = s.id AND e.deleted_at IS NULL GROUP BY s.id, s.title ORDER BY s.title;"
```

Clear the session password when finished:

```powershell
Remove-Item Env:PGPASSWORD
```

## pgAdmin

1. Open pgAdmin and connect to the target PostgreSQL server.
2. Select the target database, then open **Query Tool**.
3. Open `backend/sql/migrations/001_schedula_schema.up.sql` and execute it.
4. Confirm there are no errors, then execute `backend/sql/migrations/002_demo_seed.up.sql` followed by `backend/sql/migrations/005_scheduling_requests.up.sql`.
5. Refresh **Schemas > public > Tables**.
6. Confirm `users`, `profiles`, `preferences`, `schedules`, `events`, `scheduling_requests`, `availability_blocks`, `groups`, `memberships`, `schedule_shares`, `consolidated_views`, and `invitations` exist.
7. Run the verification queries from the psql section.

Execute the seed only after the schema migration succeeds. If the query tool reports that an extension cannot be created, connect as a database owner/superuser or ask the database administrator to enable `pgcrypto`, `citext`, and `btree_gist`.

## Rollback

Rollback is intentionally manual and destructive for this starter-template replacement. Run the schema rollback only after taking a backup:

```powershell
Get-Content .\backend\sql\migrations\005_scheduling_requests.down.sql | psql
Get-Content .\backend\sql\migrations\002_demo_seed.down.sql | psql
Get-Content .\backend\sql\migrations\001_schedula_schema.down.sql | psql
```

Apply `005_scheduling_requests.down.sql` first only when rolling back the Quick Add request feature. The full rollback removes the generic schema. It does not restore the removed academic tables or data. Restore those from a database backup if required.

## Application Configuration

After the database is updated, configure the backend process with matching `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` values. Phase 2 must update the backend services before the application can use this UUID-based schema; the current legacy service queries intentionally do not match it yet.
