const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const requireStepUp = require('../middleware/requireStepUp');
const auditService = require('../services/auditService');
const errorLogService = require('../services/errorLogService');
const healthService = require('../services/healthService');
const metrics = require('../middleware/metrics');
const retention = require('../config/adminRetention');
const adminStats = require('../services/adminStatsService');
const adminUserData = require('../services/adminUserDataService');

const router = express.Router();
const adminRoles = requireRole(['developer', 'super_admin']);
const superAdmin = requireRole(['super_admin']);
const stepUpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sensitive admin actions. Try again later.' }
});

function pageParams(req, res, next) {
  const page = Math.min(100000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  if (String(req.query.q || '').length > 200) return res.status(400).json({ error: 'Query filters are too long' });
  req.page = page;
  req.limit = limit;
  req.offset = (page - 1) * limit;
  next();
}

function dateFilter(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function validateDates(req, res, next) {
  if (String(req.query.from || '').length > 64 || String(req.query.to || '').length > 64) {
    return res.status(400).json({ error: 'Date filters are too long' });
  }
  const from = dateFilter(req.query.from);
  const to = dateFilter(req.query.to);
  if (from === null || to === null || (from && to && from > to)) {
    return res.status(400).json({ error: 'Invalid date range' });
  }
  req.dateRange = { from, to };
  next();
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(authenticateToken, adminRoles);

router.get('/users', pageParams, asyncHandler(async (req, res) => {
  const result = await adminUserData.listUsers(req, {
    q: String(req.query.q || '').trim(), limit: req.limit, offset: req.offset, page: req.page
  });
  res.json(result);
}));

router.get('/users/:id', asyncHandler(async (req, res) => {
  const userId = req.params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  const configuration = await adminUserData.getUserConfiguration(req, userId);
  if (!configuration) return res.status(404).json({ error: 'User not found' });
  res.json(configuration);
}));

router.get('/meta', (req, res) => {
  res.json({
    role: req.user.role,
    environment: process.env.NODE_ENV || 'development',
    resources: [],
    capabilities: {
      dashboard: true, health: true, diagnostics: true, audit: true,
      generalDataCrud: false, userRoleManagement: req.user.role === 'super_admin'
    }
  });
});

router.get('/health', asyncHandler(async (req, res) => {
  res.json(await healthService.getHealth());
}));

router.get('/dashboard', asyncHandler(async (req, res) => {
  const range = req.query.range || '30d';
  if (!['7d', '30d', '90d'].includes(range)) return res.status(400).json({ error: 'range must be 7d, 30d, or 90d' });
  const collect = async action => {
    try { return { data: await action() }; }
    catch (error) { return { error: error.message || 'Dashboard data unavailable' }; }
  };
  const metrics = ['signups', 'requests', 'errors', 'schedules_created', 'entries_created', 'smart_schedule_calls'];
  const breakdownMetrics = ['users_by_role', 'entries_by_modality', 'top_routes'];
  const [stats, ...results] = await Promise.all([
    collect(() => adminStats.overview(range)),
    ...metrics.map(metric => collect(() => adminStats.timeseries(metric, range))),
    ...breakdownMetrics.map(metric => collect(() => adminStats.breakdown(metric)))
  ]);
  const series = Object.fromEntries(metrics.map((metric, index) => [metric, results[index]]));
  const breakdowns = Object.fromEntries(breakdownMetrics.map((metric, index) => [metric, results[metrics.length + index]]));
  res.json({ stats, series, breakdowns });
}));

router.get('/stats/overview', asyncHandler(async (req, res) => {
  const range = req.query.range || '30d';
  if (!['7d', '30d', '90d'].includes(range)) return res.status(400).json({ error: 'range must be 7d, 30d, or 90d' });
  res.json(await adminStats.overview(range));
}));

router.get('/stats/timeseries', asyncHandler(async (req, res) => {
  res.json(await adminStats.timeseries(req.query.metric, req.query.range || '7d', req.query.interval || 'day'));
}));

router.get('/stats/breakdown', asyncHandler(async (req, res) => {
  if (!req.query.metric || String(req.query.metric).length > 64) return res.status(400).json({ error: 'metric is required' });
  res.json({ metric: req.query.metric, rows: await adminStats.breakdown(req.query.metric) });
}));

router.get('/audit', pageParams, validateDates, asyncHandler(async (req, res) => {
  for (const key of ['resource', 'action']) {
    if (String(req.query[key] || '').length > 100) return res.status(400).json({ error: `${key} filter is too long` });
  }
  const actor = req.query.actor;
  if (actor && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actor)) {
    return res.status(400).json({ error: 'Invalid actor ID' });
  }
  const fetched = await auditService.list({
    actor, resource: req.query.resource, action: req.query.action,
    ...req.dateRange, limit: req.limit + 1, offset: req.offset
  });
  res.json({ rows: fetched.slice(0, req.limit), page: req.page, limit: req.limit, has_more: fetched.length > req.limit });
}));

router.get('/logs/errors', pageParams, validateDates, asyncHandler(async (req, res) => {
  if (String(req.query.route || '').length > 256) return res.status(400).json({ error: 'route filter is too long' });
  const fetched = await errorLogService.list({ route: req.query.route, ...req.dateRange, limit: req.limit + 1, offset: req.offset });
  res.json({ rows: fetched.slice(0, req.limit), page: req.page, limit: req.limit, has_more: fetched.length > req.limit });
}));

router.get('/metrics/requests', pageParams, validateDates, asyncHandler(async (req, res) => {
  if (String(req.query.route || '').length > 256) return res.status(400).json({ error: 'route filter is too long' });
  const rows = await metrics.summary({
    ...req.dateRange,
    route: req.query.route,
    limit: req.limit,
    offset: req.offset
  });
  res.json({ rows, rolling_window: metrics.rollingWindow(), page: req.page, limit: req.limit });
}));

router.patch('/access/users/:id/role', stepUpLimiter, superAdmin, requireStepUp, asyncHandler(async (req, res) => {
  const role = req.body?.role;
  if (!['user', 'developer', 'super_admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const targetId = req.params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  if (targetId === req.user.user_id && role !== 'super_admin') {
    return res.status(409).json({ error: 'A super admin cannot demote themselves' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
    const target = await client.query('SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [targetId]);
    if (!target.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    const before = target.rows[0];
    if (before.role === 'super_admin' && role !== 'super_admin') {
      const count = await client.query("SELECT COUNT(*)::integer AS count FROM users WHERE role = 'super_admin' AND deleted_at IS NULL");
      if (count.rows[0].count <= 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'At least one super admin must remain' });
      }
    }
    await client.query('UPDATE users SET role = $1 WHERE id = $2', [role, targetId]);
    await auditService.record(client, req, {
      action: 'role.change', resource: 'user_access', resourceId: targetId,
      before: { role: before.role }, after: { role }
    });
    await client.query('COMMIT');
    res.json({ id: targetId, role });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/maintenance/prune-logs', stepUpLimiter, superAdmin, requireStepUp, asyncHandler(async (req, res) => {
  const client = await pool.connect();
  let counts;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.allow_audit_prune = 'on'");
    const [metricsResult, errorsResult, auditResult] = await Promise.all([
      client.query("DELETE FROM request_metrics_rollup WHERE bucket_start < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')", [retention.metricsDays]),
      client.query("DELETE FROM error_log WHERE created_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')", [retention.errorsDays]),
      client.query("DELETE FROM admin_audit_log WHERE created_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')", [retention.auditDays])
    ]);
    counts = { metrics: metricsResult.rowCount, errors: errorsResult.rowCount, audit: auditResult.rowCount };
    await auditService.record(client, req, {
      action: 'maintenance.prune_logs', resource: 'admin_diagnostics', after: counts
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  res.json({ deleted: counts, retention_days: retention });
}));

router.post('/maintenance/clear-expired-sessions', stepUpLimiter, superAdmin, requireStepUp, asyncHandler(async (req, res) => {
  const client = await pool.connect();
  let counts;
  try {
    await client.query('BEGIN');
    const sessions = await client.query(`DELETE FROM refresh_tokens
      WHERE expires_at < CURRENT_TIMESTAMP OR revoked_at < CURRENT_TIMESTAMP - INTERVAL '30 days'`);
    const resets = await client.query(`DELETE FROM password_reset_tokens
      WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day' OR used_at < CURRENT_TIMESTAMP - INTERVAL '1 day'`);
    counts = { sessions: sessions.rowCount, reset_tokens: resets.rowCount };
    await auditService.record(client, req, {
      action: 'maintenance.clear_expired_sessions', resource: 'sessions', after: counts
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  res.json({ deleted: counts });
}));

router.use((req, res) => res.status(404).json({ error: 'Admin endpoint not found' }));

module.exports = router;
