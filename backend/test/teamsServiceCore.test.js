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

test('admins cannot demote the team creator', async () => {
  const statements = [];
  const db = {
    async query() {
      return { rows: [{ id: 'team-id', name: 'Team', group_code: 'SCH-A1B2', owner_user_id: 'creator-id', role: 'admin' }] };
    },
    connect() {
      return Promise.resolve({
        async query(sql) {
          statements.push(sql);
          if (sql.startsWith('SELECT g.owner_user_id, m.role')) {
            return { rows: [{ owner_user_id: 'creator-id', role: 'owner' }] };
          }
          return { rows: [] };
        },
        release() {}
      });
    }
  };
  const service = createTeamsService(db);

  await assert.rejects(service.changeMemberRole('team-id', 'admin-id', 'creator-id', 'member'), {
    status: 403,
    message: 'The team creator cannot be demoted by an admin.'
  });
  assert.equal(statements.some(sql => sql.startsWith('UPDATE memberships')), false);
  assert.equal(statements.at(-1), 'ROLLBACK');
  await assert.rejects(service.removeMember('team-id', 'admin-id', 'creator-id'), {
    status: 403,
    message: 'The team creator cannot be removed by an admin.'
  });
});

test('only the team creator can delete the team', async () => {
  const statements = [];
  const db = {
    query() { throw new Error('Deletion must run in a transaction.'); },
    connect() {
      return Promise.resolve({
        async query(sql) {
          statements.push(sql);
          if (sql.startsWith('SELECT g.owner_user_id')) {
            return { rows: [{ owner_user_id: 'creator-id' }] };
          }
          return { rows: [] };
        },
        release() {}
      });
    }
  };
  const service = createTeamsService(db);

  await assert.rejects(service.deleteTeam('team-id', 'admin-id'), {
    status: 403,
    message: 'Only the team creator can delete this team.'
  });
  assert.equal(statements.some(sql => sql.startsWith('DELETE FROM team_proposals')), false);
  assert.equal(statements.includes('ROLLBACK'), true);
});

test('creator deletion cleans up team access and team-owned schedule links atomically', async () => {
  const statements = [];
  const db = {
    query() { throw new Error('Deletion must run in a transaction.'); },
    connect() {
      return Promise.resolve({
        async query(sql) {
          statements.push(sql);
          if (sql.startsWith('SELECT g.owner_user_id')) {
            return { rows: [{ owner_user_id: 'creator-id' }] };
          }
          return { rows: [] };
        },
        release() {}
      });
    }
  };
  const service = createTeamsService(db);

  assert.deepEqual(await service.deleteTeam('team-id', 'creator-id'), { success: true });
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.some(sql => sql.startsWith('DELETE FROM team_proposals')), true);
  assert.equal(statements.some(sql => sql.startsWith('DELETE FROM team_events')), true);
  assert.equal(statements.some(sql => sql.startsWith('UPDATE schedule_shares')), true);
  assert.equal(statements.some(sql => sql.startsWith('UPDATE schedules')), true);
  assert.equal(statements.some(sql => sql.startsWith('UPDATE memberships')), true);
  assert.equal(statements.some(sql => sql.startsWith('UPDATE groups')), true);
  assert.equal(statements.at(-1), 'COMMIT');
});

test('the last member leaving deletes the team for everyone', async () => {
  const statements = [];
  const db = {
    async query(sql) {
      if (sql.startsWith('SELECT g.id, g.name')) {
        return { rows: [{ id: 'team-id', name: 'Team', group_code: 'SCH-A1B2', owner_user_id: 'creator-id', role: 'viewer' }] };
      }
      throw new Error('Unexpected pool query: ' + sql);
    },
    connect() {
      return Promise.resolve({
        async query(sql) {
          statements.push(sql);
          if (sql.startsWith('SELECT owner_user_id FROM groups')) {
            return { rows: [{ owner_user_id: 'creator-id' }] };
          }
          if (sql.startsWith('SELECT m.user_id, m.role')) {
            return { rows: [{ user_id: 'viewer-id', role: 'viewer', member_name: 'Viewer' }] };
          }
          return { rows: [] };
        },
        release() {}
      });
    }
  };
  const service = createTeamsService(db);

  assert.deepEqual(await service.leaveTeam('team-id', 'viewer-id'), { success: true, teamDeleted: true });
  assert.equal(statements.some(sql => sql.startsWith('DELETE FROM team_proposals')), true);
  assert.equal(statements.some(sql => sql.startsWith('UPDATE groups')), true);
  assert.equal(statements.at(-1), 'COMMIT');
});

