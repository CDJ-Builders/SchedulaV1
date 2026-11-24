const { pool } = require('../config/database');
const env = require('../config/env');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const BINS = ['0708', '0810', '1012', '1214', '1416', '1618', '1820', '2022', '2224'];

function errorWithStatus(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validateMeeting(body) {
  if (!body || Object.keys(body).some(key => !['meeting', 'limit'].includes(key))) {
    throw errorWithStatus('Only meeting and limit may be provided; schedule context is loaded by the server.', 422);
  }
  const meeting = body?.meeting;
  if (!meeting || Object.keys(meeting).some(key => !['duration_minutes', 'modality', 'type'].includes(key))) {
    throw errorWithStatus('meeting must contain only duration_minutes, modality, and type.', 422);
  }
  const duration = meeting?.duration_minutes;
  if (!Number.isInteger(duration) || duration < 60 || duration > 900 || duration % 60 !== 0) {
    throw errorWithStatus('duration_minutes must be a whole number of hours from 60 to 900', 422);
  }
  if (!['onsite', 'online'].includes(meeting.modality)) {
    throw errorWithStatus('modality must be onsite or online', 422);
  }
  if (!['project', 'event', 'meeting'].includes(meeting.type)) {
    throw errorWithStatus('type must be project, event, or meeting', 422);
  }
  const limit = body.limit === undefined ? 5 : body.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw errorWithStatus('limit must be an integer from 1 to 20', 422);
  }
  return { meeting: { duration_minutes: duration, modality: meeting.modality, type: meeting.type }, limit };
}

