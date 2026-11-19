# Schedula  Progress

## Task summary
Rebuild the preferences table for Schedula's academic scheduler, expose a secured preferences API, and make profile/setup collect and persist the same complete preference set.

## Checklist
- [x] Database migration
- [x] Rollback migration
- [x] Codebase cleanup of deleted columns
- [x] Shared frontend module
- [x] setup.html
- [x] profile.html
- [x] Backend GET
- [x] Backend PUT/POST
- [x] Server-side validation
- [~] Verification tests

## Remaining verification
- Browser-level setup/profile smoke test while static serving is enabled (SETUP_STATIC=true or open via a static file server).
- Confirm non-integer and preferred/avoided overlap popups on both pages.

## Current status
Preferences rebuild implementation is complete and live. Remaining verification is browser-level setup/profile onboarding and visual smoke testing.

## Next Steps
Browser smoke test setup/profile; verify persisted values and validation popups in both pages.

## Files changed
- PROGRESS.md - task tracking and handoff.
- backend/sql/migrations/003_preferences_rebuild.up.sql - live rebuild and backup migration.
- backend/sql/migrations/003_preferences_rebuild.down.sql - restores preferences_backup.
- backend/sql/migrations/001_schedula_schema.up.sql - fresh-install preferences shape.
- backend/sql/migrations/002_demo_seed.up.sql - seed preferences uses the new modality default.
- backend/services/userService.js - preference GET/PUT and validation.
- backend/routes/user.js - preferences GET/PUT routes; availability routes removed.
- backend/middleware/errorHandler.js - preserves explicit HTTP status/message for service validation.
- frontend/scripts/preferences.js - shared preference field mapping, validation, load, save.
- frontend/scripts/profile.js - profile preference load/save integration.
- frontend/scripts/setup.js - setup preference save integration.
- pages/profile.html - new preference controls and removed availability/default view.
- pages/setup.html - shared preference controls added to onboarding.
- frontend/css/profile.css - preference checkbox and field layout.
- frontend/css/auth-pages.css - setup preference layout.
- frontend/scripts/footer.js - removed availability wording.
- docs/SCHEDULA_DB_PLAN.md - preferences schema documentation.

## Columns dropped / added
### Dropped
- preferred_time_start
- preferred_time_end
- preferred_days
- buffer_minutes
- modality_preference
- default_view
- notification_settings
- time_of_day_preferences
- conflict_tolerance
- created_at
- updated_at
- deleted_at

### Added
- pref_time_0708, pref_time_0810, pref_time_1012, pref_time_1214, pref_time_1416, pref_time_1618, pref_time_1820, pref_time_2022, pref_time_2224
- PrefMon, PrefTue, PrefWed, PrefThurs, PrefFri, PrefSat
- avoid_time_0708, avoid_time_0810, avoid_time_1012, avoid_time_1214, avoid_time_1416, avoid_time_1618, avoid_time_1820, avoid_time_2022, avoid_time_2224
- AvoidMon, AvoidTue, AvoidWed, AvoidThurs, AvoidFri, AvoidSat
- max_back_to_back INTEGER NOT NULL DEFAULT 0 CHECK >= 0
- commute_time INTEGER NOT NULL DEFAULT 0 CHECK >= 0
- preferred_modality TEXT NOT NULL DEFAULT 'no preference' CHECK in ('onsite', 'online', 'no preference')

## Decisions and assumptions
- Raw SQL migration files are the existing migration convention; no ORM/migration framework is present.
- Existing `preferences` rows are retained and backfilled by defaults.
- Availability is a separate `availability_blocks` feature and will be removed from profile/setup preferences UI only.
- The backup table is `preferences_backup`; the up migration drops/recreates preferences and copies the original table into that backup.
- The down migration renames `preferences_backup` back to `preferences`.

## Blockers and open questions
- Static HTML serving is disabled (`SERVE_STATIC` false), so backend direct `/pages/*.html` smoke requests return 404. Run with static serving enabled or a static server.

## Test results
- 2026-11-20: Temporary database cloned and up migration passed; old columns absent, 35 columns verified, 3 rows/3 unique users.
- 2026-11-20: Temporary database rollback passed; original 14-column preferences schema and 3 rows restored.
- 2026-11-20: Live database dump created before migration at C:\Users\Win11\.copilot\session-state\3b18743a-1cf9-44ca-9ec3-aeae9d42a350\files\schedulaV1-preferences-backup.dump
- 2026-11-20: Live migration up applied successfully; 35 preference columns, 3 rows, 3 unique users.
- 2026-11-20: Stale preferences_updated_at trigger removed; put/upsert persistence passed PUT 200 and reload matched.
- 2026-11-20: Invalid modality returned 400; invalid integer returned 400; preferred/avoided time overlap returned 400.
- 2026-11-20: JavaScript syntax checks passed for preferences, setup, profile, routes, and service files.
- 2026-11-20: Account deletion changed from soft-delete to hard-delete; 004 cascade migration applied and live constraints verified.
- 2026-11-20: Disposable account deletion test passed: user, profile, and preferences rows all remained 0 after DELETE.

## Handoff notes
- Run from the repository root.
- Local backend: `cd backend && npm start`
- Database migrations are SQL files under `backend/sql/migrations/`.
- Migration: `psql "$DATABASE_URL" -f backend/sql/migrations/003_preferences_rebuild.up.sql`
- Rollback: `psql "$DATABASE_URL" -f backend/sql/migrations/003_preferences_rebuild.down.sql`
- Account cascade migration: `psql "$DATABASE_URL" -f backend/sql/migrations/004_account_deletion_cascade.up.sql`
- Account cascade rollback: `psql "$DATABASE_URL" -f backend/sql/migrations/004_account_deletion_cascade.down.sql`

## API contract
- GET /api/preferences - authenticated; returns all new preference columns only.
- PUT /api/preferences - authenticated; upserts by token-derived user id.

## Request/response shape
- Request: `{ commute_time, max_back_to_back, preferred_modality, pref_time_0708, ... , PrefMon, ..., avoid_time_0708, ..., AvoidMon, ... }`
- Response: the complete new preference row shape, or `{}` defaults if none exists.

## Log
- 2026-11-20: setup.html converted to a 5-step carousel with Back/Next/Save & finish controls and shared preference validation.
- 2026-11-20: setup.html redesigned to match profile.html panel/grid, fields, preference groups, and green save-button aesthetic.
- 2026-11-20: Profile Save Profile and Save Preferences buttons updated to reuse the builder save SVG, green gradient, dimensions, and keycap hover/press behavior.
- 2026-11-20: Progress tracking initialized and stack confirmed.
- 2026-11-20: Live preferences schema inspected: id and user_id retained; old preference and audit columns identified.
- 2026-11-20: Created 003 preferences rebuild up/down migrations with preferences_backup.
