BEGIN;

ALTER TABLE schedule_shares
  DROP COLUMN show_details;

COMMIT;
