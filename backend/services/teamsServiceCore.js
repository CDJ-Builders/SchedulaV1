const crypto = require('crypto');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT_DAY = Object.freeze({
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
  Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun'
});
const PREFERENCE_DAYS = [
  ['PrefMon', 'Monday'], ['PrefTue', 'Tuesday'], ['PrefWed', 'Wednesday'],
  ['PrefThurs', 'Thursday'], ['PrefFri', 'Friday'], ['PrefSat', 'Saturday']
];
const PREFERENCE_TIMES = [
  ['pref_time_0708', '07:00–08:00'], ['pref_time_0810', '08:00–10:00'],
  ['pref_time_1012', '10:00–12:00'], ['pref_time_1214', '12:00–14:00'],
  ['pref_time_1416', '14:00–16:00'], ['pref_time_1618', '16:00–18:00'],
  ['pref_time_1820', '18:00–20:00'], ['pref_time_2022', '20:00–22:00'],
  ['pref_time_2224', '22:00–24:00']
];

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validText(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw httpError(400, field + ' is required and must be at most ' + maxLength + ' characters.');
  }
  return value.trim();
}

function normalizeTime(value, field) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    throw httpError(400, field + ' must be a valid 24-hour time.');
  }
  return value.slice(0, 5);
}

function minutes(value) {
  const parts = value.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

function timeToHour(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}

function shortDay(day) {
  return SHORT_DAY[day];
}

function makeGroupCode() {
  return 'SCH-' + crypto.randomBytes(2).toString('hex').toUpperCase();
}

function normalizeRole(role) {
  return role === 'owner' || role === 'admin' ? 'admin' : 'member';
}

function createTeamsService(db) {
  if (!db || typeof db.query !== 'function' || typeof db.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool is required.');
  }

  async function getMembership(teamId, userId, executor) {
    const result = await (executor || db).query(
      'SELECT g.id, g.name, g.group_code, g.owner_user_id, m.role ' +
      'FROM groups g JOIN memberships m ON m.group_id = g.id ' +
      'WHERE g.id = $1 AND m.user_id = $2 AND m.deleted_at IS NULL AND g.deleted_at IS NULL',
      [teamId, userId]
    );
    if (!result.rows.length) throw httpError(404, 'Team not found.');
    return result.rows[0];
  }

  async function requireAdmin(teamId, userId, executor) {
    const membership = await getMembership(teamId, userId, executor);
    if (membership.role !== 'owner' && membership.role !== 'admin') {
      throw httpError(403, 'Team admin access is required.');
    }
    return membership;
  }

  async function getTeam(teamId, userId) {
    const team = await getMembership(teamId, userId);
    const memberRows = await db.query(
      'SELECT m.user_id, m.role, p.display_name, p.timezone, u.email ' +
      'FROM memberships m JOIN users u ON u.id = m.user_id ' +
      'LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL ' +
      'WHERE m.group_id = $1 AND m.deleted_at IS NULL AND u.deleted_at IS NULL ' +
      'ORDER BY COALESCE(p.display_name, u.email), u.id',
      [teamId]
    );
    const members = memberRows.rows.map(row => ({
      id: row.user_id,
      name: row.display_name || row.email,
      timezone: row.timezone || 'UTC',
      role: normalizeRole(row.role),
      isSelf: row.user_id === userId,
      busy: Object.fromEntries(Object.values(SHORT_DAY).map(day => [day, []]))
    }));
    const memberIndex = new Map(members.map((member, index) => [member.id, index]));

    const schedules = await db.query(
      'SELECT s.owner_user_id, sc.context ' +
      'FROM memberships m JOIN schedules s ON s.owner_user_id = m.user_id AND s.deleted_at IS NULL ' +
      'LEFT JOIN schedule_context sc ON sc.schedule_id = s.id AND sc.deleted_at IS NULL ' +
      'WHERE m.group_id = $1 AND m.deleted_at IS NULL AND s.group_id IS NULL',
      [teamId]
    );
    schedules.rows.forEach(row => {
      const index = memberIndex.get(row.owner_user_id);
      if (index === undefined) return;
      let blocks = row.context;
      if (typeof blocks === 'string') {
        try { blocks = JSON.parse(blocks); } catch { blocks = []; }
      }
      if (!Array.isArray(blocks)) return;
      blocks.forEach(block => {
        if (!block || !Array.isArray(block.weekdays)) return;
        const start = timeToHour(block.start_time);
        const end = timeToHour(block.end_time);
        if (start === null || end === null || end <= start) return;
        block.weekdays.forEach(day => {
          const key = shortDay(day);
          if (key) members[index].busy[key].push([start, end, 'Busy']);
        });
      });
    });

    const eventRows = await db.query(
      'SELECT id, title, weekday, start_time::text, end_time::text, modality, description ' +
      'FROM team_events WHERE group_id = $1 ORDER BY weekday, start_time',
      [teamId]
    );
    const events = Object.fromEntries(Object.values(SHORT_DAY).map(day => [day, []]));
    eventRows.rows.forEach(event => {
      const key = shortDay(event.weekday);
      const start = timeToHour(event.start_time);
      const end = timeToHour(event.end_time);
      if (key && start !== null && end !== null) events[key].push([start, end, event.title]);
    });

    const proposalRows = await db.query(
      'SELECT p.id, p.proposed_by_user_id, p.title, p.weekday, p.start_time::text, p.end_time::text, ' +
      'p.modality, p.status, p.converted_event_id, p.created_at, mine.response AS current_user_response, ' +
      'COUNT(r.id)::int AS response_count ' +
      'FROM team_proposals p ' +
      'LEFT JOIN proposal_responses r ON r.proposal_id = p.id ' +
      'LEFT JOIN proposal_responses mine ON mine.proposal_id = p.id AND mine.user_id = $2 ' +
      'WHERE p.group_id = $1 ' +
      'GROUP BY p.id, mine.response ORDER BY p.created_at DESC LIMIT 30',
      [teamId, userId]
    );

    return {
      id: team.id,
      name: team.name,
      code: team.group_code,
      role: normalizeRole(team.role),
      isAdmin: team.role === 'owner' || team.role === 'admin',
      members,
      events,
      proposals: proposalRows.rows.map(row => ({
        id: row.id,
        title: row.title,
        weekday: row.weekday,
        start_time: row.start_time.slice(0, 5),
        end_time: row.end_time.slice(0, 5),
        modality: row.modality,
        status: row.status,
        converted_event_id: row.converted_event_id,
        proposed_by_user_id: row.proposed_by_user_id,
        current_user_response: row.current_user_response,
        response_count: row.response_count
      }))
    };
  }

  async function listTeams(userId) {
    const result = await db.query(
      'SELECT g.id FROM groups g JOIN memberships m ON m.group_id = g.id ' +
      'WHERE m.user_id = $1 AND m.deleted_at IS NULL AND g.deleted_at IS NULL ORDER BY g.name, g.id',
      [userId]
    );
    const teams = [];
    for (const row of result.rows) teams.push(await getTeam(row.id, userId));
    return teams;
  }

  async function createTeam(userId, input) {
    const name = validText(input.name, 'Team name', 80);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = makeGroupCode();
      try {
        const result = await db.query(
          'WITH new_group AS (' +
          ' INSERT INTO groups (owner_user_id, name, group_code) VALUES ($1, $2, $3) RETURNING id' +
          ') INSERT INTO memberships (group_id, user_id, role) ' +
          "SELECT id, $1, 'owner' FROM new_group RETURNING group_id",
          [userId, name, code]
        );
        return getTeam(result.rows[0].group_id, userId);
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'groups_group_code_unique') continue;
        throw error;
      }
    }
    throw httpError(503, 'Unable to generate a team code. Please try again.');
  }

  async function joinTeam(userId, rawCode) {
    const code = validText(rawCode, 'Team code', 32).toUpperCase();
    if (!/^SCH-[A-F0-9]{4}$/.test(code)) throw httpError(404, 'Team not found.');
    const result = await db.query('SELECT id FROM groups WHERE group_code = $1 AND deleted_at IS NULL', [code]);
    if (!result.rows.length) throw httpError(404, 'Team not found.');
    const teamId = result.rows[0].id;
    const joined = await db.query(
      "INSERT INTO memberships (group_id, user_id, role) VALUES ($1, $2, 'member') " +
      "ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'member', deleted_at = NULL, updated_at = CURRENT_TIMESTAMP " +
      'WHERE memberships.deleted_at IS NOT NULL RETURNING id',
      [teamId, userId]
    );
    if (!joined.rows.length) throw httpError(409, 'You are already a member of this team.');
    return getTeam(teamId, userId);
  }

  async function renameTeam(teamId, userId, input) {
    await requireAdmin(teamId, userId);
    const name = validText(input.name, 'Team name', 80);
    const result = await db.query(
      'UPDATE groups SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND deleted_at IS NULL RETURNING id',
      [name, teamId]
    );
    if (!result.rows.length) throw httpError(404, 'Team not found.');
    return getTeam(teamId, userId);
  }

  async function regenerateCode(teamId, userId) {
    await requireAdmin(teamId, userId);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = makeGroupCode();
      try {
        const result = await db.query(
          'UPDATE groups SET group_code = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING group_code',
          [code, teamId]
        );
        if (!result.rows.length) throw httpError(404, 'Team not found.');
        return result.rows[0].group_code;
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'groups_group_code_unique') continue;
        throw error;
      }
    }
    throw httpError(503, 'Unable to generate a team code. Please try again.');
  }

  async function changeMemberRole(teamId, actorId, targetId, requestedRole) {
    await requireAdmin(teamId, actorId);
    if (!['admin', 'member'].includes(requestedRole)) throw httpError(400, 'Role must be admin or member.');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const targetResult = await client.query(
        'SELECT role FROM memberships WHERE group_id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE',
        [teamId, targetId]
      );
      if (!targetResult.rows.length) throw httpError(404, 'Team member not found.');
      const oldRole = targetResult.rows[0].role;
      if ((oldRole === 'owner' || oldRole === 'admin') && requestedRole === 'member') {
        const admins = await client.query(
          "SELECT user_id, role FROM memberships WHERE group_id = $1 AND deleted_at IS NULL AND role IN ('owner','admin') FOR UPDATE",
          [teamId]
        );
        if (admins.rows.length <= 1) throw httpError(409, 'Promote another admin before demoting the last admin.');
        if (oldRole === 'owner') {
          const nextOwner = admins.rows.find(row => row.user_id !== targetId);
          await client.query('UPDATE groups SET owner_user_id = $1 WHERE id = $2', [nextOwner.user_id, teamId]);
        }
      }
      await client.query(
        'UPDATE memberships SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE group_id = $2 AND user_id = $3',
        [requestedRole, teamId, targetId]
      );
      await client.query('COMMIT');
      return getTeam(teamId, actorId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async function removeMember(teamId, actorId, targetId) {
    await requireAdmin(teamId, actorId);
    if (actorId === targetId) throw httpError(400, 'Use Leave team to remove yourself.');
    return removeMembership(teamId, targetId);
  }

  async function removeMembership(teamId, targetId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query(
        'SELECT role FROM memberships WHERE group_id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE',
        [teamId, targetId]
      );
      if (!target.rows.length) throw httpError(404, 'Team member not found.');
      const role = target.rows[0].role;
      if (role === 'owner' || role === 'admin') {
        const admins = await client.query(
          "SELECT user_id FROM memberships WHERE group_id = $1 AND deleted_at IS NULL AND role IN ('owner','admin') FOR UPDATE",
          [teamId]
        );
        if (admins.rows.length <= 1) throw httpError(409, 'Promote another admin before removing the last admin.');
        if (role === 'owner') {
          const nextOwner = admins.rows.find(row => row.user_id !== targetId);
          await client.query('UPDATE groups SET owner_user_id = $1 WHERE id = $2', [nextOwner.user_id, teamId]);
        }
      }
      await client.query(
        'UPDATE memberships SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP ' +
        'WHERE group_id = $1 AND user_id = $2',
        [teamId, targetId]
      );
      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async function leaveTeam(teamId, userId) {
    await getMembership(teamId, userId);
    return removeMembership(teamId, userId);
  }

  async function listMemberPreferences(teamId, userId) {
    await getMembership(teamId, userId);
    const result = await db.query(
      'SELECT m.user_id, m.role, p.display_name, u.email, ' +
      'pr.\"PrefMon\", pr.\"PrefTue\", pr.\"PrefWed\", pr.\"PrefThurs\", pr.\"PrefFri\", pr.\"PrefSat\", ' +
      'pr.pref_time_0708, pr.pref_time_0810, pr.pref_time_1012, pr.pref_time_1214, pr.pref_time_1416, ' +
      'pr.pref_time_1618, pr.pref_time_1820, pr.pref_time_2022, pr.pref_time_2224, ' +
      'pr.preferred_modality, pr.commute_time, pr.preferred_break_minutes, pr.max_back_to_back ' +
      'FROM memberships m JOIN users u ON u.id = m.user_id ' +
      'LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL ' +
      'LEFT JOIN preferences pr ON pr.user_id = u.id ' +
      'WHERE m.group_id = $1 AND m.deleted_at IS NULL AND u.deleted_at IS NULL ' +
      'ORDER BY COALESCE(p.display_name, u.email), u.id',
      [teamId]
    );
    return result.rows.map(row => {
      const days = PREFERENCE_DAYS.filter(([key]) => row[key]).map(([, label]) => label);
      const times = PREFERENCE_TIMES.filter(([key]) => row[key]).map(([, label]) => label);
      return {
        id: row.user_id,
        name: row.display_name || row.email,
        isSelf: row.user_id === userId,
        role: normalizeRole(row.role),
        preferences: {
          days: days.length ? days.join(', ') : 'No preferences set',
          times: times.length ? times.join(', ') : 'No preferences set',
          modality: row.preferred_modality && row.preferred_modality !== 'no preference' ? row.preferred_modality : 'No preference',
          commute: row.commute_time ? row.commute_time + ' minutes' : 'No commute',
          preferredBreakMinutes: row.preferred_break_minutes == null ? 60 : row.preferred_break_minutes,
          maxBackToBack: row.max_back_to_back == null ? 0 : row.max_back_to_back
        }
      };
    });
  }

  function validateProposal(input) {
    const title = validText(input.title || 'Team meeting', 'Title', 100);
    if (!DAYS.includes(input.weekday)) throw httpError(400, 'Weekday must be a day from Monday to Sunday.');
    const start = normalizeTime(input.start_time, 'start_time');
    const end = normalizeTime(input.end_time, 'end_time');
    if (minutes(end) <= minutes(start)) throw httpError(400, 'end_time must be later than start_time.');
    if (!['onsite', 'online'].includes(input.modality)) throw httpError(400, 'Modality must be onsite or online.');
    return { title, weekday: input.weekday, start, end, modality: input.modality };
  }

  async function createProposal(teamId, userId, input) {
    await getMembership(teamId, userId);
    const proposal = validateProposal(input);
    const result = await db.query(
      'INSERT INTO team_proposals (group_id, proposed_by_user_id, title, weekday, start_time, end_time, modality) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [teamId, userId, proposal.title, proposal.weekday, proposal.start, proposal.end, proposal.modality]
    );
    return getTeam(teamId, userId).then(team => ({
      proposal: team.proposals.find(item => item.id === result.rows[0].id)
    }));
  }

  async function respondToProposal(teamId, userId, proposalId, response) {
    if (!['accept', 'decline'].includes(response)) throw httpError(400, 'Response must be accept or decline.');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await getMembership(teamId, userId, client);
      const proposalResult = await client.query(
        'SELECT * FROM team_proposals WHERE id = $1 AND group_id = $2 FOR UPDATE',
        [proposalId, teamId]
      );
      if (!proposalResult.rows.length) throw httpError(404, 'Proposal not found.');
      const proposal = proposalResult.rows[0];
      if (proposal.status !== 'pending') throw httpError(409, 'This proposal is no longer pending.');
      await client.query(
        'INSERT INTO proposal_responses (proposal_id, user_id, response) VALUES ($1,$2,$3) ' +
        'ON CONFLICT (proposal_id, user_id) DO UPDATE SET response = EXCLUDED.response, responded_at = CURRENT_TIMESTAMP',
        [proposalId, userId, response]
      );

      const counts = await client.query(
        'SELECT COUNT(*)::int AS members, COUNT(r.id)::int AS responses, ' +
        "COUNT(r.id) FILTER (WHERE r.response = 'accept')::int AS accepted, " +
        "COUNT(r.id) FILTER (WHERE r.response = 'decline')::int AS declined " +
        'FROM memberships m LEFT JOIN proposal_responses r ON r.proposal_id = $2 AND r.user_id = m.user_id ' +
        'WHERE m.group_id = $1 AND m.deleted_at IS NULL',
        [teamId, proposalId]
      );
      const state = counts.rows[0];
      let eventId = null;
      let status = 'pending';
      if (state.declined > 0) {
        status = 'declined';
        await client.query('UPDATE team_proposals SET status = $1 WHERE id = $2', [status, proposalId]);
      } else if (state.responses === state.members && state.accepted === state.members) {
        const event = await client.query(
          'INSERT INTO team_events (group_id, created_by_user_id, title, weekday, start_time, end_time, modality) ' +
          'VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [teamId, proposal.proposed_by_user_id, proposal.title, proposal.weekday, proposal.start_time, proposal.end_time, proposal.modality]
        );
        eventId = event.rows[0].id;
        status = 'confirmed';
        await client.query(
          'UPDATE team_proposals SET status = $1, converted_event_id = $2 WHERE id = $3',
          [status, eventId, proposalId]
        );
      }
      await client.query('COMMIT');
      return { success: true, status, event_id: eventId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  return {
    listTeams, getTeam, createTeam, joinTeam, renameTeam, regenerateCode,
    changeMemberRole, removeMember, leaveTeam, listMemberPreferences,
    createProposal, respondToProposal
  };
}

module.exports = createTeamsService;
