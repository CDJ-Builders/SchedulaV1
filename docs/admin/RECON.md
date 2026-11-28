# Admin Interface Recon

Phase 0 repository findings for the Schedula super admin interface plan.

## Schema

The authoritative schema in this repository is represented by `backend/sql/migrations/001_schedula_schema.up.sql` through `011_*.up.sql`; the API expects migrations to be applied separately at startup. PostgreSQL uses UUID primary keys (usually `gen_random_uuid()`), `CITEXT` for email, `JSONB` for flexible payloads, `created_at`/`updated_at` timestamps, and `deleted_at` soft deletion on most core tables. `set_updated_at()` triggers maintain timestamps on tables included in migration 001 and the team tables.

| Table | Primary key | Foreign keys / notable relationships | Timestamps / deletion |
| --- | --- | --- | --- |
| `users` | `id` UUID | — | created, updated, deleted |
| `profiles` | `id` UUID | `user_id` → users, unique, cascade | created, updated, deleted |
| `preferences` | `id` UUID | `user_id` → users, unique | created, updated; no deleted_at |
| `groups` | `id` UUID | `owner_user_id` → users | created, updated, deleted |
| `schedules` | `id` UUID | `owner_user_id` → users; nullable `group_id` → groups (set null) | created, updated, deleted |
| `schedule_context` | `id` UUID | `schedule_id` → schedules, unique, cascade | created, updated, deleted |
| `events` | `id` UUID | `schedule_id` → schedules (cascade); `owner_user_id` → users | created, updated, deleted; generated `event_window` |
| `memberships` | `id` UUID | `group_id` → groups (cascade); `user_id` → users (cascade); unique pair | created, updated, deleted |
| `schedule_shares` | `id` UUID | `schedule_id` → schedules; optional user or group target, exclusive | created, updated, deleted |
| `invitations` | `id` UUID | `group_id` → groups; `invited_by_user_id` → users | created, updated, deleted; `token_hash` secret, expiry/accepted timestamps |
| `refresh_tokens` | `id` UUID | `user_id` → users (cascade) | created, updated, deleted; expires, revoked; migration 010 adds unique `session_id` and `last_activity_at`; stores `token_hash` |
| `password_reset_tokens` | `id` UUID | `user_id` → users (cascade) | created, updated, deleted; expires, used; stores `token_hash` |
| `team_events` | `id` UUID | `group_id` → groups (cascade); `created_by_user_id` → users (cascade) | created, updated; no soft delete |
| `team_proposals` | `id` UUID | `group_id` → groups (cascade); `proposed_by_user_id` → users (cascade); optional converted event | created, updated; no soft delete |
| `proposal_responses` | `id` UUID | `proposal_id` → team_proposals (cascade); `user_id` → users (cascade); unique pair | `responded_at`; no created/updated/deleted fields |

Migration 011 removes legacy recurrence, participant, consolidated-view and availability tables. The `platform_role` column on users is currently `TEXT NOT NULL DEFAULT 'user' CHECK (platform_role IN ('user', 'admin'))`. Team membership roles are separate (`owner`, `admin`, `member`, `viewer`).

## Auth and authorization

- `POST /api/signup` and `POST /api/login` are in `backend/routes/auth.js`; password hashes use PostgreSQL `crypt()` / Blowfish. Login returns a 15-minute JWT access token and a 7-day refresh token.
- Access JWTs carry `user_id` and `session_id`. Refresh tokens are stored by SHA-256 hash in `refresh_tokens`; middleware in `backend/middleware/auth.js` checks/touches the matching active session on each authenticated API request and enforces a 30-minute inactivity cutoff.
- `frontend/scripts/auth.js` stores access and refresh tokens in browser `localStorage`; the server separately stores the refresh-token hash and session metadata in PostgreSQL. These are distinct storage locations.
- `authenticateToken` sets `req.user` from the JWT after session validation. Existing `adminOnly` checks the current DB `platform_role` against `admin`, so authorization is already DB-backed, although access claims still exist in the response payload.
- `backend/db-server.js` mounts auth, user, schedule, team, then `/api/admin` routes. Static assets, when `SERVE_STATIC=true`, are served from repo root and unknown paths return `index.html`. No `/admin` page-specific server guard exists.
- Existing admin API (`backend/routes/admin.js`, `backend/services/adminService.js`) supports user listing/create/update/delete and schedule list/soft-delete. All routes use `authenticateToken` + `adminOnly`. `createUser` accepts a caller-provided `platform_role` (including `admin`); delete user is a hard delete. There are no admin audit records or step-up checks.
- No cookie authentication or server-side session store is present. Production is expected to use Supabase or another PostgreSQL provider.

