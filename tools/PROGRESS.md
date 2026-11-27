# Schedula Super Admin Implementation Progress

This file tracks the current admin implementation. Unrelated pre-existing working-tree edits are preserved and must not be included in admin commits.

## Decisions

- Authentication reuses the current JWT access token and database-backed refresh-token session. Roles are read from PostgreSQL on every admin request.
- Migration 012 sets all existing legacy accounts to `user`; elevation is explicit through `admin:create`. No existing admin account is assumed.
- New databases start from `backend/sql/1setup.sql`, a generated squashed schema with a migration ledger and no demo rows. Existing current databases are signature-checked and recorded as migrations 001–011 before incremental migrations run.
- Generic CRUD stays disabled. The schema has no safe general operational record: user/profile/preferences are personal, groups/team records are team data, and schedules/events may contain personal details. Admin views are aggregate, operational, audit, and health only. Super admins can perform narrowly scoped role-access changes and maintenance actions.
- No external metrics or activity signals exist. DAU/WAU/MAU, detected conflict totals, and recommendation fallbacks remain unavailable; request metrics begin at deployment and cannot be backfilled.
- Retention defaults: metrics 30 days, errors 14 days, audit 365 days. They are configurable and daily-pruned with a coordinated job; production operator/legal review is still required.
- Production is expected to use Supabase or another PostgreSQL provider. Optional diagnostics degrade when provider permissions are limited; DB TLS is configurable.
- Existing auth keeps bearer tokens in `localStorage`. `/admin` uses a client guard; all data/actions remain server-guarded. The static shell contains no private data. A true HTTP 403 for the HTML document would require a credential on navigation, which the current auth design does not provide.
- No self-hosted Bricolage font file exists in the repository; admin styles use the existing family name and generic sans-serif fallback pending the asset.
- Only new runtime dependency: Helmet, requested by the security plan. Charts use native canvas and add no dependency.

## Checklist

### Phase 0 — Recon and decisions
- [x] Inspect schema, auth, routes/services, frontend design conventions.
- [x] Write `docs/admin/RECON.md` and capture product clarifications.

### Phase 1 — Fresh setup, ledger, roles and access control
- [x] Add generated one-file fresh setup and schema migration ledger.
- [x] Add checksum-tracked migration runner and verified legacy-schema adoption.
- [x] Add role migration, DB-backed `requireRole`, password step-up, first-super-admin CLI, self/last-super-admin protections.
- [x] Remove legacy personal user CRUD from `/api/admin`; retain a limited super-admin role action.
- [x] Add Supabase/PostgreSQL TLS configuration and setup/reset scripts.

### Phase 2 — Audit log and retention
- [x] Add append-only audit table, secret redaction, transaction-bound role/maintenance audit writes, filters and pagination.
- [x] Define configurable retention (30/14/365 days) and coordinated daily pruning; audit the pruning run.
- [x] Add error and request-rollup storage without request bodies or user IDs.

### Phase 3 — Privacy-scoped admin API
- [x] Keep generic resource registry/CRUD empty because no resource passes the general-data privacy boundary.
- [x] Add aggregate health/statistics/diagnostic APIs and narrow role/maintenance actions.
- [x] Cap pagination/filter parameters and prevent secret fields from entering admin responses.

### Phase 4 — Health and diagnostics
- [x] Add request IDs, normalized request metrics, periodic rollup flush, 5xx persistence, provider-tolerant health checks, errors/metrics endpoints, and audited maintenance operations.

### Phase 5 — Dashboard statistics
- [x] Add SQL-aggregated overview, timeseries, breakdowns, 30-second cache, and recommendation request counts/success/latency.
- [x] Represent missing activity/conflict/fallback history as unavailable; no backfill is invented.

### Phase 6 — Frontend
- [x] Add `/admin` dashboard, health, audit, error views, filters/pagination, role/maintenance controls, and 30-second polling paused in hidden tabs.
- [x] Reuse shared `.key`, `.card`, `.well`, palette, `drop` animation, and responsive breakpoints.
- [ ] Manually verify with authenticated user/developer/super-admin sessions at 380px and desktop widths.
- [ ] Supply/self-host the existing Bricolage Grotesque font asset before claiming exact typography compliance.

### Phase 7 — Security hardening
- [x] Add Helmet headers and admin-page CSP, admin origin/IP checks, rate limits, cache controls, request parameter caps, denied-role/step-up auditing.
- [x] Keep bearer-token auth; cookie CSRF controls are not applicable.
- [ ] Configure production `ADMIN_ORIGIN`, `ADMIN_API_ORIGIN` when needed, proxy trust, IP allowlist, `APP_COMMIT`, and PostgreSQL TLS.

### Phase 8 — Tests and seed
- [x] Add focused unit tests for access checks, step-up, redaction, route normalization, health thresholds, and stats range parsing.
- [x] Add privacy-safe aggregate-only `seed:admin` and `test:admin` scripts.
- [ ] Add/run database-backed integration tests once a dedicated test database target is available.
- [ ] Resolve the existing unrelated Plotter model test mismatch; full `npm test` currently has one failure.

### Phase 9 — Documentation and delivery
- [x] Document fresh setup, adoption, migrations, roles, API, privacy scope, and retention.
- [x] Final verification and record final commands/open deployment checks here.
- [x] Commit the implementation in three reviewable commits while leaving unrelated working-tree changes unstaged.

## Verification log

- Focused admin unit tests: 10/10 pass on final implementation.
- Full backend suite: 39/40 pass; existing `plotterModel.test.js` expects an older style shape and fails because current `resolveBlockStyle()` includes `fontFamily`, `fontGradient`, and `gradient`. Admin tests pass. No unrelated Plotter code/test was changed.
- `db:build-setup` regenerated the squashed setup after the latest diagnostics schema changes; `admin_job_runs` and baseline ledger entries are present.
- `graphify update .` completed from the repository root.
- `git diff --check` completed without whitespace errors (Git only reported expected LF-to-CRLF normalization notices).
- Backend JavaScript syntax checks and frontend module syntax checks passed during implementation.
- Database-backed migrations, access integration, and visual authenticated browser checks have not been run; no test database or admin login session was provided, and this task does not apply migrations to a live database.
- Admin implementation commits: `df36248` (schema ledger and roles), `d6b2f32` (diagnostics, audit, retention), and `0a159bb` (dashboard and docs). Unrelated profile/team edits remain unstaged.
