BEGIN;

ALTER TABLE refresh_tokens
  ADD COLUMN session_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX idx_refresh_tokens_session_id ON refresh_tokens (session_id);

COMMIT;
