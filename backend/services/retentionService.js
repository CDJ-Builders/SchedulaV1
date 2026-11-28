const { pool } = require('../config/database');
const retention = require('../config/adminRetention');
const auditService = require('./auditService');

async function pruneExpired() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query("SELECT pg_try_advisory_xact_lock(hashtext('schedula-admin-retention')) AS acquired");
    if (!lock.rows[0].acquired) {
      await client.query('ROLLBACK');
      return null;
    }
    const claim = await client.query(`INSERT INTO admin_job_runs (job_name, last_run_at)
      VALUES ('diagnostics_retention', CURRENT_TIMESTAMP)
      ON CONFLICT (job_name) DO UPDATE SET last_run_at = CURRENT_TIMESTAMP
      WHERE admin_job_runs.last_run_at < CURRENT_TIMESTAMP - INTERVAL '23 hours'
      RETURNING job_name`);
    if (!claim.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query("SET LOCAL app.allow_audit_prune = 'on'");
    const metrics = await client.query("DELETE FROM request_metrics_rollup WHERE bucket_start < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')", [retention.metricsDays]);
    const errors = await client.query("DELETE FROM error_log WHERE created_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')", [retention.errorsDays]);
    const audit = await client.query("DELETE FROM admin_audit_log WHERE created_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')", [retention.auditDays]);
    const deleted = { metrics: metrics.rowCount, errors: errors.rowCount, audit: audit.rowCount };
    await auditService.record(client, null, {
      action: 'retention.prune', resource: 'admin_diagnostics', after: deleted
    });
    await client.query('COMMIT');
    return deleted;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function startRetentionJob() {
  const timer = setInterval(() => {
    pruneExpired().catch(error => console.error('Retention job failed:', error.message));
  }, 24 * 60 * 60 * 1000);
  timer.unref();
  setTimeout(() => pruneExpired().catch(error => console.error('Initial retention run failed:', error.message)), 60000).unref();
  return timer;
}

module.exports = { startRetentionJob };
