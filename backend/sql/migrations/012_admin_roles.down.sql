BEGIN;

ALTER TABLE users
  ADD COLUMN platform_role TEXT NOT NULL DEFAULT 'user'
  CHECK (platform_role IN ('user', 'admin'));

UPDATE users SET platform_role = 'user';
ALTER TABLE users DROP COLUMN role;

COMMIT;
