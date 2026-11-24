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