## Resource routes and services

- Users/profile/preferences: `/api/user-session`, `/api/user/profile`, `/api/preferences` in `backend/routes/user.js` and `backend/services/userService.js`.
- Schedules and events: `/api/schedules`, `/api/schedules/:scheduleId/events`, `/api/events/:eventId`, `/api/events/conflicts`; service is `scheduleService.js`. Schedule and event deletes are soft deletes.
- Groups/teams: `/api/teams` and nested membership, proposal, shared-schedule operations in `backend/routes/teams.js` and `teamsService.js` / `teamsServiceCore.js`. The product calls these “teams” in routes/UI but persists them in `groups`; memberships are in `memberships`.
- Invitations exist in the schema but no invitation route was found in the current API.
- SchedulaML/recommendation operations are `POST /api/schedules/:scheduleId/recommendations` and `POST /api/teams/:teamId/recommendations`, implemented in `recommendationService.js`. The service calls the separately configured `SCHEDULAML_URL` and supports an enable flag. It validates responses but does not persist request analytics.
- Conflict detection is an endpoint/service operation; no conflict-event/history table was found. No activity-event, request-metrics, audit, or error-log tables were found.
- Product direction is to limit admin CRUD to general operational data, excluding personal and team data. This rules out generic CRUD for users/profiles/preferences, groups/memberships, invitations/shares, and team events/proposals/responses. Schedules and events are user-owned and may contain personal details, so their inclusion requires field-level privacy review.

## Frontend and styling conventions

The app is currently vanilla HTML/CSS/JS under repo root `pages/`, `frontend/scripts/`, and `frontend/css/`; there is no frontend package manifest/build pipeline. `frontend/css/theme.css` defines shared palette variables and `.key`, `.well`, `.card`; `frontend/css/plotter.css` defines schedule layout and `@keyframes drop`. `frontend/css/teams.css` contains modality presentation and additional tactile button variants. A local Bricolage Grotesque font is referenced by CSS; confirm its asset path and font-face definition before admin work. Existing UI pages are static HTML and API auth is client-side.

## Gaps, risks, and plan conflicts

1. The requested role migration says add `role` with `user | developer | super_admin`, but the deployed schema/API use `platform_role` with `user | admin`. There are no existing admin accounts to map; the migration still needs to reconcile the current schema and API/client `access` field.
2. Sessions are represented by one refresh-token record per login session, but there is no explicit admin force-logout service. Revocation can likely use the existing `session_id`/`revoked_at` columns, subject to maintaining refresh/logout behavior.
3. The plan’s resource wording “group members” maps to `memberships`; schedule entries/events map to `events`; additional admin-manageable tables include profiles, preferences, schedule context/shares, invitations, team events/proposals/responses. Some tables contain secrets or user-private preferences and need deliberate column allowlists.
4. Soft-delete support is inconsistent: `preferences`, `team_events`, `team_proposals`, and `proposal_responses` lack `deleted_at`; `proposal_responses` also lacks standard timestamps. A generic CRUD/restore registry cannot treat every table identically.
5. Dashboard values such as DAU/WAU/MAU, signups over time (possible from `users.created_at`), smart-schedule call count/latency/fallbacks, and request/error rates are not all derivable from existing persisted data. No activity signal or request metrics exist; adding event instrumentation or rollups would be needed for historical values. Active-user tracking is intentionally omitted from the admin interface and API.
6. Database migration version tracking is not evident in the inspected migration files; migrations are manually applied scripts. Health output cannot report a verified current migration version without adding a tracking convention or deployment input.
7. API errors are generally `{ error: message }`; `asyncHandler` forwards failures to a central handler that logs to console. No request ID or persisted error capture currently exists.
8. There is no admin frontend or `/admin` guard. Static hosting behavior depends on `SERVE_STATIC`; route protection must be implemented at the server/static layer as well as client side.
9. The design plan names `plotter.css` and the shared theme, but modality colors on schedule events include `in_person`, `online`, `hybrid`; separate group/team schedule blocks use `onsite` and `online`. Confirm which views are meant to reuse the onsite/online badge styling.
10. The plan requires one commit per phase and tests before each commit. This recon makes no commit. The repository state and available database/test configuration should be checked before future phases; no tests were run because Phase 0 is inspection and documentation only.

