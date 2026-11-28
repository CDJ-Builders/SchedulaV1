CREATE TABLE IF NOT EXISTS pending_signups (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_signups_expiry ON pending_signups (expires_at);
