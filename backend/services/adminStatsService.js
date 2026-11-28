const { pool } = require('../config/database');

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const overviewCache = new Map();
const CACHE_MS = 30000;

/** Convert a supported dashboard range to its day count. @param {string} range @returns {number} @throws {Error} */
function rangeDays(range) {
  return RANGE_DAYS[range] || RANGE_DAYS['30d'];
}

/** Load aggregate dashboard metrics for a supported time window. @param {string} [range] @returns {Promise<object>} @throws {Error} */
async function overview(range = '30d') {
  const days = rangeDays(range);
  const cached = overviewCache.get(days);
  if (cached && cached.expires > Date.now()) return cached.value;
  const [userCounts, scheduleCounts, requestStats, smartStats, metricsSince] = await Promise.all([
    pool.query(`SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL)::integer AS total,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day') AND created_at < CURRENT_TIMESTAMP AND deleted_at IS NULL)::integer AS current,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day') AND created_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day') AND deleted_at IS NULL)::integer AS previous
      FROM users`, [days, days * 2]),
    pool.query(`SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL)::integer AS total,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day') AND created_at < CURRENT_TIMESTAMP AND deleted_at IS NULL)::integer AS current,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day') AND created_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day') AND deleted_at IS NULL)::integer AS previous
      FROM schedules`, [days, days * 2]),
    pool.query(`SELECT COALESCE(SUM(count), 0)::bigint AS requests,
      COALESCE(SUM(count) FILTER (WHERE status_class = '5xx'), 0)::bigint AS errors,
      COALESCE(MAX(p95_ms), 0)::numeric AS p95_ms,
      MIN(bucket_start) AS first_bucket
      FROM request_metrics_rollup WHERE bucket_start >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')`, [days]),
    pool.query(`SELECT COALESCE(SUM(count), 0)::bigint AS calls,
      COALESCE(SUM(count) FILTER (WHERE status_class = '2xx'), 0)::bigint AS successes,
      MAX(p50_ms) AS p50_ms, MAX(p95_ms) AS p95_ms
      FROM request_metrics_rollup
      WHERE route LIKE '%/recommendations' AND bucket_start >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')`, [days]),
    pool.query('SELECT MIN(bucket_start) AS first_bucket FROM request_metrics_rollup')
  ]);
  const users = userCounts.rows[0];
  const schedules = scheduleCounts.rows[0];
  const requests = requestStats.rows[0];
  const smart = smartStats.rows[0];
  const requestCount = Number(requests.requests);
  const smartCallCount = Number(smart.calls);
  const value = {
    range: `${days}d`,
    users: { total: users.total, delta: Number(users.current) - Number(users.previous), signups: Number(users.current) },
    schedules: { total: schedules.total, delta: Number(schedules.current) - Number(schedules.previous), created: Number(schedules.current) },
    groups: { value: null, reason: 'Team data is outside the admin reporting scope.' },
    conflicts_detected: { value: null, reason: 'Conflict outcomes are not persisted.' },
    smart_schedule: {
      calls: smartCallCount,
      success_rate: smartCallCount ? Number((Number(smart.successes) / smartCallCount).toFixed(4)) : null,
      p50_latency_ms: smart.p50_ms == null ? null : Number(smart.p50_ms),
      p95_latency_ms: smart.p95_ms == null ? null : Number(smart.p95_ms),
      fallback_count: null,
      reason: 'Request rollups begin after deployment; fallback outcomes are not persisted.'
    },
    request_count: requestCount,
    error_count: Number(requests.errors),
    error_rate: requestCount ? Number((Number(requests.errors) / requestCount).toFixed(4)) : 0,
    p95_latency_ms: Number(requests.p95_ms),
    metrics_available_since: metricsSince.rows[0].first_bucket
  };
  overviewCache.set(days, { value, expires: Date.now() + CACHE_MS });
  return value;
}

/** Return a time series for an allowlisted metric. @param {string} metric @param {string} [range] @param {string} [interval] @returns {Promise<object>} @throws {Error} */
async function timeseries(metric, range = '7d', interval = 'day') {
  if (!RANGE_DAYS[range]) throw Object.assign(new Error('range must be 7d, 30d, or 90d'), { status: 400 });
  if (!['day', 'hour'].includes(interval)) throw Object.assign(new Error('interval must be day or hour'), { status: 400 });
  const days = RANGE_DAYS[range];
  const bucket = interval === 'hour' ? 'hour' : 'day';
  let sourceSql;
  let values = [days, bucket];
  switch (metric) {
    case 'signups':
      sourceSql = `SELECT date_trunc($2, created_at) AS bucket, COUNT(*)::bigint AS value
        FROM users WHERE created_at >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
        GROUP BY 1`;
      break;
    case 'schedules_created':
      sourceSql = `SELECT date_trunc($2, created_at) AS bucket, COUNT(*)::bigint AS value
        FROM schedules WHERE created_at >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
        GROUP BY 1`;
      break;
    case 'requests':
      sourceSql = `SELECT date_trunc($2, bucket_start) AS bucket, SUM(count)::bigint AS value
        FROM request_metrics_rollup WHERE bucket_start >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
        GROUP BY 1`;
      break;
    case 'errors':
      sourceSql = `SELECT date_trunc($2, bucket_start) AS bucket, SUM(count)::bigint AS value
        FROM request_metrics_rollup WHERE status_class = '5xx'
          AND bucket_start >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day') GROUP BY 1`;
      break;
    case 'smart_schedule_calls':
      values.push('%/recommendations');
      sourceSql = `SELECT date_trunc($2, bucket_start) AS bucket, SUM(count)::bigint AS value
        FROM request_metrics_rollup WHERE route LIKE $3
          AND bucket_start >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day') GROUP BY 1`;
      break;
    default:
      throw Object.assign(new Error('Unsupported metric'), { status: 400 });
  }
  const result = await pool.query(
    `WITH buckets AS (
       SELECT generate_series(
         date_trunc($2, CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')),
         date_trunc($2, CURRENT_TIMESTAMP),
         ('1 ' || $2)::interval
       ) AS bucket
     ), values_by_bucket AS (${sourceSql})
     SELECT buckets.bucket, COALESCE(values_by_bucket.value, 0)::bigint AS value
       FROM buckets LEFT JOIN values_by_bucket USING (bucket)
      ORDER BY buckets.bucket`,
    values
  );
  return { metric, range, interval, points: result.rows };
}

/** Return a grouped breakdown for an allowlisted metric. @param {string} metric @returns {Promise<object>} @throws {Error} */
async function breakdown(metric) {
  switch (metric) {
    case 'users_by_role': {
      const result = await pool.query('SELECT role AS label, COUNT(*)::bigint AS value FROM users WHERE deleted_at IS NULL GROUP BY role ORDER BY role');
      return result.rows;
    }
    case 'top_routes':
    case 'top_error_routes': {
      const onlyErrors = metric === 'top_error_routes';
      const result = await pool.query(`SELECT route AS label, SUM(count)::bigint AS value
        FROM request_metrics_rollup
        WHERE bucket_start >= CURRENT_TIMESTAMP - INTERVAL '30 days' ${onlyErrors ? "AND status_class = '5xx'" : ''}
        GROUP BY route ORDER BY value DESC, route LIMIT 10`);
      return result.rows;
    }
    default:
      throw Object.assign(new Error('Unsupported breakdown metric'), { status: 400 });
  }
}

module.exports = { overview, timeseries, breakdown, rangeDays };