## Product clarifications received

- There are no existing admin accounts.
- Production will use Supabase or another PostgreSQL provider.
- No metrics or activity signals exist outside this repository.
- Admin CRUD is for general data and excludes personal and team data.
- Data retention is a priority; establish policy before persisting audit, error, or metrics records.

## Retention policy to prioritize

There is no existing retention policy for admin audit, error, request-metric, or activity data because these records are not currently persisted. Before adding storage, document each record type's purpose, collected fields, retention duration, deletion mechanism, access restrictions, and whether it may contain personal data. Minimize collection at the source: exclude credentials, tokens, request bodies, and unnecessary personal identifiers from logs. Define separate retention behavior for metrics, error diagnostics, and security/audit records rather than applying the proposed 30-day metrics duration to every record type. The required audit/security retention duration is an operational decision that cannot be derived from repository code.

## Remaining unverified assumptions

- Exact production static hosting mode and how `/admin` can be server-protected if static hosting is external.
- Whether the production PostgreSQL provider enables extensions and permissions required by current migrations and future diagnostics.
- Whether production operator/legal requirements accept the implemented 30-day metrics, 14-day error, and 365-day audit retention defaults.
- Which future resource, if any, can pass field-level review for general-data CRUD without exposing personal or team data.

## Implementation follow-up

The bullets above are the Phase 0 snapshot. Product confirmed no external migration ledger exists; this implementation now adds `schema_migrations`, a checksum-checked runner, and `backend/sql/1setup.sql` as a squashed no-demo fresh setup. Admin migrations add `role`, `admin_audit_log`, `error_log`, `request_metrics_rollup`, and `admin_job_runs`.

Generic admin CRUD is disabled because the current database has no general operational resource that does not contain personal or team data. The admin UI/API expose aggregate reporting, health, diagnostics, audit, role access management, maintenance operations, and an audited read-only user configuration inspector. The inspector lists all accounts with UIDs and counts, and can show each account's profile, preferences, owner-only personal schedules, saved schedule context, and entries. Team/group data and authentication secrets are excluded.

Retention defaults are now defined as request metrics 30 days, errors 14 days, and audit 365 days. A daily database-coordinated job prunes records; these durations still need operator/legal review for the production deployment. The repository has no self-hosted Bricolage font asset, so the admin CSS uses the existing family name with a generic sans-serif fallback until that asset is supplied.

Remaining deployment checks: set `ADMIN_ORIGIN` (and `ADMIN_API_ORIGIN` for separate origins), verify provider extension/catalog permissions and TLS settings, configure trusted proxy hops before using `ADMIN_IP_ALLOWLIST`, provide `APP_COMMIT`, and review retention durations/backups. Because existing auth stores bearer tokens in browser `localStorage`, the static `/admin` shell is client-guarded and contains no private data; every admin API request is server-authorized. A hard HTTP 403 for the HTML document itself requires auth information the current browser navigation does not send.
