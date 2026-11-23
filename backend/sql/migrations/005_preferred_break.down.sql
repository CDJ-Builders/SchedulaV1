BEGIN;

ALTER TABLE preferences
  DROP CONSTRAINT IF EXISTS preferences_preferred_break_minutes_check,
  DROP COLUMN IF EXISTS preferred_break_minutes;

COMMIT;