function parseClock(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function markWeeklyBlock(grid, block, warnings) {
  const start = parseClock(block?.start_time);
  const end = parseClock(block?.end_time);
  if (start === null || end === null || end <= start || !Array.isArray(block.weekdays)) {
    warnings.push('A weekly block with unsupported or invalid time data was excluded.');
    return;
  }
  if (start % 60 || end % 60) warnings.push('A partial-hour weekly block was conservatively rounded up to occupied hours.');
  // Match scheduleService.normalizeConfiguration for legacy blocks. Persisted
  // weekly blocks without a modality have historically defaulted to onsite.
  const modality = typeof block.modality === 'string' ? block.modality : 'onsite';
  if (typeof block.modality !== 'string') {
    warnings.push('A legacy weekly block had no modality and was treated as onsite, matching Schedula’s existing default.');
  }
  let cell = 'ON';
  if (modality === 'online') cell = 'OL';
  else if (modality === 'onsite' || modality === 'in_person') cell = 'ON';
  else throw errorWithStatus('Only onsite or online weekly blocks can be used for recommendations.', 422);

  for (const weekday of block.weekdays) {
    const index = DAYS.indexOf(weekday);
    if (index < 0) {
      if (weekday === 'Sunday') warnings.push('Sunday blocks are outside the model grid and were excluded.');
      continue;
    }
    const day = DAY_CODES[index];
    const clippedStart = Math.max(start, 7 * 60);
    const clippedEnd = Math.min(end, 22 * 60);
    if (start < 7 * 60 || end > 22 * 60) warnings.push('Weekly block time outside 07:00–22:00 was excluded from the model grid.');
    for (let slot = Math.floor(clippedStart / 60); slot < Math.ceil(clippedEnd / 60); slot += 1) {
      if (slot >= 7 && slot < 22) {
        const offset = slot - 7;
        if (grid[day][offset] === 'OF' || cell === 'ON') grid[day][offset] = cell;
      }
    }
  }
}

function ensureWeeklyOnlyAvailability(blocks) {
  if (blocks.length) {
    throw errorWithStatus('Upcoming dated busy availability cannot be represented by the weekly model. Recommendations are unavailable until those blocks end.', 503);
  }
}

function requireConfirmedPreferences(pref) {
  const missing = [];
  const breakMinutes = Number(pref.preferred_break_minutes);
  if (!Number.isFinite(breakMinutes) || breakMinutes < 0 || breakMinutes > 1440) missing.push('preferred_break_minutes (apply migration 005)');
  if (missing.length) {
    throw errorWithStatus(`Smart scheduling preference mapping needs confirmation: ${missing.join(', ')}.`, 503);
  }

  const rawCommute = Number(pref.commute_time || 0);
  const commuteMinutes = rawCommute; // Both setup and profile label commute_time in minutes.
  const rawTolerance = Number(pref.max_back_to_back || 0);
  if (!Number.isFinite(commuteMinutes) || commuteMinutes < 0 || !Number.isFinite(rawTolerance) || rawTolerance < 0 || rawTolerance > 6) {
    throw errorWithStatus('Stored scheduling preferences are outside the confirmed model input range.', 503);
  }
  const prefModality = ({ onsite: 'Onsite', online: 'Online', 'no preference': 'No Preference' })[pref.preferred_modality];
  if (!prefModality) throw errorWithStatus('Stored preferred modality is not supported by the recommendation model.', 503);

  const preferredDays = {};
  const avoidedDays = {};
  for (let index = 0; index < DAYS.length; index += 1) {
    const day = DAY_CODES[index];
    const suffix = day === 'thu' ? 'Thurs' : DAYS[index].slice(0, 3);
    preferredDays[day] = pref[`Pref${suffix}`] === true;
    avoidedDays[day] = pref[`Avoid${suffix}`] === true;
  }
  const preferredTimeBins = Object.fromEntries(BINS.map(bin => [bin, pref[`pref_time_${bin}`] === true]));
  const avoidedTimeBins = Object.fromEntries(BINS.map(bin => [bin, pref[`avoid_time_${bin}`] === true]));

  return {
    commute_minutes: commuteMinutes,
    preferred_break_minutes: breakMinutes,
    back_to_back_tolerance: rawTolerance,
    preferred_modality: prefModality,
    preferred_days: preferredDays,
    avoided_days: avoidedDays,
    preferred_time_bins: preferredTimeBins,
    avoided_time_bins: avoidedTimeBins
  };
}

async function loadPreferences(userId) {
  const result = await pool.query(
    `SELECT pref_time_0708, pref_time_0810, pref_time_1012, pref_time_1214,
            pref_time_1416, pref_time_1618, pref_time_1820, pref_time_2022, pref_time_2224,
            "PrefMon", "PrefTue", "PrefWed", "PrefThurs", "PrefFri", "PrefSat",
            avoid_time_0708, avoid_time_0810, avoid_time_1012, avoid_time_1214,
            avoid_time_1416, avoid_time_1618, avoid_time_1820, avoid_time_2022, avoid_time_2224,
            "AvoidMon", "AvoidTue", "AvoidWed", "AvoidThurs", "AvoidFri", "AvoidSat",
            max_back_to_back, commute_time, preferred_break_minutes, preferred_modality
       FROM preferences WHERE user_id = $1`,
    [userId]
  );
  return requireConfirmedPreferences(result.rows[0] || {});
}

function buildConsolidatedTeamContext(memberSchedules, teamEvents) {
  const grid = Object.fromEntries(DAY_CODES.map(day => [day, Array(15).fill('OF')]));
  const warnings = [];
  const memberIds = new Set(memberSchedules.map(row => row.user_id));
  const coveredMemberIds = new Set();

  memberSchedules.forEach(row => {
    if (row.schedule_id) coveredMemberIds.add(row.user_id);
    let blocks = row.configuration ?? row.context;
    if (typeof blocks === 'string') {
      try { blocks = JSON.parse(blocks); } catch { blocks = null; }
    }
    if (blocks == null) return;
    if (!Array.isArray(blocks)) {
      warnings.push('A shared schedule had an unsupported configuration and was excluded.');
      return;
    }
    blocks.forEach(block => markWeeklyBlock(grid, block, warnings));
  });

  if (coveredMemberIds.size < memberIds.size) {
    warnings.push('Some team members have not shared a schedule; recommendations use only schedules shared with the team.');
  }
  teamEvents.forEach(event => markWeeklyBlock(grid, {
    weekdays: [event.weekday],
    start_time: event.start_time,
    end_time: event.end_time,
    modality: event.modality
  }, warnings));

  return { occupancy: grid, warnings: [...new Set(warnings)].slice(0, 20) };
}

async function buildContext(userId, scheduleId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scheduleId)) {
    throw errorWithStatus('Schedule not found', 404);
  }
  const scheduleResult = await pool.query(
    `SELECT s.id, s.timezone, COALESCE(sc.context, '[]'::jsonb) AS configuration
       FROM schedules s
       LEFT JOIN schedule_context sc ON sc.schedule_id = s.id AND sc.deleted_at IS NULL
      WHERE s.id = $1 AND s.owner_user_id = $2 AND s.deleted_at IS NULL`,
    [scheduleId, userId]
  );
  if (!scheduleResult.rows.length) throw errorWithStatus('Schedule not found', 404);
  const schedule = scheduleResult.rows[0];
  const grid = Object.fromEntries(DAY_CODES.map(day => [day, Array(15).fill('OF')]));
  const warnings = [];
  const blocks = Array.isArray(schedule.configuration) ? schedule.configuration : [];
  blocks.forEach(block => markWeeklyBlock(grid, block, warnings));

  const datedEvents = await pool.query(
    `SELECT id FROM events
      WHERE schedule_id = $1 AND owner_user_id = $2 AND deleted_at IS NULL
        AND (end_at > CURRENT_TIMESTAMP OR recurrence_rule IS NOT NULL)`,
    [scheduleId, userId]
  );
  if (datedEvents.rows.length) {
    throw errorWithStatus('Upcoming or recurring dated events cannot be represented safely by the weekly model. Convert them to canonical weekly blocks or request suggestions after they end.', 503);
  }

  const busy = await pool.query(
    `SELECT start_at, end_at, timezone FROM availability_blocks
      WHERE user_id = $1 AND availability_type = 'busy' AND deleted_at IS NULL
        AND end_at > CURRENT_TIMESTAMP
      ORDER BY start_at LIMIT 101`,
    [userId]
  );
  if (busy.rows.length > 100) {
    throw errorWithStatus('Too many upcoming busy availability blocks to map safely; recommendations are temporarily unavailable.', 503);
  }
  ensureWeeklyOnlyAvailability(busy.rows);

  return {
    occupancy: grid,
    preferences: await loadPreferences(userId),
    warnings: [...new Set(warnings)].slice(0, 20)
  };
}

