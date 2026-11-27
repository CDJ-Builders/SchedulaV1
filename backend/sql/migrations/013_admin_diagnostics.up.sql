BEGIN;

CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('user', 'developer', 'super_admin', 'system')),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  "before" JSONB,
  "after" JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_admin_audit_created_at ON admin_audit_log (created_at DESC);
CREATE INDEX idx_admin_audit_actor_id ON admin_audit_log (actor_id, created_at DESC);
CREATE INDEX idx_admin_audit_resource ON admin_audit_log (resource, created_at DESC);

CREATE FUNCTION reject_admin_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_audit_prune', TRUE) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'admin_audit_log is append-only';
END;
$$;
CREATE TRIGGER admin_audit_append_only
  BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_mutation();

CREATE TABLE error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  stack TEXT,
  route TEXT NOT NULL,
  request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_error_log_created_at ON error_log (created_at DESC);
CREATE INDEX idx_error_log_route ON error_log (route, created_at DESC);
CREATE INDEX idx_error_log_request_id ON error_log (request_id);

CREATE TABLE request_metrics_rollup (
  route TEXT NOT NULL,
  status_class TEXT NOT NULL CHECK (status_class IN ('1xx', '2xx', '3xx', '4xx', '5xx')),
  count BIGINT NOT NULL CHECK (count >= 0),
  p50_ms DOUBLE PRECISION NOT NULL CHECK (p50_ms >= 0),
  p95_ms DOUBLE PRECISION NOT NULL CHECK (p95_ms >= 0),
  p99_ms DOUBLE PRECISION NOT NULL CHECK (p99_ms >= 0),
  bucket_start TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (route, status_class, bucket_start)
);
CREATE INDEX idx_request_metrics_bucket ON request_metrics_rollup (bucket_start DESC);

CREATE TABLE admin_job_runs (
  job_name TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ NOT NULL
);

COMMIT;
