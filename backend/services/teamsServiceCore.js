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

/** Build team operations against the injected database pool. @param {object} db @returns {object} @throws {TypeError} */
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

  /** Load a team and its authorized member and schedule views. @param {string} teamId @param {string} userId @param {object} [options] @returns {Promise<object>} @throws {Error} */
  async function getTeam(teamId, userId, options = {}) {
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
      isCreator: row.user_id === team.owner_user_id,
      isSelf: row.user_id === userId,
      busy: Object.fromEntries(Object.values(SHORT_DAY).map(day => [day, []]))
    }));
    const memberIndex = new Map(members.map((member, index) => [member.id, index]));
    const proposalRows = await db.query(
      'SELECT p.id, p.proposed_by_user_id, p.title, p.description, p.weekday, p.start_time::text, p.end_time::text, ' +
      'p.modality, p.status, p.converted_event_id, p.created_at, mine.response AS current_user_response, ' +
      'COUNT(r.id)::int AS response_count, ' +
      "ARRAY_AGG(DISTINCT r.user_id) FILTER (WHERE r.response = 'accept') AS accepted_user_ids " +
      'FROM team_proposals p ' +
      'LEFT JOIN proposal_responses r ON r.proposal_id = p.id ' +
      'LEFT JOIN proposal_responses mine ON mine.proposal_id = p.id AND mine.user_id = $2 ' +
      'WHERE p.group_id = $1 ' +
      'GROUP BY p.id, mine.response ORDER BY p.created_at DESC LIMIT 30',
      [teamId, userId]
    );

    const schedules = await db.query(
      'SELECT s.owner_user_id, sc.context, sh.show_details ' +
      'FROM memberships m ' +
      "JOIN schedule_shares sh ON sh.shared_with_group_id = m.group_id AND sh.deleted_at IS NULL AND sh.permission = 'read' " +
      'JOIN schedules s ON s.id = sh.schedule_id AND s.owner_user_id = m.user_id AND s.deleted_at IS NULL AND s.group_id IS NULL ' +
      'LEFT JOIN schedule_context sc ON sc.schedule_id = s.id AND sc.deleted_at IS NULL ' +
      'WHERE m.group_id = $1 AND m.deleted_at IS NULL',
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
        const showOwnerDetails = row.show_details === true;
        block.weekdays.forEach(day => {
          const key = shortDay(day);
          if (!key) return;
          const storedTeamEvent = block.team_event && typeof block.team_event === 'object'
            ? block.team_event : null;
          const scheduledProposal = storedTeamEvent ? null : proposalRows.rows.find(proposal =>
            Array.isArray(proposal.accepted_user_ids) && proposal.accepted_user_ids.some(id => String(id) === String(row.owner_user_id)) &&
            shortDay(proposal.weekday) === key && proposal.title === block.title &&
            proposal.start_time.slice(0, 5) === String(block.start_time || '').slice(0, 5) &&
            proposal.end_time.slice(0, 5) === String(block.end_time || '').slice(0, 5) &&
            proposal.modality === block.modality
          );
          const teamEvent = storedTeamEvent || (scheduledProposal ? {
            team_name: team.name,
            modality: scheduledProposal.modality,
            description: scheduledProposal.description || block.description || 'Scheduled for ' + team.name
          } : null);
          members[index].busy[key].push([
            start,
            end,
            teamEvent ? block.title || teamEvent.title || 'Team commitment' : showOwnerDetails ? block.title || 'Busy' : 'Busy',
            teamEvent ? teamEvent.description || block.description || '' : showOwnerDetails ? block.description || '' : '',
            teamEvent ? 'commitment' : 'shared',
            teamEvent ? teamEvent.modality || block.modality || '' : showOwnerDetails ? block.modality || '' : ''
          ]);
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
      if (key && start !== null && end !== null) events[key].push([start, end, event.title, event.description || '', 'team', event.modality || '']);
    });

    const sharedSchedule = await db.query(
      'SELECT s.id, sh.show_details FROM schedule_shares sh ' +
      'JOIN schedules s ON s.id = sh.schedule_id ' +
      "WHERE sh.shared_with_group_id = $1 AND sh.shared_with_user_id IS NULL AND sh.deleted_at IS NULL AND sh.permission = 'read' " +
      'AND s.owner_user_id = $2 AND s.group_id IS NULL AND s.deleted_at IS NULL ORDER BY sh.updated_at DESC LIMIT 1',
      [teamId, userId]
    );

    return {
      id: team.id,
      name: team.name,
      code: team.group_code,
      role: normalizeRole(team.role),
      isAdmin: team.role === 'owner' || team.role === 'admin',
      isCreator: team.owner_user_id === userId,
      sharedScheduleId: sharedSchedule.rows.length ? sharedSchedule.rows[0].id : null,
      sharedScheduleDetails: sharedSchedule.rows.length ? sharedSchedule.rows[0].show_details === true : false,
      members,
      events,
      proposals: proposalRows.rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description || '',
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

  /** List teams visible to a user. @param {string} userId @param {object} [options] @returns {Promise<Array<object>>} @throws {Error} */
  async function listTeams(userId, options = {}) {
    const result = await db.query(
      'SELECT g.id FROM groups g JOIN memberships m ON m.group_id = g.id ' +
      'WHERE m.user_id = $1 AND m.deleted_at IS NULL AND g.deleted_at IS NULL ORDER BY g.name, g.id',
      [userId]
    );
    const teams = [];
    for (const row of result.rows) teams.push(await getTeam(row.id, userId, options));
    return teams;
  }

  /** Create a team owned by a user. @param {string} userId @param {object} input @returns {Promise<object>} @throws {Error} */
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

  /** Join a team using its invitation code. @param {string} userId @param {string} rawCode @param {string|null} requestedScheduleId @returns {Promise<object>} @throws {Error} */
  async function joinTeam(userId, rawCode, requestedScheduleId) {
    const code = validText(rawCode, 'Team code', 32).toUpperCase();
    if (!/^SCH-[A-F0-9]{4}$/.test(code)) throw httpError(404, 'Team not found.');
    if (requestedScheduleId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedScheduleId)) {
      throw httpError(400, 'schedule_id must be a valid UUID.');
    }
    const client = await db.connect();
    let teamId;
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT id FROM groups WHERE group_code = $1 AND deleted_at IS NULL FOR UPDATE', [code]);
      if (!result.rows.length) throw httpError(404, 'Team not found.');
      teamId = result.rows[0].id;
      if (requestedScheduleId) {
        const schedule = await client.query(
          'SELECT id FROM schedules WHERE id = $1 AND owner_user_id = $2 AND group_id IS NULL AND deleted_at IS NULL FOR SHARE',
          [requestedScheduleId, userId]
        );
        if (!schedule.rows.length) throw httpError(404, 'Personal schedule not found.');
      }
      const joined = await client.query(
        "INSERT INTO memberships (group_id, user_id, role) VALUES ($1, $2, 'member') " +
        "ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'member', deleted_at = NULL, updated_at = CURRENT_TIMESTAMP " +
        'WHERE memberships.deleted_at IS NOT NULL RETURNING id',
        [teamId, userId]
      );
      if (!joined.rows.length) throw httpError(409, 'You are already a member of this team.');
      if (requestedScheduleId) {
        const existingShare = await client.query(
          'SELECT id FROM schedule_shares WHERE schedule_id = $1 AND shared_with_user_id IS NULL AND shared_with_group_id = $2 FOR UPDATE',
          [requestedScheduleId, teamId]
        );
        if (existingShare.rows.length) {
          await client.query("UPDATE schedule_shares SET permission = 'read', deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [existingShare.rows[0].id]);
        } else {
          await client.query("INSERT INTO schedule_shares (schedule_id, shared_with_group_id, permission) VALUES ($1, $2, 'read')", [requestedScheduleId, teamId]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return getTeam(teamId, userId);
  }

  /** Set or clear the current user's shared team schedule. @param {string} teamId @param {string} userId @param {string|null} requestedScheduleId @returns {Promise<object>} @throws {Error} */
  async function setSharedSchedule(teamId, userId, requestedScheduleId) {
    const scheduleId = requestedScheduleId || null;
    if (scheduleId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scheduleId)) {
      throw httpError(400, 'schedule_id must be a valid UUID.');
    }
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await getMembership(teamId, userId, client);
      if (scheduleId) {
        const schedule = await client.query(
          'SELECT id FROM schedules WHERE id = $1 AND owner_user_id = $2 AND group_id IS NULL AND deleted_at IS NULL FOR SHARE',
          [scheduleId, userId]
        );
        if (!schedule.rows.length) throw httpError(404, 'Personal schedule not found.');
      }
      await client.query(
        'UPDATE schedule_shares sh SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP ' +
        'FROM schedules s WHERE s.id = sh.schedule_id AND s.owner_user_id = $2 ' +
        'AND sh.shared_with_group_id = $1 AND sh.shared_with_user_id IS NULL AND sh.deleted_at IS NULL',
        [teamId, userId]
      );
      if (scheduleId) {
        const existing = await client.query(
          'SELECT id FROM schedule_shares WHERE schedule_id = $1 AND shared_with_user_id IS NULL AND shared_with_group_id = $2 ORDER BY updated_at DESC LIMIT 1 FOR UPDATE',
          [scheduleId, teamId]
        );
        if (existing.rows.length) {
          await client.query(
            "UPDATE schedule_shares SET permission = 'read', deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            [existing.rows[0].id]
          );
        } else {
          await client.query(
            "INSERT INTO schedule_shares (schedule_id, shared_with_group_id, permission) VALUES ($1, $2, 'read')",
            [scheduleId, teamId]
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return getTeam(teamId, userId);
  }

  /** Change whether teammates can view shared schedule details. @param {string} teamId @param {string} userId @param {boolean} showDetails @returns {Promise<object>} @throws {Error} */
  async function setSharedScheduleDetails(teamId, userId, showDetails) {
    if (typeof showDetails !== 'boolean') throw httpError(400, 'show_details must be a boolean.');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await getMembership(teamId, userId, client);
      const updated = await client.query(
        'UPDATE schedule_shares sh SET show_details = $3, updated_at = CURRENT_TIMESTAMP ' +
        'FROM schedules s WHERE s.id = sh.schedule_id AND s.owner_user_id = $2 ' +
        'AND s.deleted_at IS NULL AND s.group_id IS NULL ' +
        'AND sh.shared_with_group_id = $1 AND sh.shared_with_user_id IS NULL ' +
        "AND sh.permission = 'read' AND sh.deleted_at IS NULL RETURNING sh.id",
        [teamId, userId, showDetails]
      );
      if (!updated.rowCount) throw httpError(409, 'Share one of your schedules with this team before changing its detail visibility.');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
    return getTeam(teamId, userId);
  }

  /** Rename a team after checking the caller's role. @param {string} teamId @param {string} userId @param {object} input @returns {Promise<object>} @throws {Error} */
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

  /** Replace a team's join code. @param {string} teamId @param {string} userId @returns {Promise<object>} @throws {Error} */
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

  /** Change a member's team role while enforcing creator safeguards. @param {string} teamId @param {string} actorId @param {string} targetId @param {string} requestedRole @returns {Promise<object>} @throws {Error} */
  async function changeMemberRole(teamId, actorId, targetId, requestedRole) {
    await requireAdmin(teamId, actorId);
    if (!['admin', 'member'].includes(requestedRole)) throw httpError(400, 'Role must be admin or member.');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const targetResult = await client.query(
        'SELECT g.owner_user_id, m.role FROM groups g ' +
        'JOIN memberships m ON m.group_id = g.id ' +
        'WHERE g.id = $1 AND g.deleted_at IS NULL AND m.user_id = $2 AND m.deleted_at IS NULL ' +
        'FOR UPDATE OF g, m',
        [teamId, targetId]
      );
      if (!targetResult.rows.length) throw httpError(404, 'Team member not found.');
      if (targetResult.rows[0].owner_user_id === targetId) {
        throw httpError(403, 'The team creator cannot be demoted by an admin.');
      }
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
          await client.query("UPDATE memberships SET role = 'owner' WHERE group_id = $1 AND user_id = $2", [teamId, nextOwner.user_id]);
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

  /** Remove a member from a team. @param {string} teamId @param {string} actorId @param {string} targetId @returns {Promise<object>} @throws {Error} */
  async function removeMember(teamId, actorId, targetId) {
    const actor = await requireAdmin(teamId, actorId);
    if (actorId === targetId) throw httpError(400, 'Use Leave team to remove yourself.');
    if (actor.owner_user_id === targetId) throw httpError(403, 'The team creator cannot be removed by an admin.');
    return removeMembership(teamId, targetId);
  }

  async function deleteTeamData(client, teamId) {
    await client.query('DELETE FROM team_proposals WHERE group_id = $1', [teamId]);
    await client.query('DELETE FROM team_events WHERE group_id = $1', [teamId]);
    await client.query(
      'UPDATE invitations SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP ' +
      'WHERE group_id = $1 AND deleted_at IS NULL',
      [teamId]
    );
    await client.query(
      'UPDATE schedule_shares SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP ' +
      'WHERE shared_with_group_id = $1 AND deleted_at IS NULL',
      [teamId]
    );
    await client.query(
      'UPDATE schedules SET group_id = NULL, updated_at = CURRENT_TIMESTAMP ' +
      'WHERE group_id = $1 AND deleted_at IS NULL',
      [teamId]
    );
    await client.query(
      'UPDATE memberships SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP ' +
      'WHERE group_id = $1 AND deleted_at IS NULL',
      [teamId]
    );
    await client.query(
      'UPDATE groups SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP ' +
      'WHERE id = $1 AND deleted_at IS NULL',
      [teamId]
    );
  }

  /** Delete team data when called by its creator. @param {string} teamId @param {string} userId @returns {Promise<object>} @throws {Error} */
  async function deleteTeam(teamId, userId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'SELECT g.owner_user_id FROM groups g ' +
        'JOIN memberships m ON m.group_id = g.id ' +
        'WHERE g.id = $1 AND g.deleted_at IS NULL AND m.user_id = $2 AND m.deleted_at IS NULL ' +
        'FOR UPDATE OF g, m',
        [teamId, userId]
      );
      if (!result.rows.length) throw httpError(404, 'Team not found.');
      if (result.rows[0].owner_user_id !== userId) {
        throw httpError(403, 'Only the team creator can delete this team.');
      }
      await deleteTeamData(client, teamId);
      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async function removeMembership(teamId, targetId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const group = await client.query('SELECT owner_user_id FROM groups WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [teamId]);
      if (!group.rows.length) throw httpError(404, 'Team not found.');
      const active = await client.query(
        'SELECT m.user_id, m.role, COALESCE(p.display_name, u.email) AS member_name ' +
        'FROM memberships m JOIN users u ON u.id = m.user_id ' +
        'LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL ' +
        'WHERE m.group_id = $1 AND m.deleted_at IS NULL AND u.deleted_at IS NULL ' +
        "ORDER BY CASE WHEN m.role IN ('owner','admin') THEN 0 ELSE 1 END, LOWER(COALESCE(p.display_name, u.email)), m.user_id FOR UPDATE OF m",
        [teamId]
      );
      const target = active.rows.find(member => member.user_id === targetId);
      if (!target) throw httpError(404, 'Team member not found.');
      const lastMemberLeaves = active.rows.length === 1;
      const creatorLeaves = group.rows[0].owner_user_id === targetId || target.role === 'owner';
      if (creatorLeaves && !lastMemberLeaves) {
        const successor = active.rows.find(member => member.user_id !== targetId);
        await client.query('UPDATE groups SET owner_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [successor.user_id, teamId]);
        await client.query("UPDATE memberships SET role = 'owner', updated_at = CURRENT_TIMESTAMP WHERE group_id = $1 AND user_id = $2", [teamId, successor.user_id]);
      } else if (target.role === 'admin' && !lastMemberLeaves) {
        const admins = active.rows.filter(member => member.role === 'owner' || member.role === 'admin');
        if (admins.length <= 1) throw httpError(409, 'Promote another admin before removing the last admin.');
      }
      await client.query(
        'UPDATE memberships SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP ' +
        'WHERE group_id = $1 AND user_id = $2',
        [teamId, targetId]
      );
      if (lastMemberLeaves) await deleteTeamData(client, teamId);
      await client.query('COMMIT');
      return { success: true, teamDeleted: lastMemberLeaves };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  /** Leave a team and clean up final membership when necessary. @param {string} teamId @param {string} userId @returns {Promise<object>} @throws {Error} */
  async function leaveTeam(teamId, userId) {
    await getMembership(teamId, userId);
    return removeMembership(teamId, userId);
  }

  /** List privacy-filtered preferences for authorized team members. @param {string} teamId @param {string} userId @returns {Promise<object>} @throws {Error} */
  async function listMemberPreferences(teamId, userId) {
    const team = await getMembership(teamId, userId);
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
        isCreator: row.user_id === team.owner_user_id,
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
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    if (description.length > 1000) throw httpError(400, 'Description must be 1000 characters or fewer.');
    if (!DAYS.includes(input.weekday)) throw httpError(400, 'Weekday must be a day from Monday to Sunday.');
    const start = normalizeTime(input.start_time, 'start_time');
    const end = normalizeTime(input.end_time, 'end_time');
    if (minutes(end) <= minutes(start)) throw httpError(400, 'end_time must be later than start_time.');
    if (!['onsite', 'online'].includes(input.modality)) throw httpError(400, 'Modality must be onsite or online.');
    return { title, description, weekday: input.weekday, start, end, modality: input.modality };
  }

  async function addProposalToSharedSchedule(client, teamId, userId, teamName, proposal, rejectConflicts = false, proposalId = null) {
    const sharedSchedule = await client.query(
      'SELECT s.id, COALESCE(sc.context, \'[]\'::jsonb) AS configuration ' +
      'FROM schedule_shares sh JOIN schedules s ON s.id = sh.schedule_id ' +
      'LEFT JOIN schedule_context sc ON sc.schedule_id = s.id AND sc.deleted_at IS NULL ' +
      "WHERE sh.shared_with_group_id = $1 AND sh.shared_with_user_id IS NULL AND sh.deleted_at IS NULL AND sh.permission = 'read' " +
      'AND s.owner_user_id = $2 AND s.group_id IS NULL AND s.deleted_at IS NULL ' +
      'ORDER BY sh.updated_at DESC LIMIT 1 FOR UPDATE OF s',
      [teamId, userId]
    );
    if (!sharedSchedule.rows.length) {
      throw httpError(409, 'Share a personal schedule with this team before creating or accepting a proposal.');
    }
    const schedule = sharedSchedule.rows[0];
    let configuration = schedule.configuration;
    if (typeof configuration === 'string') {
      try { configuration = JSON.parse(configuration); } catch { configuration = null; }
    }
    if (!Array.isArray(configuration)) throw httpError(503, 'Your shared schedule configuration could not be read.');
    const startTime = proposal.start || proposal.start_time.slice(0, 5);
    const endTime = proposal.end || proposal.end_time.slice(0, 5);
    const alreadySavedBlock = configuration.find(block => block &&
      block.title === proposal.title &&
      Array.isArray(block.weekdays) && block.weekdays.some(day => String(day).toLowerCase() === proposal.weekday.toLowerCase()) &&
      typeof block.start_time === 'string' && block.start_time.slice(0, 5) === startTime &&
      typeof block.end_time === 'string' && block.end_time.slice(0, 5) === endTime &&
      block.modality === proposal.modality
    );
    const alreadySaved = Boolean(alreadySavedBlock);
    if (rejectConflicts && !alreadySaved) {
      const startHour = timeToHour(startTime);
      const endHour = timeToHour(endTime);
      const conflictingBlock = configuration.find(block => {
        if (!block || !Array.isArray(block.weekdays) ||
          !block.weekdays.some(day => String(day).toLowerCase() === proposal.weekday.toLowerCase())) return false;
        const blockStart = timeToHour(block.start_time);
        const blockEnd = timeToHour(block.end_time);
        return blockStart !== null && blockEnd !== null && blockEnd > blockStart &&
          startHour < blockEnd && endHour > blockStart;
      });
      if (conflictingBlock) {
        throw httpError(409, 'Schedule conflict: this proposal overlaps with "' +
          String(conflictingBlock.title || 'another block') + '" on your shared schedule.');
      }
      const teamEvents = await client.query(
        'SELECT title, start_time::text, end_time::text FROM team_events WHERE group_id = $1 AND weekday = $2',
        [teamId, proposal.weekday]
      );
      const conflictingEvent = teamEvents.rows.find(event => {
        const eventStart = timeToHour(event.start_time);
        const eventEnd = timeToHour(event.end_time);
        return eventStart !== null && eventEnd !== null && eventEnd > eventStart &&
          startHour < eventEnd && endHour > eventStart;
      });
      if (conflictingEvent) {
        throw httpError(409, 'Schedule conflict: this proposal overlaps with "' +
          String(conflictingEvent.title || 'a team event') + '" on the team schedule.');
      }
    }
    const scheduledBlock = alreadySavedBlock || {
      title: proposal.title,
      description: proposal.description || 'Commitment for ' + teamName,
      weekdays: [proposal.weekday],
      start_time: startTime,
      end_time: endTime,
      modality: proposal.modality
    };
    scheduledBlock.team_event = {
      type: 'commitment',
      proposal_id: proposalId,
      team_id: teamId,
      team_name: teamName,
      title: proposal.title,
      description: proposal.description || scheduledBlock.description,
      weekday: proposal.weekday,
      start_time: startTime,
      end_time: endTime,
      modality: proposal.modality
    };
    if (!alreadySaved) configuration.push(scheduledBlock);
    await client.query(
      'INSERT INTO schedule_context (schedule_id, context) VALUES ($1, $2::jsonb) ' +
      'ON CONFLICT (schedule_id) DO UPDATE SET context = EXCLUDED.context, updated_at = CURRENT_TIMESTAMP, deleted_at = NULL',
      [schedule.id, JSON.stringify(configuration)]
    );
    return schedule.id;
  }

  /** Create a weekly time proposal for a team. @param {string} teamId @param {string} userId @param {object} input @returns {Promise<object>} @throws {Error} */
  async function createProposal(teamId, userId, input) {
    const proposal = validateProposal(input);
    const client = await db.connect();
    let proposalId;
    try {
      await client.query('BEGIN');
      const membership = await getMembership(teamId, userId, client);
      const result = await client.query(
        'INSERT INTO team_proposals (group_id, proposed_by_user_id, title, description, weekday, start_time, end_time, modality) ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [teamId, userId, proposal.title, proposal.description || null, proposal.weekday, proposal.start, proposal.end, proposal.modality]
      );
      proposalId = result.rows[0].id;
      await addProposalToSharedSchedule(client, teamId, userId, membership.name, proposal, true, proposalId);
      await client.query(
        "INSERT INTO proposal_responses (proposal_id, user_id, response) VALUES ($1,$2,'accept')",
        [proposalId, userId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return { proposal: {
      id: proposalId,
      title: proposal.title,
      description: proposal.description,
      weekday: proposal.weekday,
      start_time: proposal.start,
      end_time: proposal.end,
      modality: proposal.modality,
      status: 'pending',
      current_user_response: 'accept',
      response_count: 1
    } };
  }

  /** Record a member's response to a proposal. @param {string} teamId @param {string} userId @param {string} proposalId @param {string} response @returns {Promise<object>} @throws {Error} */
  async function respondToProposal(teamId, userId, proposalId, response) {
    if (!['accept', 'decline'].includes(response)) throw httpError(400, 'Response must be accept or decline.');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const membership = await getMembership(teamId, userId, client);
      const proposalResult = await client.query(
        'SELECT * FROM team_proposals WHERE id = $1 AND group_id = $2 FOR UPDATE',
        [proposalId, teamId]
      );
      if (!proposalResult.rows.length) throw httpError(404, 'Proposal not found.');
      const proposal = proposalResult.rows[0];
      if (proposal.status !== 'pending') throw httpError(409, 'This proposal is no longer pending.');
      const previousResponse = await client.query(
        'SELECT response FROM proposal_responses WHERE proposal_id = $1 AND user_id = $2',
        [proposalId, userId]
      );
      if (previousResponse.rows.length) throw httpError(409, 'You have already reviewed this proposal.');

      let scheduleId = null;
      if (response === 'decline') {
        await client.query('DELETE FROM team_proposals WHERE id = $1 AND group_id = $2', [proposalId, teamId]);
      } else {
        scheduleId = await addProposalToSharedSchedule(client, teamId, userId, membership.name, proposal, true, proposal.id);
        await client.query(
          'INSERT INTO proposal_responses (proposal_id, user_id, response) VALUES ($1,$2,$3)',
          [proposalId, userId, response]
        );
      }
      await client.query('COMMIT');
      return { success: true, status: response === 'accept' ? 'accepted' : 'rejected', schedule_id: scheduleId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  return {
    listTeams, getTeam, createTeam, joinTeam, setSharedSchedule, setSharedScheduleDetails, renameTeam, regenerateCode,
    changeMemberRole, removeMember, leaveTeam, deleteTeam, listMemberPreferences,
    createProposal, respondToProposal
  };
}

module.exports = createTeamsService;
