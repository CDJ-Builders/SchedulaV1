BEGIN;
DROP TABLE IF EXISTS request_metrics_rollup;
DROP TABLE IF EXISTS admin_job_runs;
DROP TABLE IF EXISTS error_log;
DROP TRIGGER IF EXISTS admin_audit_append_only ON admin_audit_log;
DROP FUNCTION IF EXISTS reject_admin_audit_mutation();
DROP TABLE IF EXISTS admin_audit_log;
COMMIT;
