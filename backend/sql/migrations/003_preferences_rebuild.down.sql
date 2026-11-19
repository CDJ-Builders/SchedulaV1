BEGIN;

DROP TABLE IF EXISTS preferences;
ALTER TABLE preferences_backup RENAME TO preferences;

COMMIT;
