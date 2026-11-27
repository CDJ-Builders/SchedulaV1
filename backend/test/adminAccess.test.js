const test = require('node:test');
const assert = require('node:assert/strict');
const requireRole = require('../middleware/requireRole');
const requireStepUp = require('../middleware/requireStepUp');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('requireRole returns 401 when authentication did not populate req.user', async () => {
  const res = response();
  await requireRole(['developer'])({}, res, () => assert.fail('next should not run'));
  assert.equal(res.statusCode, 401);
});

test('requireRole reads role from the database instead of JWT claims', async () => {
  const req = { user: { user_id: 'u1', role: 'super_admin' } };
  const res = response();
  let nextCalled = false;
  await requireRole(['super_admin'], async (sql, values) => {
    if (sql.includes('SELECT role FROM users')) {
      assert.deepEqual(values, ['u1']);
      return { rowCount: 1, rows: [{ role: 'user' }] };
    }
    assert.match(sql, /authorization\.denied/);
    return { rowCount: 1, rows: [] };
  })(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test('requireRole allows a database-authorized role and sets the trusted role', async () => {
  const req = { user: { user_id: 'u2' } };
  const res = response();
  let nextCalled = false;
  await requireRole(['developer', 'super_admin'], async () => ({ rowCount: 1, rows: [{ role: 'developer' }] }))(
    req, res, () => { nextCalled = true; }
  );
  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'developer');
});

test('requireStepUp requires the current password and verifies it against the stored hash', async () => {
  const req = { user: { user_id: 'u1' }, body: { password: 'secret' } };
  const res = response();
  let nextCalled = false;
  await requireStepUp(req, res, () => { nextCalled = true; }, async (sql, values) => {
    assert.match(sql, /crypt\(\$2, password_hash\)/);
    assert.deepEqual(values, ['u1', 'secret']);
    return { rowCount: 1 };
  });
  assert.equal(nextCalled, true);
});

test('requireStepUp rejects missing or incorrect passwords', async () => {
  const missingResponse = response();
  await requireStepUp({ user: { user_id: 'u1' }, body: {} }, missingResponse, () => assert.fail('next should not run'));
  assert.equal(missingResponse.statusCode, 400);
  const invalidResponse = response();
  await requireStepUp(
    { user: { user_id: 'u1', role: 'super_admin' }, body: { password: 'wrong' } }, invalidResponse,
    () => assert.fail('next should not run'), async sql => sql.includes('SELECT 1') ? { rowCount: 0 } : { rowCount: 1 }
  );
  assert.equal(invalidResponse.statusCode, 403);
});
