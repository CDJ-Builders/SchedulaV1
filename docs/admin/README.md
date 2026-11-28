# Admin Operations

## Setup

1. Apply the current schema using `backend/sql/1setup.sql` for a new database, or run `npm run db:migrate` for an existing current Schedula database.
2. Set the connection variables described in [database setup](../plans/DB_UPDATE_INSTRUCTIONS.md). Configure `DB_SSL=true` for hosted PostgreSQL when required.
3. Run `npm run db:migrate` as a deployment step before starting the updated API. The API does not mutate schema at startup.
4. Create the initial super admin: `npm run admin:create -- admin@example.com`. Enter a password at the prompt, or set `ADMIN_BOOTSTRAP_PASSWORD` for unattended setup. The CLI refuses passwords shorter than 12 characters and refuses to create another account once a super admin exists.
5. Sign in through the existing Schedula login flow and open `/admin`.

No elevated-role signup path exists. Public signup always creates a `user`. Admin API authorization reads the role from PostgreSQL on every request; token role claims are not used.


Migration 012 does not carry forward legacy `platform_role='admin'` values. It assigns every existing account `user`; the first elevated account must be created deliberately through the bootstrap CLI.

The current bearer token is held in browser `localStorage`, so a top-level `/admin` navigation cannot send that token for a server-side HTML authorization check. The page performs a client access check and displays no admin controls/data until `/api/admin/meta` succeeds. All admin data and actions are server-guarded on every request. The HTML shell itself contains no private records.

## Role matrix

| Role | Admin dashboard, health, diagnostics, audit | Change account roles | Maintenance / retention actions |
| --- | --- | --- | --- |
| `user` | No | No | No |
| `developer` | Read | No | No |
| `super_admin` | Read | Yes, with password re-entry | Yes, with password re-entry |

Both elevated roles can use the audited, read-only Users inspector to see account UIDs and configured profile, preference, personal schedule, and schedule-entry data. It never returns password hashes or session/reset tokens. Team/group data remains outside the inspector.

Role changes cannot demote the acting super admin or demote the last active super admin. The role endpoint exposes only a role value for a known user ID; user data inspection is read-only.

## Admin data scope

The current schema has no privacy-safe general-purpose CRUD resource. Generic CRUD remains disabled. The Users inspector is a separate, read-only, audited feature requested for account support; it shows account/profile/preferences and owner-only schedules/events. Groups, memberships, invitations, proposals, and shared records remain excluded. Any additional mutation capability needs a field-level privacy review and explicit allowlist first.

## Data retention

The implementation defaults are:

- Request metrics: 30 days (`ADMIN_METRICS_RETENTION_DAYS`).
- Error diagnostics: 14 days (`ADMIN_ERROR_RETENTION_DAYS`).
- Admin audit: 365 days (`ADMIN_AUDIT_RETENTION_DAYS`).

Values may be set from 1 to 3650 days. A daily retention job prunes records and writes a system audit event. Super admins can run pruning on demand after password re-entry. Audit records reject update/delete; a transaction-local database setting permits deletion only through the retention transaction. Logs omit request bodies and user IDs; messages redact emails and credential patterns. Audit before/after payloads recursively omit password, token, secret, authorization, cookie, hash, credential, and API-key fields.

These are implementation defaults based on the project direction and must be reviewed against production operator/legal retention requirements before launch. Keep backup and provider-level retention consistent with this policy.

## Environment variables

- `ADMIN_ORIGIN`: comma-separated browser origin allowlist for admin page/API. If empty, same-origin requests and local `localhost:3000` / `127.0.0.1:3000` are accepted only outside production.
- `ADMIN_API_ORIGIN`: API origin allowed by the `/admin` Content Security Policy when the frontend and API are hosted on separate origins.
- `ADMIN_IP_ALLOWLIST`: optional comma-separated exact client IP addresses. For reverse proxies, configure `TRUST_PROXY` to the known proxy hop count or trusted proxy value; do not trust arbitrary forwarded headers.
- `ADMIN_AUDIT_RETENTION_DAYS`, `ADMIN_ERROR_RETENTION_DAYS`, `ADMIN_METRICS_RETENTION_DAYS`: retention durations.
- `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`: hosted database TLS controls.
- `APP_VERSION`, `APP_COMMIT`: values shown by health diagnostics.
- Existing `SCHEDULAML_URL`, `SCHEDULAML_API_KEY`, and SMTP environment variables are used only for reachability checks; secrets are never returned.

## Adding admin functionality

There is intentionally no generic resource registry until a privacy-safe general resource is identified. Do not add users, personal schedules/events, or team tables to admin CRUD. Aggregate queries must whitelist SQL expressions and keep values parameterized. New sensitive actions must use `requireStepUp`, execute in a transaction, write one audit record in that transaction, and enforce the last-super-admin invariant where applicable.

## Metrics limitations

Request rollups start when the new backend is deployed; there is no external or prior repository history to backfill. Detected conflict counts and recommendation fallbacks are reported as unavailable because the repository does not persist those outcomes. The admin demo seed creates only anonymous route/status rollups.

The dashboard's overall p95 field is the worst per-minute p95 value in the selected range, since the retained per-minute percentile summaries cannot be mathematically merged into an exact range-wide percentile. Recommendation success rate uses HTTP 2xx vs total recorded recommendation route requests; fallback count remains unavailable.
