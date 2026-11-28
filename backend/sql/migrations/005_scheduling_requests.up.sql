BEGIN;

CREATE TABLE scheduling_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('meeting_request', 'smart_schedule_request')),
  title TEXT NOT NULL,
  source_text TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  window_start DATE,
  window_end DATE,
  preferred_date DATE,
  preferred_start_time TIME,
  time_of_day TEXT CHECK (time_of_day IS NULL OR time_of_day IN ('morning', 'afternoon', 'evening')),
  weekdays TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CHECK ((window_start IS NULL) = (window_end IS NULL)),
  CHECK (window_start IS NULL OR window_end >= window_start),
  CHECK (preferred_date IS NULL OR window_start IS NULL)
);

CREATE INDEX scheduling_requests_owner_created_idx
  ON scheduling_requests (owner_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

COMMIT;
