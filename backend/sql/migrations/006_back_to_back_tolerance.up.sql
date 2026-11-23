BEGIN;

ALTER TABLE preferences
  DROP CONSTRAINT IF EXISTS preferences_max_back_to_back_check,
  ADD CONSTRAINT preferences_max_back_to_back_check
    CHECK (max_back_to_back BETWEEN 0 AND 6);

COMMIT;
