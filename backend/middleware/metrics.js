const { performance } = require('perf_hooks');
const { pool } = require('../config/database');

const MAX_WINDOW_SAMPLES = 10000;
const MAX_BUCKET_SAMPLE = 5000;
const windowSamples = [];
const pendingBuckets = new Map();

function normalizeRoute(req) {
  const routePath = req.route?.path;
  const route = routePath ? `${req.baseUrl || ''}${routePath}` : req.path;
  return String(route || '/')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\b\d{2,}\b/g, ':id')
    .slice(0, 256);
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)].toFixed(2));
}

function metrics(req, res, next) {
  const start = performance.now();
  res.on('finish', () => {
    const route = normalizeRoute(req);
    req.adminNormalizedRoute = route;
    const statusCodeClass = Math.floor(res.statusCode / 100);
    const statusClass = statusCodeClass >= 1 && statusCodeClass <= 5 ? `${statusCodeClass}xx` : '5xx';
    const durationMs = Math.max(0, performance.now() - start);
    const bucketDate = new Date();
    bucketDate.setUTCSeconds(0, 0);
    const bucketStart = bucketDate.toISOString();
    const sample = { route, statusClass, durationMs, bucketStart, createdAt: Date.now() };
    windowSamples.push(sample);
    if (windowSamples.length > MAX_WINDOW_SAMPLES) windowSamples.splice(0, windowSamples.length - MAX_WINDOW_SAMPLES);
    const key = `${bucketStart}\u0000${route}\u0000${statusClass}`;
    const bucket = pendingBuckets.get(key) || { count: 0, samples: [] };
    bucket.count += 1;
    if (bucket.samples.length < MAX_BUCKET_SAMPLE) bucket.samples.push(durationMs);
    else {
      const replacement = Math.floor(Math.random() * bucket.count);
      if (replacement < MAX_BUCKET_SAMPLE) bucket.samples[replacement] = durationMs;
    }
    pendingBuckets.set(key, bucket);
  });
  next();
}

async function flush() {
  const cutoff = Date.now() - 65000;
  const entries = [...pendingBuckets.entries()].filter(([key]) => Date.parse(key.split('\u0000')[0]) < cutoff);
  for (const [key, bucket] of entries) {
    const [bucketStart, route, statusClass] = key.split('\u0000');
    try {
      await pool.query(
        `INSERT INTO request_metrics_rollup (route, status_class, count, p50_ms, p95_ms, p99_ms, bucket_start)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (route, status_class, bucket_start) DO UPDATE SET
           count = request_metrics_rollup.count + EXCLUDED.count,
           p50_ms = GREATEST(request_metrics_rollup.p50_ms, EXCLUDED.p50_ms),
           p95_ms = GREATEST(request_metrics_rollup.p95_ms, EXCLUDED.p95_ms),
           p99_ms = GREATEST(request_metrics_rollup.p99_ms, EXCLUDED.p99_ms)`,
        [route, statusClass, bucket.count, percentile(bucket.samples, 0.5), percentile(bucket.samples, 0.95), percentile(bucket.samples, 0.99), bucketStart]
      );
      pendingBuckets.delete(key);
    } catch (error) {
      console.error('Request metrics flush failed:', error.message);
    }
  }
}

setInterval(flush, 15000).unref();

function summary({ from, to, route, limit = 100, offset = 0 } = {}) {
  const conditions = [];
  const values = [];
  if (from) { values.push(from); conditions.push(`bucket_start >= $${values.length}`); }
  if (to) { values.push(to); conditions.push(`bucket_start <= $${values.length}`); }
  if (route) { values.push(route); conditions.push(`route = $${values.length}`); }
  values.push(limit, offset);
  return pool.query(
    `SELECT route, status_class, count, p50_ms, p95_ms, p99_ms, bucket_start
       FROM request_metrics_rollup ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY bucket_start DESC, route, status_class
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  ).then(result => result.rows);
}

function rollingWindow({ sinceMs = 5 * 60 * 1000 } = {}) {
  const cutoff = Date.now() - sinceMs;
  const samples = windowSamples.filter(sample => sample.createdAt >= cutoff);
  return {
    count: samples.length,
    errorCount: samples.filter(sample => sample.statusClass === '5xx').length,
    p50Ms: percentile(samples.map(sample => sample.durationMs), 0.5),
    p95Ms: percentile(samples.map(sample => sample.durationMs), 0.95),
    p99Ms: percentile(samples.map(sample => sample.durationMs), 0.99)
  };
}

module.exports = metrics;
module.exports.flush = flush;
module.exports.summary = summary;
module.exports.rollingWindow = rollingWindow;
module.exports.percentile = percentile;
module.exports.normalizeRoute = normalizeRoute;
