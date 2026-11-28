const os = require('os');
const { monitorEventLoopDelay, performance } = require('perf_hooks');
const { pool } = require('../config/database');
const env = require('../config/env');
const thresholds = require('../config/healthThresholds');
const emailService = require('../utils/email');

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();
let cpuSample = { at: performance.now(), usage: process.cpuUsage() };

/** Classify a health measurement against configured thresholds. @param {number} value @param {object} limits @returns {string} */
function numericStatus(value, limits) {
  if (value >= limits.down) return 'down';
  if (value >= limits.degraded) return 'degraded';
  return 'ok';
}

function worstStatus(components) {
  const severity = { ok: 0, degraded: 1, down: 2, not_configured: 0 };
  return components.reduce((worst, item) => severity[item.status] > severity[worst] ? item.status : worst, 'ok');
}

function cpuLoadPercent() {
  const now = performance.now();
  const usage = process.cpuUsage();
  const elapsed = Math.max(1, now - cpuSample.at) * 1000;
  const consumed = (usage.user - cpuSample.usage.user) + (usage.system - cpuSample.usage.system);
  cpuSample = { at: now, usage };
  return Number(Math.min(100, (consumed / elapsed) * 100).toFixed(1));
}

async function probeSchedulaMl() {
  const startedAt = performance.now();
  try {
    const url = new URL('/health', env.SCHEDULAML_URL);
    const headers = env.SCHEDULAML_API_KEY ? { 'X-SchedulaML-Key': env.SCHEDULAML_API_KEY } : {};
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(Math.min(env.SCHEDULAML_TIMEOUT_MS, 1000)) });
    const latencyMs = Number((performance.now() - startedAt).toFixed(1));
    if (!response.ok) return { status: 'degraded', latency_ms: latencyMs, detail: `HTTP ${response.status}` };
    const body = await response.json().catch(() => ({}));
    const status = body.status === 'ok' || body.status === 'healthy' || body.model_loaded === true ? 'ok' : 'degraded';
    return { status, latency_ms: latencyMs, detail: body.status || (body.model_loaded ? 'ready' : 'reachable') };
  } catch (error) {
    return { status: 'down', latency_ms: null, detail: error.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
  }
}

async function probeSmtp() {
  if (!env.SMTP.HOST || !env.SMTP.USER || !env.SMTP.PASS) {
    return { status: 'not_configured', detail: 'SMTP is not configured' };
  }
  const startedAt = performance.now();
  try {
    await emailService.verifySmtp(1000);
    return { status: 'ok', latency_ms: Number((performance.now() - startedAt).toFixed(1)) };
  } catch {
    return { status: 'degraded', latency_ms: Number((performance.now() - startedAt).toFixed(1)), detail: 'SMTP verification failed' };
  }
}

/** Collect API, database, and dependency health diagnostics. @returns {Promise<object>} @throws {Error} */
async function getHealth() {
  const memory = process.memoryUsage();
  const loopMean = Number.isFinite(loopDelay.mean) ? loopDelay.mean / 1e6 : 0;
  loopDelay.reset();
  const api = {
    status: worstStatus([
      { status: numericStatus(loopMean, thresholds.eventLoopLagMs) },
      { status: numericStatus((memory.heapUsed / memory.heapTotal) * 100, thresholds.heapUsedPercent) },
      { status: numericStatus(memory.rss / 1024 / 1024, thresholds.memoryRssMb) }
    ]),
    uptime_seconds: Math.floor(process.uptime()),
    node_version: process.version,
    app_version: env.APP_VERSION,
    commit: env.APP_COMMIT,
    environment: process.env.NODE_ENV || 'development',
    memory: { rss_bytes: memory.rss, heap_used_bytes: memory.heapUsed, heap_total_bytes: memory.heapTotal },
    event_loop_lag_ms: Number(loopMean.toFixed(1)),
    cpu_load_percent: cpuLoadPercent(),
    host_load_average: os.loadavg()
  };

  const startedAt = performance.now();
  let database;
  try {
    await pool.query('SELECT 1');
    const latencyMs = Number((performance.now() - startedAt).toFixed(1));
    let status = numericStatus(latencyMs, thresholds.dbLatencyMs);
    if (pool.waitingCount >= thresholds.poolWaiting.down) status = 'down';
    else if (pool.waitingCount >= thresholds.poolWaiting.degraded && status === 'ok') status = 'degraded';
    database = {
      status,
      connectivity: 'ok',
      latency_ms: latencyMs,
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      diagnostics_status: 'ok'
    };
    try {
      const details = await pool.query(`
        SELECT pg_database_size(current_database()) AS database_bytes,
               current_setting('server_version') AS version,
               (SELECT COALESCE(MAX(version), '000') FROM schema_migrations WHERE version ~ '^[0-9]+$') AS migration_version,
               (SELECT COALESCE(SUM(n_live_tup), 0)::bigint FROM pg_stat_user_tables) AS approximate_rows,
               (SELECT COALESCE(SUM(pg_total_relation_size(relid)), 0)::bigint FROM pg_stat_user_tables) AS table_bytes,
               (SELECT COUNT(*)::integer FROM pg_stat_activity
                 WHERE datname = current_database() AND state = 'active' AND pid <> pg_backend_pid()
                   AND query_start < CURRENT_TIMESTAMP - INTERVAL '30 seconds') AS long_queries
      `);
      const row = details.rows[0];
      Object.assign(database, {
        server_version: row.version,
        database_bytes: Number(row.database_bytes),
        table_bytes: Number(row.table_bytes),
        approximate_rows: Number(row.approximate_rows),
        long_running_queries: row.long_queries,
        migration_version: row.migration_version
      });
    } catch {
      database.diagnostics_status = 'degraded';
      database.detail = 'Optional database diagnostics are unavailable for this provider role';
      if (database.status === 'ok') database.status = 'degraded';
    }
  } catch (error) {
    database = {
      status: 'down', connectivity: 'down', latency_ms: null,
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      detail: 'Database unavailable or diagnostic query failed'
    };
  }

  const [schedulaml, smtp] = await Promise.all([probeSchedulaMl(), probeSmtp()]);
  const dependencies = { schedulaml, smtp };
  const overall = worstStatus([api, database, dependencies.schedulaml, dependencies.smtp]);
  return { status: overall, checked_at: new Date().toISOString(), api, database, dependencies };
}

module.exports = { getHealth, numericStatus };
