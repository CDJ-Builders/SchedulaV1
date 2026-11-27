BEGIN;

ALTER TABLE users
  ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'developer', 'super_admin'));

-- Do not carry legacy 'admin' values forward; elevation is granted only through bootstrap.
UPDATE users SET role = 'user';

ALTER TABLE users DROP COLUMN platform_role;

COMMIT;
