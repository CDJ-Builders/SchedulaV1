const { pool } = require('../config/database');

const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
const REQUEST_TYPES = new Set(['meeting_request', 'smart_schedule_request']);
const TIMES_OF_DAY = new Set(['morning', 'afternoon', 'evening']);

function requestError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw requestError('request body must be an object');
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const sourceText = typeof input.source_text === 'string' ? input.source_text.trim() : '';
  const durationMinutes = Number(input.duration_minutes);
  const weekdays = input.weekdays === undefined ? [] : input.weekdays;

  if (!REQUEST_TYPES.has(input.request_type)) throw requestError('request_type is invalid');
  if (!title || title.length > 160) throw requestError('title is required and must be at most 160 characters');
  if (!sourceText || sourceText.length > 1000) throw requestError('source_text is required and must be at most 1000 characters');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
    throw requestError('duration_minutes must be between 1 and 1440');
  }
  if (!Array.isArray(weekdays) || weekdays.some(day => !WEEKDAYS.has(day))) {
    throw requestError('weekdays must contain valid weekday names');
  }

  const windowStart = input.window_start || null;
  const windowEnd = input.window_end || null;
  const preferredDate = input.preferred_date || null;
  const preferredStartTime = input.preferred_start_time || null;
  const timeOfDay = input.time_of_day || null;
  if ((windowStart === null) !== (windowEnd === null)
    || (windowStart && (!isValidDate(windowStart) || !isValidDate(windowEnd) || windowEnd < windowStart))) {
    throw requestError('window_start and window_end must be a valid date range');
  }
  if (preferredDate && (!isValidDate(preferredDate) || windowStart)) {
    throw requestError('preferred_date must be valid and cannot be combined with a date range');
  }
  if (preferredStartTime && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(preferredStartTime)) {
    throw requestError('preferred_start_time must be a valid time');
  }
  if (timeOfDay && !TIMES_OF_DAY.has(timeOfDay)) throw requestError('time_of_day is invalid');
  if (input.schedule_id && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.schedule_id)) {
    throw requestError('schedule_id must be a valid UUID');
  }

  return {
    requestType: input.request_type,
    title,
    sourceText,
    durationMinutes,
    windowStart,
    windowEnd,
    preferredDate,
    preferredStartTime,
    timeOfDay,
    weekdays: [...new Set(weekdays)],
    scheduleId: input.schedule_id || null
  };
}

async function listRequests(userId) {
  const result = await pool.query(
    `SELECT id, schedule_id, request_type, title, source_text, duration_minutes,
            window_start::text AS window_start, window_end::text AS window_end,
            preferred_date::text AS preferred_date, preferred_start_time,
            time_of_day, weekdays, created_at, updated_at
       FROM scheduling_requests
      WHERE owner_user_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function createRequest(userId, input) {
  const request = normalizeRequest(input);
  const result = await pool.query(
    `INSERT INTO scheduling_requests (
       owner_user_id, schedule_id, request_type, title, source_text, duration_minutes,
       window_start, window_end, preferred_date, preferred_start_time, time_of_day, weekdays
     )
     SELECT $1, schedule.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
       FROM (SELECT 1) AS seed
       LEFT JOIN schedules AS schedule
         ON schedule.id = $2 AND schedule.owner_user_id = $1 AND schedule.deleted_at IS NULL
      WHERE $2::uuid IS NULL OR schedule.id IS NOT NULL
     RETURNING id, schedule_id, request_type, title, source_text, duration_minutes,
               window_start::text AS window_start, window_end::text AS window_end,
               preferred_date::text AS preferred_date, preferred_start_time,
               time_of_day, weekdays, created_at, updated_at`,
    [
      userId, request.scheduleId, request.requestType, request.title, request.sourceText,
      request.durationMinutes, request.windowStart, request.windowEnd, request.preferredDate,
      request.preferredStartTime, request.timeOfDay, request.weekdays
    ]
  );
  if (!result.rows.length) {
    const error = new Error('Schedule not found');
    error.status = 404;
    throw error;
  }
  return result.rows[0];
}

async function deleteRequest(userId, requestId) {
  const result = await pool.query(
    `UPDATE scheduling_requests
        SET deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL
      RETURNING id`,
    [requestId, userId]
  );
  if (!result.rows.length) {
    const error = new Error('Scheduling request not found');
    error.status = 404;
    throw error;
  }
}

module.exports = { listRequests, createRequest, deleteRequest };
