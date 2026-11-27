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
