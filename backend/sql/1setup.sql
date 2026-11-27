-- Schedula squashed fresh-database schema. Apply this single file to a new, empty PostgreSQL database.

-- It incorporates schema changes through the latest migration and excludes demo seed data.

-- Regenerate with `npm run db:build-setup` after adding a schema migration.

BEGIN;

-- Schema changes from 001_schedula_schema.up.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  platform_role TEXT NOT NULL DEFAULT 'user' CHECK (platform_role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  locale TEXT NOT NULL DEFAULT 'en-US',
  avatar_url TEXT,
  working_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  pref_time_0708 BOOLEAN NOT NULL DEFAULT FALSE,
  pref_time_0810 BOOLEAN NOT NULL DEFAULT FALSE,
  pref_time_1012 BOOLEAN NOT NULL DEFAULT FALSE,
  pref_time_1214 BOOLEAN NOT NULL DEFAULT FALSE,
  pref_time_1416 BOOLEAN NOT NULL DEFAULT FALSE,
  pref_time_1618 BOOLEAN NOT NULL DEFAULT FALSE,
  pref_time_1820 BOOLEAN NOT NULL DEFAULT FALSE,
  pref_time_2022 BOOLEAN NOT NULL DEFAULT FALSE,
  pref_time_2224 BOOLEAN NOT NULL DEFAULT FALSE,
  "PrefMon" BOOLEAN NOT NULL DEFAULT FALSE,
  "PrefTue" BOOLEAN NOT NULL DEFAULT FALSE,
  "PrefWed" BOOLEAN NOT NULL DEFAULT FALSE,
  "PrefThurs" BOOLEAN NOT NULL DEFAULT FALSE,
  "PrefFri" BOOLEAN NOT NULL DEFAULT FALSE,
  "PrefSat" BOOLEAN NOT NULL DEFAULT FALSE,
  avoid_time_0708 BOOLEAN NOT NULL DEFAULT FALSE,
  avoid_time_0810 BOOLEAN NOT NULL DEFAULT FALSE,
  avoid_time_1012 BOOLEAN NOT NULL DEFAULT FALSE,
  avoid_time_1214 BOOLEAN NOT NULL DEFAULT FALSE,
  avoid_time_1416 BOOLEAN NOT NULL DEFAULT FALSE,
  avoid_time_1618 BOOLEAN NOT NULL DEFAULT FALSE,
  avoid_time_1820 BOOLEAN NOT NULL DEFAULT FALSE,
  avoid_time_2022 BOOLEAN NOT NULL DEFAULT FALSE,
  avoid_time_2224 BOOLEAN NOT NULL DEFAULT FALSE,
  "AvoidMon" BOOLEAN NOT NULL DEFAULT FALSE,
  "AvoidTue" BOOLEAN NOT NULL DEFAULT FALSE,
  "AvoidWed" BOOLEAN NOT NULL DEFAULT FALSE,
  "AvoidThurs" BOOLEAN NOT NULL DEFAULT FALSE,
  "AvoidFri" BOOLEAN NOT NULL DEFAULT FALSE,
  "AvoidSat" BOOLEAN NOT NULL DEFAULT FALSE,
  max_back_to_back INTEGER NOT NULL DEFAULT 0 CHECK (max_back_to_back >= 0),
  commute_time INTEGER NOT NULL DEFAULT 0 CHECK (commute_time >= 0),
  preferred_modality TEXT NOT NULL DEFAULT 'no preference'
    CHECK (preferred_modality IN ('onsite', 'online', 'no preference'))
);

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id),
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS schedule_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL UNIQUE REFERENCES schedules(id) ON DELETE CASCADE,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL CHECK (end_at > start_at),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  description TEXT,
  location TEXT,
  modality TEXT CHECK (modality IS NULL OR modality IN ('in_person', 'online', 'hybrid')),
  category TEXT,
  color TEXT,
  priority INTEGER,
  status TEXT,
  recurrence_rule TEXT,
  reminder_offset_minutes INTEGER CHECK (reminder_offset_minutes IS NULL OR reminder_offset_minutes >= 0),
  notes TEXT,
  event_window TSTZRANGE GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS schedule_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  shared_with_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  shared_with_group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write', 'share')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CHECK ((shared_with_user_id IS NULL) <> (shared_with_group_id IS NULL)),
  UNIQUE (schedule_id, shared_with_user_id, shared_with_group_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  invited_by_user_id UUID NOT NULL REFERENCES users(id),
  email CITEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_active ON users (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_active_user ON profiles (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_groups_active_owner ON groups (owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_memberships_active_group ON memberships (group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_memberships_active_user ON memberships (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_active_owner_updated ON schedules (owner_user_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_active_group ON schedules (group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_active_schedule_start ON events (schedule_id, start_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_active_owner_start ON events (owner_user_id, start_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_window_gist ON events USING GIST (event_window) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shares_active_schedule ON schedule_shares (schedule_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_active_group ON invitations (group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active_user ON refresh_tokens (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_active_user ON password_reset_tokens (user_id) WHERE deleted_at IS NULL;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'profiles', 'preferences', 'groups', 'schedules', 'schedule_context',
    'events', 'memberships', 'schedule_shares',
    'invitations', 'refresh_tokens', 'password_reset_tokens'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name, table_name);
  END LOOP;
END
$$;

-- Schema changes from 003_preferences_rebuild.up.sql
DROP TABLE IF EXISTS preferences_backup;
CREATE TABLE preferences_backup AS
TABLE preferences
WITH NO DATA;

INSERT INTO preferences_backup
SELECT * FROM preferences;

ALTER TABLE preferences DROP COLUMN IF EXISTS preferred_time_start;
ALTER TABLE preferences DROP COLUMN IF EXISTS preferred_time_end;
ALTER TABLE preferences DROP COLUMN IF EXISTS preferred_days;
ALTER TABLE preferences DROP COLUMN IF EXISTS buffer_minutes;
ALTER TABLE preferences DROP COLUMN IF EXISTS modality_preference;
ALTER TABLE preferences DROP COLUMN IF EXISTS default_view;
ALTER TABLE preferences DROP COLUMN IF EXISTS notification_settings;
ALTER TABLE preferences DROP COLUMN IF EXISTS time_of_day_preferences;
ALTER TABLE preferences DROP COLUMN IF EXISTS conflict_tolerance;
ALTER TABLE preferences DROP COLUMN IF EXISTS created_at;
ALTER TABLE preferences DROP COLUMN IF EXISTS updated_at;
ALTER TABLE preferences DROP COLUMN IF EXISTS deleted_at;

ALTER TABLE preferences ADD COLUMN IF NOT EXISTS pref_time_0708 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS pref_time_0810 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS pref_time_1012 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS pref_time_1214 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS pref_time_1416 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS pref_time_1618 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS pref_time_1820 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS pref_time_2022 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS pref_time_2224 BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "PrefMon" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "PrefTue" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "PrefWed" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "PrefThurs" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "PrefFri" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "PrefSat" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE preferences ADD COLUMN IF NOT EXISTS avoid_time_0708 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS avoid_time_0810 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS avoid_time_1012 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS avoid_time_1214 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS avoid_time_1416 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS avoid_time_1618 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS avoid_time_1820 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS avoid_time_2022 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS avoid_time_2224 BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "AvoidMon" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "AvoidTue" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "AvoidWed" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "AvoidThurs" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "AvoidFri" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "AvoidSat" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE preferences ADD COLUMN IF NOT EXISTS max_back_to_back INTEGER NOT NULL DEFAULT 0
  CONSTRAINT preferences_max_back_to_back_check CHECK (max_back_to_back >= 0);
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS commute_time INTEGER NOT NULL DEFAULT 0
  CONSTRAINT preferences_commute_time_check CHECK (commute_time >= 0);
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS preferred_modality TEXT NOT NULL DEFAULT 'no preference'
  CONSTRAINT preferences_preferred_modality_check CHECK (preferred_modality IN ('onsite', 'online', 'no preference'));

DROP TRIGGER IF EXISTS preferences_updated_at ON preferences;
CREATE UNIQUE INDEX IF NOT EXISTS preferences_user_id_unique ON preferences(user_id);

-- Schema changes from 004_account_deletion_cascade.up.sql
ALTER TABLE groups
  DROP CONSTRAINT IF EXISTS groups_owner_user_id_fkey,
  ADD CONSTRAINT groups_owner_user_id_fkey
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE schedules
  DROP CONSTRAINT IF EXISTS schedules_owner_user_id_fkey,
  ADD CONSTRAINT schedules_owner_user_id_fkey
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_owner_user_id_fkey,
  ADD CONSTRAINT events_owner_user_id_fkey
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE invitations
  DROP CONSTRAINT IF EXISTS invitations_invited_by_user_id_fkey,
  ADD CONSTRAINT invitations_invited_by_user_id_fkey
    FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Schema changes from 005_preferred_break.up.sql
ALTER TABLE preferences
  ADD COLUMN preferred_break_minutes INTEGER NOT NULL DEFAULT 60,
  ADD CONSTRAINT preferences_preferred_break_minutes_check
    CHECK (preferred_break_minutes BETWEEN 0 AND 1440);

-- Schema changes from 006_back_to_back_tolerance.up.sql
ALTER TABLE preferences
  DROP CONSTRAINT IF EXISTS preferences_max_back_to_back_check,
  ADD CONSTRAINT preferences_max_back_to_back_check
    CHECK (max_back_to_back BETWEEN 0 AND 6);

-- Schema changes from 007_teams_features.up.sql
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS group_code TEXT;

DO $$
DECLARE
  team_row RECORD;
  candidate TEXT;
BEGIN
  FOR team_row IN SELECT id FROM groups WHERE group_code IS NULL LOOP
    LOOP
      candidate := 'SCH-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 4));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM groups WHERE group_code = candidate);
    END LOOP;
    UPDATE groups SET group_code = candidate WHERE id = team_row.id;
  END LOOP;
END;
$$;

ALTER TABLE groups
  ALTER COLUMN group_code SET NOT NULL;

ALTER TABLE groups
  DROP CONSTRAINT IF EXISTS groups_group_code_format_check,
  ADD CONSTRAINT groups_group_code_format_check
    CHECK (group_code ~ '^SCH-[A-F0-9]{4}$');

CREATE UNIQUE INDEX IF NOT EXISTS groups_group_code_unique
  ON groups (group_code);

CREATE TABLE IF NOT EXISTS team_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  weekday TEXT NOT NULL CHECK (weekday IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL CHECK (end_time > start_time),
  modality TEXT NOT NULL CHECK (modality IN ('onsite','online')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_events_group_weekday_time
  ON team_events (group_id, weekday, start_time);

CREATE TABLE IF NOT EXISTS team_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  proposed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  converted_event_id UUID REFERENCES team_events(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  weekday TEXT NOT NULL CHECK (weekday IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL CHECK (end_time > start_time),
  modality TEXT NOT NULL CHECK (modality IN ('onsite','online')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','declined','confirmed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_proposals_group_status_created
  ON team_proposals (group_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS proposal_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES team_proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('accept','decline')),
  responded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (proposal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_proposal_responses_user
  ON proposal_responses (user_id, proposal_id);

DROP TRIGGER IF EXISTS team_events_updated_at ON team_events;
CREATE TRIGGER team_events_updated_at BEFORE UPDATE ON team_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS team_proposals_updated_at ON team_proposals;
CREATE TRIGGER team_proposals_updated_at BEFORE UPDATE ON team_proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Schema changes from 009_team_proposal_description.up.sql
ALTER TABLE team_proposals
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Schema changes from 010_session_idle_timeout.up.sql
ALTER TABLE refresh_tokens
  ADD COLUMN session_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX idx_refresh_tokens_session_id ON refresh_tokens (session_id);

-- Schema changes from 011_remove_unused_calendar_tables.up.sql
DROP TABLE IF EXISTS recurrence_exceptions CASCADE;
DROP TABLE IF EXISTS recurrence_rules CASCADE;
DROP TABLE IF EXISTS event_participants CASCADE;
DROP TABLE IF EXISTS consolidated_views CASCADE;
DROP TABLE IF EXISTS availability_blocks CASCADE;

-- Schema changes from 012_admin_roles.up.sql
ALTER TABLE users
  ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'developer', 'super_admin'));

-- Do not carry legacy 'admin' values forward; elevation is granted only through bootstrap.
UPDATE users SET role = 'user';

ALTER TABLE users DROP COLUMN platform_role;

-- Schema changes from 013_admin_diagnostics.up.sql
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('user', 'developer', 'super_admin', 'system')),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  "before" JSONB,
  "after" JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_admin_audit_created_at ON admin_audit_log (created_at DESC);
CREATE INDEX idx_admin_audit_actor_id ON admin_audit_log (actor_id, created_at DESC);
CREATE INDEX idx_admin_audit_resource ON admin_audit_log (resource, created_at DESC);

CREATE FUNCTION reject_admin_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_audit_prune', TRUE) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'admin_audit_log is append-only';
END;
$$;
CREATE TRIGGER admin_audit_append_only
  BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_mutation();

CREATE TABLE error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  stack TEXT,
  route TEXT NOT NULL,
  request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_error_log_created_at ON error_log (created_at DESC);
CREATE INDEX idx_error_log_route ON error_log (route, created_at DESC);
CREATE INDEX idx_error_log_request_id ON error_log (request_id);

CREATE TABLE request_metrics_rollup (
  route TEXT NOT NULL,
  status_class TEXT NOT NULL CHECK (status_class IN ('1xx', '2xx', '3xx', '4xx', '5xx')),
  count BIGINT NOT NULL CHECK (count >= 0),
  p50_ms DOUBLE PRECISION NOT NULL CHECK (p50_ms >= 0),
  p95_ms DOUBLE PRECISION NOT NULL CHECK (p95_ms >= 0),
  p99_ms DOUBLE PRECISION NOT NULL CHECK (p99_ms >= 0),
  bucket_start TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (route, status_class, bucket_start)
);
CREATE INDEX idx_request_metrics_bucket ON request_metrics_rollup (bucket_start DESC);

CREATE TABLE admin_job_runs (
  job_name TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ NOT NULL
);

-- The preference backup in migration 003 is upgrade-only; it is not part of the final schema.
DROP TABLE IF EXISTS preferences_backup;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

INSERT INTO schema_migrations (version, name, checksum) VALUES ('001', '001_schedula_schema.up.sql', NULL) ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, name, checksum) VALUES ('002', '002_demo_seed.up.sql', NULL) ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, name, checksum) VALUES ('003', '003_preferences_rebuild.up.sql', NULL) ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, name, checksum) VALUES ('004', '004_account_deletion_cascade.up.sql', NULL) ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, name, checksum) VALUES ('005', '005_preferred_break.up.sql', NULL) ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, name, checksum) VALUES ('006', '006_back_to_back_tolerance.up.sql', NULL) ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, name, checksum) VALUES ('007', '007_teams_features.up.sql', NULL) ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, name, checksum) VALUES ('008', '008_teams_demo_seed.up.sql', NULL) ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, name, checksum) VALUES ('009', '009_team_proposal_description.up.sql', NULL) ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, name, checksum) VALUES ('010', '010_session_idle_timeout.up.sql', NULL) ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, name, checksum) VALUES ('011', '011_remove_unused_calendar_tables.up.sql', NULL) ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, name, checksum) VALUES ('012', '012_admin_roles.up.sql', NULL) ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, name, checksum) VALUES ('013', '013_admin_diagnostics.up.sql', NULL) ON CONFLICT (version) DO NOTHING;

COMMIT;
