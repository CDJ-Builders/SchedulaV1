const test = require('node:test');
const assert = require('node:assert/strict');
const createTeamsService = require('../services/teamsServiceCore');

function unusedDatabase() {
  return {
    query() { throw new Error('Unexpected database access in validation test.'); },
    connect() { throw new Error('Unexpected database access in validation test.'); }
  };
}

function databaseWithMembership(role) {
  return {
    query() { return Promise.resolve({ rows: [{ id: 'team-id', name: 'Team', group_code: 'SCH-A1B2', owner_user_id: 'owner-id', role }] }); },
    connect() { throw new Error('Unauthorized member must not open a write transaction.'); }
  };
}

test('team service requires a pool-like dependency', () => {
  assert.throws(() => createTeamsService(null), /PostgreSQL pool/);
});

test('team names are required and bounded before database writes', async () => {
  const service = createTeamsService(unusedDatabase());
  await assert.rejects(service.createTeam('user-id', { name: '  ' }), { status: 400 });
  await assert.rejects(service.createTeam('user-id', { name: 'x'.repeat(81) }), { status: 400 });
});

test('join codes are normalized but malformed codes do not query the database', async () => {
  const service = createTeamsService(unusedDatabase());
  await assert.rejects(service.joinTeam('user-id', 'not-a-code'), { status: 404, message: 'Team not found.' });
  await assert.rejects(service.joinTeam('user-id', 'SCH-12345'), { status: 404, message: 'Team not found.' });
});

test('regular team members cannot change roles or regenerate the group code', async () => {
  const service = createTeamsService(databaseWithMembership('member'));
  await assert.rejects(service.changeMemberRole('team-id', 'member-id', 'target-id', 'admin'), {
    status: 403,
    message: 'Team admin access is required.'
  });
  await assert.rejects(service.regenerateCode('team-id', 'member-id'), {
    status: 403,
    message: 'Team admin access is required.'
  });
});
