BEGIN;

ALTER TABLE groups
  DROP CONSTRAINT IF EXISTS groups_owner_user_id_fkey,
  ADD CONSTRAINT groups_owner_user_id_fkey
    FOREIGN KEY (owner_user_id) REFERENCES users(id);

ALTER TABLE schedules
  DROP CONSTRAINT IF EXISTS schedules_owner_user_id_fkey,
  ADD CONSTRAINT schedules_owner_user_id_fkey
    FOREIGN KEY (owner_user_id) REFERENCES users(id);

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_owner_user_id_fkey,
  ADD CONSTRAINT events_owner_user_id_fkey
    FOREIGN KEY (owner_user_id) REFERENCES users(id);

ALTER TABLE invitations
  DROP CONSTRAINT IF EXISTS invitations_invited_by_user_id_fkey,
  ADD CONSTRAINT invitations_invited_by_user_id_fkey
    FOREIGN KEY (invited_by_user_id) REFERENCES users(id);

COMMIT;
