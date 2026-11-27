const { pool } = require('../config/database');

const routes = [
  { route: '/api/login', base: 90, latency: 42 },
  { route: '/api/schedules', base: 160, latency: 78 },
  { route: '/api/schedules/:scheduleId/recommendations', base: 24, latency: 540 },
  { route: '/api/events/conflicts', base: 38, latency: 65 }
];

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_ADMIN_DEMO_SEED === 'false') {
    throw new Error('Admin demo seed is disabled in production.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let age = 14; age >= 0; age -= 1) {
      const bucket = new Date();
      bucket.setUTCDate(bucket.getUTCDate() - age);
      bucket.setUTCHours(12, 0, 0, 0);
      for (const item of routes) {
        const count = Math.max(1, Math.round(item.base * (0.65 + Math.random() * 0.7)));
        const hasErrors = Math.random() < 0.18;
        await client.query(
          `INSERT INTO request_metrics_rollup (route, status_class, count, p50_ms, p95_ms, p99_ms, bucket_start)
           VALUES ($1, '2xx', $2, $3, $4, $5, $6), ($1, '5xx', $7, $8, $9, $10, $6)
           ON CONFLICT (route, status_class, bucket_start) DO UPDATE SET
             count = EXCLUDED.count, p50_ms = EXCLUDED.p50_ms,
             p95_ms = EXCLUDED.p95_ms, p99_ms = EXCLUDED.p99_ms`,
          [item.route, count, item.latency / 2, item.latency * 1.7, item.latency * 2.5, bucket.toISOString(),
            hasErrors ? Math.max(1, Math.round(count * 0.015)) : 0, item.latency, item.latency * 2.8, item.latency * 4]
        );
      }
    }
    await client.query('COMMIT');
    console.log('Inserted aggregate admin dashboard metrics only; no user, schedule, or team records were created.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

main().catch(error => {
  console.error(`Admin demo seed failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => pool.end());
