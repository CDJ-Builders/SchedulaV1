BEGIN;

DROP TABLE IF EXISTS recurrence_exceptions CASCADE;
DROP TABLE IF EXISTS recurrence_rules CASCADE;
DROP TABLE IF EXISTS event_participants CASCADE;
DROP TABLE IF EXISTS consolidated_views CASCADE;
DROP TABLE IF EXISTS availability_blocks CASCADE;

COMMIT;
