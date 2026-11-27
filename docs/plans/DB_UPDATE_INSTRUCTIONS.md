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
Get-Content .\backend\sql\migrations\003_preferences_rebuild.up.sql | psql
Get-Content .\backend\sql\migrations\004_account_deletion_cascade.up.sql | psql
Get-Content .\backend\sql\migrations\005_preferred_break.up.sql | psql
Get-Content .\backend\sql\migrations\006_back_to_back_tolerance.up.sql | psql
Get-Content .\backend\sql\migrations\007_teams_features.up.sql | psql
Get-Content .\backend\sql\migrations\008_teams_demo_seed.up.sql | psql
Get-Content .\backend\sql\migrations\009_team_proposal_description.up.sql | psql
Get-Content .\backend\sql\migrations\010_session_idle_timeout.up.sql | psql
Get-Content .\backend\sql\migrations\011_remove_unused_calendar_tables.up.sql | psql
```

Apply migrations sequentially:
- `001_schedula_schema.up.sql`: Base tables, extensions (`pgcrypto`, `citext`, `btree_gist`), constraints, GiST indexes, and trigger functions.
- `002_demo_seed.up.sql`: Demo accounts, team group, preferences, schedules, context, and sample events.
- `003_preferences_rebuild.up.sql`: Rebuilds preferences table to normalize time-of-day slots, weekday preference/avoidance flags, commute time, and modality.
- `004_account_deletion_cascade.up.sql`: Updates foreign key constraints on `groups`, `schedules`, `events`, and `invitations` with `ON DELETE CASCADE` for clean user account deletion.
- `005_preferred_break.up.sql`: Adds `preferred_break_minutes` with a 60-minute default and constraint between 0 and 1440.
- `006_back_to_back_tolerance.up.sql`: Constrains `max_back_to_back` to values between 0 and 6.
- `007_teams_features.up.sql`: Adds group join codes and team event/proposal/response tables while reusing `groups` and `memberships`.
- `008_teams_demo_seed.up.sql`: Adds local demo team accounts, weekly schedules, and a pending proposal.
- `009_team_proposal_description.up.sql`: Adds proposal descriptions.
- `010_session_idle_timeout.up.sql`: Adds refresh-token session IDs and last-activity timestamps.
- `011_remove_unused_calendar_tables.up.sql`: Drops unused recurrence, participant, consolidated-view, and availability tables. This deletes any data in those tables.

Verify the resulting tables and preference columns:

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
3. Open and execute `backend/sql/migrations/001_schedula_schema.up.sql`.
4. Confirm there are no errors, then execute `backend/sql/migrations/002_demo_seed.up.sql`.
5. Sequentially execute `backend/sql/migrations/003_preferences_rebuild.up.sql` through `011_remove_unused_calendar_tables.up.sql`.
6. Refresh **Schemas > public > Tables**.
7. Confirm `users`, `profiles`, `preferences`, `schedules`, `events`, `groups`, `memberships`, `team_events`, `team_proposals`, `proposal_responses`, `schedule_shares`, and `invitations` exist. Confirm the removed recurrence, participant, availability, and consolidated-view tables do not exist, and verify preference defaults and constraints.
8. Run the verification queries from the psql section.

Execute the seed only after the schema migration succeeds. If the query tool reports that an extension cannot be created, connect as a database owner/superuser or ask the database administrator to enable `pgcrypto`, `citext`, and `btree_gist`.

## Rollback

Rollback is intentionally manual and destructive for this starter-template replacement. Run the schema rollback only after taking a backup:

```powershell
Get-Content .\backend\sql\migrations\011_remove_unused_calendar_tables.down.sql | psql
Get-Content .\backend\sql\migrations\010_session_idle_timeout.down.sql | psql
Get-Content .\backend\sql\migrations\009_team_proposal_description.down.sql | psql
Get-Content .\backend\sql\migrations\008_teams_demo_seed.down.sql | psql
Get-Content .\backend\sql\migrations\007_teams_features.down.sql | psql
Get-Content .\backend\sql\migrations\006_back_to_back_tolerance.down.sql | psql
Get-Content .\backend\sql\migrations\005_preferred_break.down.sql | psql
Get-Content .\backend\sql\migrations\004_account_deletion_cascade.down.sql | psql
Get-Content .\backend\sql\migrations\003_preferences_rebuild.down.sql | psql
Get-Content .\backend\sql\migrations\002_demo_seed.down.sql | psql
Get-Content .\backend\sql\migrations\001_schedula_schema.down.sql | psql
```

The rollback removes the generic schema. It does not restore the removed academic tables or data. Restore those from a database backup if required.

## Local development reset

For a disposable loopback-only development database, run `npm run db:reset` from `backend/`. The script refuses production mode, non-loopback `DB_HOST` values, and a PostgreSQL server that does not report a loopback address. It drops and recreates the `public` schema and applies migrations 001–011 in one transaction. **This destroys every table and row in that database. Do not point it at a database containing data you need.**

## Application Configuration

After the database is updated, configure the backend process with matching `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` values. The backend APIs use the UUID-based schema and authenticated user IDs.