async function buildTeamContext(userId, teamId) {
  const membership = await pool.query(
    'SELECT g.id FROM groups g JOIN memberships m ON m.group_id = g.id ' +
    'WHERE g.id = $1 AND g.deleted_at IS NULL AND m.user_id = $2 AND m.deleted_at IS NULL',
    [teamId, userId]
  );
  if (!membership.rows.length) throw errorWithStatus('Team not found', 404);

  const memberSchedules = await pool.query(
    'SELECT m.user_id, s.id AS schedule_id, COALESCE(sc.context, \'[]\'::jsonb) AS configuration ' +
    'FROM memberships m JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL ' +
    'LEFT JOIN schedule_shares sh ON sh.shared_with_group_id = m.group_id ' +
    "AND sh.shared_with_user_id IS NULL AND sh.deleted_at IS NULL AND sh.permission = 'read' " +
    'LEFT JOIN schedules s ON s.id = sh.schedule_id AND s.owner_user_id = m.user_id ' +
    'AND s.group_id IS NULL AND s.deleted_at IS NULL ' +
    'LEFT JOIN schedule_context sc ON sc.schedule_id = s.id AND sc.deleted_at IS NULL ' +
    'WHERE m.group_id = $1 AND m.deleted_at IS NULL ORDER BY m.user_id, s.id',
    [teamId]
  );
  const scheduleIds = [...new Set(memberSchedules.rows.map(row => row.schedule_id).filter(Boolean))];
  if (scheduleIds.length) {
    const datedEvents = await pool.query(
      'SELECT id FROM events WHERE schedule_id = ANY($1::uuid[]) AND deleted_at IS NULL ' +
      'AND (end_at > CURRENT_TIMESTAMP OR recurrence_rule IS NOT NULL) LIMIT 1',
      [scheduleIds]
    );
    if (datedEvents.rows.length) {
      throw errorWithStatus('A shared team schedule contains upcoming dated events that the weekly model cannot represent. Convert them to weekly blocks or request suggestions after they end.', 503);
    }
  }
  const teamEvents = await pool.query(
    'SELECT weekday, start_time::text, end_time::text, modality FROM team_events ' +
    'WHERE group_id = $1 ORDER BY weekday, start_time',
    [teamId]
  );
  return buildConsolidatedTeamContext(memberSchedules.rows, teamEvents.rows);
}

