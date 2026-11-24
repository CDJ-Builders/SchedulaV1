BEGIN;

DROP INDEX IF EXISTS idx_refresh_tokens_session_id;
ALTER TABLE refresh_tokens
  DROP COLUMN IF EXISTS last_activity_at,
  DROP COLUMN IF EXISTS session_id;

COMMIT;
