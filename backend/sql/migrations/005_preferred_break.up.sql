BEGIN;

ALTER TABLE preferences
  ADD COLUMN preferred_break_minutes INTEGER NOT NULL DEFAULT 60,
  ADD CONSTRAINT preferences_preferred_break_minutes_check
    CHECK (preferred_break_minutes BETWEEN 0 AND 1440);

COMMIT;
