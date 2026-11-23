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
Get-Content .\backend\sql\migrations\005_preferred_break.up.sql | psql
Get-Content .\backend\sql\migrations\006_back_to_back_tolerance.up.sql | psql
```

Apply `005_preferred_break.up.sql` after the base schema has created `preferences`; it adds `preferred_break_minutes` with a 60-minute default. Then apply `006_back_to_back_tolerance.up.sql` to constrain `max_back_to_back` to 0–6. The base schema and demo seed use conflict guards. Verify the resulting tables and preference columns:

```powershell
psql -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
psql -c "SELECT email, platform_role FROM users ORDER BY email;"
psql -c "SELECT s.title, COUNT(e.id) AS event_count FROM schedules s LEFT JOIN events e ON e.schedule_id = s.id AND e.deleted_at IS NULL GROUP BY s.id, s.title ORDER BY s.title;"
psql -c "SELECT column_name, column_default FROM information_schema.columns WHERE table_name = 'preferences' AND column_name IN ('preferred_break_minutes', 'max_back_to_back');"
```

Clear the session password when finished:

```powershell
Remove-Item Env:PGPASSWORD
```

## pgAdmin

1. Open pgAdmin and connect to the target PostgreSQL server.
2. Select the target database, then open **Query Tool**.
3. Open `backend/sql/migrations/001_schedula_schema.up.sql` and execute it.
4. Confirm there are no errors, then open and execute `backend/sql/migrations/002_demo_seed.up.sql`.
5. Open and execute `backend/sql/migrations/005_preferred_break.up.sql` and `backend/sql/migrations/006_back_to_back_tolerance.up.sql`.
6. Refresh **Schemas > public > Tables**.
7. Confirm `users`, `profiles`, `preferences`, `schedules`, `events`, `availability_blocks`, `groups`, `memberships`, `schedule_shares`, `consolidated_views`, and `invitations` exist, and confirm `preferences.preferred_break_minutes` defaults to 60 and `max_back_to_back` is constrained to 0–6.
8. Run the verification queries from the psql section.

Execute the seed only after the schema migration succeeds. If the query tool reports that an extension cannot be created, connect as a database owner/superuser or ask the database administrator to enable `pgcrypto`, `citext`, and `btree_gist`.

## Rollback

Rollback is intentionally manual and destructive for this starter-template replacement. Run the schema rollback only after taking a backup:

```powershell
Get-Content .\backend\sql\migrations\006_back_to_back_tolerance.down.sql | psql
Get-Content .\backend\sql\migrations\005_preferred_break.down.sql | psql
Get-Content .\backend\sql\migrations\002_demo_seed.down.sql | psql
Get-Content .\backend\sql\migrations\001_schedula_schema.down.sql | psql
```

The rollback removes the generic schema. It does not restore the removed academic tables or data. Restore those from a database backup if required.

## Application Configuration

After the database is updated, configure the backend process with matching `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` values. Phase 2 must update the backend services before the application can use this UUID-based schema; the current legacy service queries intentionally do not match it yet.