test('accepting a proposal adds a described weekly block to the reviewers shared personal schedule', async () => {
  const statements = [];
  let savedConfiguration;
  const db = {
    query() { throw new Error('Proposal review must run in a transaction.'); },
    connect() {
      return Promise.resolve({
        async query(sql, params) {
          statements.push(sql);
          if (sql.startsWith('SELECT g.id, g.name')) return { rows: [{ id: 'team-id', name: 'Study Crew', owner_user_id: 'owner-id', role: 'member' }] };
          if (sql.startsWith('SELECT * FROM team_proposals')) return { rows: [{ id: 'proposal-id', title: 'Weekly study', weekday: 'Tuesday', start_time: '10:00:00', end_time: '11:00:00', modality: 'online', status: 'pending' }] };
          if (sql.startsWith('SELECT response FROM proposal_responses')) return { rows: [] };
          if (sql.startsWith('SELECT s.id, COALESCE(sc.context')) return { rows: [{ id: 'schedule-id', configuration: [{ title: 'Existing', description: '', weekdays: ['Monday'], start_time: '08:00', end_time: '09:00', modality: 'onsite' }] }] };
          if (sql.startsWith('INSERT INTO schedule_context')) savedConfiguration = JSON.parse(params[1]);
          return { rows: [] };
        },
        release() {}
      });
    }
  };
  const service = createTeamsService(db);

  assert.deepEqual(await service.respondToProposal('team-id', 'reviewer-id', 'proposal-id', 'accept'), {
    success: true, status: 'accepted', schedule_id: 'schedule-id'
  });
  assert.equal(savedConfiguration.length, 2);
  assert.deepEqual(savedConfiguration[1], {
    title: 'Weekly study', description: 'Team Scheduled at Study Crew', weekdays: ['Tuesday'],
    start_time: '10:00', end_time: '11:00', modality: 'online'
  });
  assert.ok(statements.some(sql => sql.startsWith('INSERT INTO proposal_responses')));
  assert.equal(statements.at(-1), 'COMMIT');
});

test('rejecting a proposal removes it for all team members', async () => {
  const statements = [];
  const db = {
    query() { throw new Error('Proposal review must run in a transaction.'); },
    connect() {
      return Promise.resolve({
        async query(sql) {
          statements.push(sql);
          if (sql.startsWith('SELECT g.id, g.name')) return { rows: [{ id: 'team-id', name: 'Study Crew', owner_user_id: 'owner-id', role: 'member' }] };
          if (sql.startsWith('SELECT * FROM team_proposals')) return { rows: [{ id: 'proposal-id', status: 'pending' }] };
          if (sql.startsWith('SELECT response FROM proposal_responses')) return { rows: [] };
          return { rows: [] };
        },
        release() {}
      });
    }
  };
  const service = createTeamsService(db);

  assert.deepEqual(await service.respondToProposal('team-id', 'reviewer-id', 'proposal-id', 'decline'), {
    success: true, status: 'rejected', schedule_id: null
  });
  assert.ok(statements.some(sql => sql.startsWith('DELETE FROM team_proposals')));
  assert.equal(statements.at(-1), 'COMMIT');
});

test('creating a proposal immediately adds it to the proposers shared personal schedule', async () => {
  const statements = [];
  let savedConfiguration;
  const db = {
    query() { throw new Error('Proposal creation must run in a transaction.'); },
    connect() {
      return Promise.resolve({
        async query(sql, params) {
          statements.push(sql);
          if (sql.startsWith('SELECT g.id, g.name')) return { rows: [{ id: 'team-id', name: 'Study Crew', owner_user_id: 'owner-id', role: 'member' }] };
          if (sql.startsWith('INSERT INTO team_proposals')) return { rows: [{ id: 'proposal-id' }] };
          if (sql.startsWith('SELECT s.id, COALESCE(sc.context')) return { rows: [{ id: 'schedule-id', configuration: [] }] };
          if (sql.startsWith('INSERT INTO schedule_context')) savedConfiguration = JSON.parse(params[1]);
          return { rows: [] };
        },
        release() {}
      });
    }
  };
  const service = createTeamsService(db);

  const result = await service.createProposal('team-id', 'proposer-id', {
    title: 'Weekly study', weekday: 'Tuesday', start_time: '10:00', end_time: '11:00', modality: 'online'
  });
  assert.equal(result.proposal.current_user_response, 'accept');
  assert.deepEqual(savedConfiguration, [{
    title: 'Weekly study', description: 'Team Scheduled at Study Crew', weekdays: ['Tuesday'],
    start_time: '10:00', end_time: '11:00', modality: 'online'
  }]);
  assert.ok(statements.some(sql => sql.startsWith('INSERT INTO proposal_responses')));
  assert.equal(statements.at(-1), 'COMMIT');
});

test('proposal creation does not duplicate an identical block already on the shared schedule', async () => {
  let savedConfiguration;
  const existingBlock = {
    title: 'Weekly study', description: 'Already there', weekdays: ['Tuesday'],
    start_time: '10:00:00', end_time: '11:00:00', modality: 'online'
  };
  const db = {
    query() { throw new Error('Proposal creation must run in a transaction.'); },
    connect() {
      return Promise.resolve({
        async query(sql, params) {
          if (sql.startsWith('SELECT g.id, g.name')) return { rows: [{ id: 'team-id', name: 'Study Crew', owner_user_id: 'owner-id', role: 'member' }] };
          if (sql.startsWith('INSERT INTO team_proposals')) return { rows: [{ id: 'proposal-id' }] };
          if (sql.startsWith('SELECT s.id, COALESCE(sc.context')) return { rows: [{ id: 'schedule-id', configuration: [existingBlock] }] };
          if (sql.startsWith('INSERT INTO schedule_context')) savedConfiguration = JSON.parse(params[1]);
          return { rows: [] };
        },
        release() {}
      });
    }
  };
  const service = createTeamsService(db);

  await service.createProposal('team-id', 'proposer-id', {
    title: 'Weekly study', weekday: 'Tuesday', start_time: '10:00', end_time: '11:00', modality: 'online'
  });
  assert.deepEqual(savedConfiguration, [existingBlock]);
});