function validateServiceResponse(response, durationMinutes) {
  if (!response || !Array.isArray(response.recommendations) || !response.model || typeof response.model.name !== 'string' || typeof response.model.version !== 'string' || !Array.isArray(response.warnings) || !response.warnings.every(message => typeof message === 'string')) {
    throw errorWithStatus('Recommendation service returned an invalid response', 503);
  }
  const singleCandidateWarning = response.recommendations.length === 1
    && response.warnings.some(message => typeof message === 'string' && message.includes('Only one feasible candidate'));
  for (const item of response.recommendations) {
    const start = /^\d{2}:00$/.test(item.start_time) ? Number(item.start_time.slice(0, 2)) : -1;
    const end = /^\d{2}:00$/.test(item.end_time) ? Number(item.end_time.slice(0, 2)) : -1;
    const validScore = typeof item.score === 'number' && Number.isFinite(item.score);
    const safeSingleCandidate = singleCandidateWarning && item.score === null;
    if (!DAYS.includes(item.weekday) || start < 7 || end > 22 || end <= start || end - start !== durationMinutes / 60 || (!validScore && !safeSingleCandidate)) {
      throw errorWithStatus('Recommendation service returned an invalid candidate', 503);
    }
  }
  return response;
}

async function requestRecommendations(context, meeting, limit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.SCHEDULAML_TIMEOUT_MS);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (env.SCHEDULAML_API_KEY) headers['X-SchedulaML-Key'] = env.SCHEDULAML_API_KEY;
    const response = await fetch(`${env.SCHEDULAML_URL.replace(/\/$/, '')}/rank`, {
      method: 'POST', headers, signal: controller.signal,
      body: JSON.stringify({ context, meeting, limit })
    });
    if (!response.ok) throw errorWithStatus('Scheduling recommendations are temporarily unavailable', 503);
    return validateServiceResponse(await response.json(), meeting.duration_minutes);
  } catch (error) {
    if (error.status) throw error;
    throw errorWithStatus('Scheduling recommendations are temporarily unavailable', 503);
  } finally {
    clearTimeout(timeout);
  }
}

async function recommend(userId, scheduleId, body) {
  if (!env.SMART_SCHEDULE_ENABLED) throw errorWithStatus('Smart scheduling is currently unavailable', 503);
  const { meeting, limit } = validateMeeting(body);
  const context = await buildContext(userId, scheduleId);
  return requestRecommendations(context, meeting, limit);
}

async function recommendForTeam(userId, teamId, body) {
  if (!env.SMART_SCHEDULE_ENABLED) throw errorWithStatus('Smart scheduling is currently unavailable', 503);
  const { meeting, limit } = validateMeeting(body);
  const context = await buildTeamContext(userId, teamId);
  context.preferences = await loadPreferences(userId);
  const response = await requestRecommendations(context, meeting, limit);
  response.warnings = [...new Set([...context.warnings, ...response.warnings])].slice(0, 20);
  return response;
}

module.exports = {
  recommend, recommendForTeam, validateMeeting, validateServiceResponse, requestRecommendations,
  markWeeklyBlock, ensureWeeklyOnlyAvailability, buildContext, buildTeamContext, buildConsolidatedTeamContext
};
