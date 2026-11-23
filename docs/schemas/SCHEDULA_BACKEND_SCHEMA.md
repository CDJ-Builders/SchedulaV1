# Schedula Backend Schema

The backend uses PostgreSQL with generic scheduling entities. Apply the executable migrations in `backend/sql/migrations/` using the instructions in [DB_UPDATE_INSTRUCTIONS.md](../docs/DB_UPDATE_INSTRUCTIONS.md).

## Runtime Tables

- `users`: UUID identity, case-insensitive email, PostgreSQL `crypt()` password hash, platform role, audit timestamps, soft delete.
- `profiles`: display name, timezone, locale, avatar URL, and working-hours JSONB per user.
- `preferences`: preferred time/day features, buffer minutes, modality preference, default view, notification settings, time-of-day features, and conflict tolerance.
- `schedules`: user-owned calendar containers with nullable `group_id`, timezone, and color.
- `events`: schedule blocks with required `title`, UTC `start_at`, UTC `end_at`, timezone, owner, generated `event_window`, and nullable generic metadata.
- `schedule_context`: JSONB goals, constraints, and tags per schedule.
- `recurrence_rules`: RFC 5545 RRULE definitions per recurring event.
- `recurrence_exceptions`: cancelled or overridden recurrence instances.
- `availability_blocks`: user-level UTC free/busy windows with a generated range.
- `event_participants`: user participation and response status for events.
- `groups`: future team containers.
- `memberships`: group membership with `owner`, `admin`, `member`, or `viewer` roles.
- `schedule_shares`: direct user/group schedule access with `read`, `write`, or `share` permission.
- `consolidated_views`: saved merged-view configuration across schedules or members.
- `invitations`: expiring, hashed-token group invitations.
- `refresh_tokens`: hashed refresh tokens with expiry and revocation state.
- `password_reset_tokens`: hashed reset tokens with expiry and usage state.

## Invariants

- Every table has a UUID primary key and `created_at`, `updated_at`, and nullable `deleted_at`.
- Timestamps are `timestamptz` values representing UTC. Timezone is stored separately for display and recurrence expansion.
- Every schedule has `owner_user_id`; `group_id` is nullable so single-user schedules can become team schedules without restructuring.
- Optional event fields are nullable: description, location, modality, category, color, priority, status, recurrence rule, reminder offset, notes, and participants.
- `events.event_window` and `availability_blocks.availability_window` use half-open `tstzrange` values and GiST indexes for overlap queries.
- Soft-deleted rows are excluded from application queries and partial indexes.
- Authorization is currently enforced in Express services using ownership, membership, share, and platform-role checks. PostgreSQL RLS remains a future hardening option.

## API Ownership

- `backend/routes/auth.js`: authentication and token lifecycle.
- `backend/routes/user.js`: session, profile, preferences, and availability.
- `backend/routes/schedules.js`: schedules, events, and conflict lookup.
- `backend/routes/admin.js`: generic user and schedule administration.
- `backend/middleware/auth.js`: JWT verification and platform-admin authorization.
- `backend/services/`: parameterized SQL and business rules; routes remain thin.

Legacy course, program, term, professor, room, and course-slot resources are intentionally absent.
