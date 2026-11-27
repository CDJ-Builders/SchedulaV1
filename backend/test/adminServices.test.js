const test = require('node:test');
const assert = require('node:assert/strict');
const auditService = require('../services/auditService');
const errorLogService = require('../services/errorLogService');
const metrics = require('../middleware/metrics');
const healthService = require('../services/healthService');
const adminStats = require('../services/adminStatsService');

test('audit redaction removes secrets recursively and bounds strings', () => {
  const output = auditService.redact({
    email: 'person@example.test',
    password_hash: 'hash',
    nested: { authorization: 'Bearer token', description: 'x'.repeat(5000) }
  });
  assert.deepEqual(Object.keys(output), ['email', 'nested']);
  assert.equal(output.nested.authorization, undefined);
  assert.equal(output.nested.description.length, 4000);
});

test('error log sanitizer removes emails, bearer values and credential assignments', () => {
  const safe = errorLogService.sanitizeMessage('Failure for user@example.test Bearer abc token=secret-value');
  assert.equal(safe.includes('user@example.test'), false);
  assert.equal(safe.includes('Bearer abc'), false);
  assert.equal(safe.includes('secret-value'), false);
});

test('request metrics normalize IDs and compute percentiles', () => {
  const req = { path: '/api/schedules/123e4567-e89b-12d3-a456-426614174000/events/42' };
  assert.equal(metrics.normalizeRoute(req), '/api/schedules/:id/events/:id');
  assert.equal(metrics.percentile([4, 1, 3, 2], 0.5), 2);
  assert.equal(metrics.percentile([4, 1, 3, 2], 0.95), 4);
});

test('health threshold logic classifies degraded and down values', () => {
  assert.equal(healthService.numericStatus(20, { degraded: 10, down: 50 }), 'degraded');
  assert.equal(healthService.numericStatus(60, { degraded: 10, down: 50 }), 'down');
  assert.equal(healthService.numericStatus(5, { degraded: 10, down: 50 }), 'ok');
});

test('stats range parser accepts supported windows and safely defaults overview range', () => {
  assert.equal(adminStats.rangeDays('7d'), 7);
  assert.equal(adminStats.rangeDays('30d'), 30);
  assert.equal(adminStats.rangeDays('90d'), 90);
  assert.equal(adminStats.rangeDays('invalid'), 30);
});
