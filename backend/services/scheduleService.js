const { pool } = require('../config/database');
const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
const BLOCK_OVERRIDE_KEYS = new Set(['color', 'fontColor', 'title', 'description', 'notes']);

function normalizeBlockOverrides(overrides) {
  if (overrides === undefined || overrides === null) return {};
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw configurationError('block overrides must be an object');
  }
  const normalized = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (!BLOCK_OVERRIDE_KEYS.has(key)) throw configurationError(`Unsupported block override: ${key}`);
    if (key === 'color' || key === 'fontColor') {
      if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw configurationError(`${key} must be a six-digit hex color`);
      normalized[key] = value.toLowerCase();
    } else {
      const limit = key === 'title' ? 120 : 240;
      if (typeof value !== 'string' || value.length > limit) throw configurationError(`${key} must be a string of ${limit} characters or fewer`);
      normalized[key] = value;
    }
  }
  return normalized;
}

function configurationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeConfiguration(configuration) {
  if (!Array.isArray(configuration) || !configuration.length) {
    throw configurationError('configuration must contain at least one weekly block');
  }
  return configuration.map((block) => {
    const title = typeof block?.title === 'string' ? block.title.trim() : '';
    const description = typeof block?.description === 'string' ? block.description.trim() : '';
    const notes = block?.notes === undefined ? '' : block.notes;
    if (typeof notes !== 'string' || notes.length > 240) throw configurationError('notes must be a string of 240 characters or fewer');
    const weekdays = Array.isArray(block?.weekdays)
      ? [...new Set(block.weekdays.filter(day => WEEKDAYS.has(day)))]
      : [];
    const startTime = typeof block?.start_time === 'string' ? block.start_time : '';
    const endTime = typeof block?.end_time === 'string' ? block.end_time : '';
    const modality = typeof block?.modality === 'string' ? block.modality : 'onsite';
    const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!title || title.length > 120 || description.length > 240 || weekdays.length !== 1 || !validTime.test(startTime) || !validTime.test(endTime)) {
      throw configurationError('Each weekly block requires title, weekdays, start_time, and end_time');
    }
    if (!['onsite', 'online'].includes(modality)) {
      throw configurationError("modality must be 'onsite' or 'online'");
    }
    if (endTime <= startTime) throw configurationError('end_time must be later than start_time');
    const blockId = typeof block.id === 'string' && /^[\w-]{1,80}$/.test(block.id) ? block.id : null;
    if (block.id !== undefined && blockId === null) throw configurationError('block id is invalid');
    const overrides = normalizeBlockOverrides(block.overrides);
    return {
      ...(blockId ? { id: blockId } : {}),
      title,
      description,
      ...(notes ? { notes } : {}),
      weekdays,
      start_time: startTime,
      end_time: endTime,
      modality,
      ...(Object.keys(overrides).length ? { overrides } : {})
    };
  });
}

const EVENT_COLUMNS = `
  e.id,
  e.schedule_id,
  e.owner_user_id,
  e.title,
  e.start_at,
  e.end_at,
  e.timezone,
  e.description,
  e.location,
  e.modality,
  e.category,
  e.color,
  e.priority,
  e.status,
  e.recurrence_rule,
  e.reminder_offset_minutes,
  e.notes
`;

const RETURNING_EVENT_COLUMNS = `
  id,
  schedule_id,
  owner_user_id,
  title,
  start_at,
  end_at,
  timezone,
  description,
  location,
  modality,
  category,
  color,
  priority,
  status,
  recurrence_rule,
  reminder_offset_minutes,
  notes
`;

function getEventInput(input) {
  return {
    title: typeof input.title === 'string' ? input.title.trim() : '',
    start_at: input.start_at,
    end_at: input.end_at,
    timezone: input.timezone || 'UTC',
    description: input.description ?? null,
    location: input.location ?? null,
    modality: input.modality ?? null,
    category: input.category ?? null,
    color: input.color ?? null,
    priority: input.priority ?? null,
    status: input.status ?? null,
    recurrence_rule: input.recurrence_rule ?? null,
    reminder_offset_minutes: input.reminder_offset_minutes ?? null,
    notes: input.notes ?? null
  };
}

function validateEvent(event) {
  if (!event.title || !event.start_at || !event.end_at) {
    const error = new Error('title, start_at, and end_at are required');
    error.status = 400;
    throw error;
  }
  if (new Date(event.end_at) <= new Date(event.start_at)) {
    const error = new Error('end_at must be later than start_at');
    error.status = 400;
    throw error;
  }
}

async function listSchedules(userId) {
  const result = await pool.query(
    `SELECT s.id, s.owner_user_id, s.group_id, s.title, s.timezone, s.color,
            COALESCE(sc.context, '[]'::jsonb) AS configuration,
            s.created_at, s.updated_at,
            COALESCE(jsonb_agg(to_jsonb(e) - 'event_window' ORDER BY e.start_at)
              FILTER (WHERE e.id IS NOT NULL), '[]'::jsonb) AS events
       FROM schedules s
       LEFT JOIN schedule_context sc ON sc.schedule_id = s.id AND sc.deleted_at IS NULL
       LEFT JOIN events e ON e.schedule_id = s.id AND e.deleted_at IS NULL
      WHERE s.owner_user_id = $1 AND s.deleted_at IS NULL
      GROUP BY s.id, sc.context
      ORDER BY s.updated_at DESC`,
    [userId]
  );
  return result.rows;
}

async function createSchedule(userId, input) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) {
    const error = new Error('title is required');
    error.status = 400;
    throw error;
  }

  const result = await pool.query(
    `INSERT INTO schedules (owner_user_id, group_id, title, timezone, color)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, owner_user_id, group_id, title, timezone, color, created_at, updated_at`,
    [userId, input.group_id || null, title, input.timezone || 'UTC', input.color || null]
  );
  return result.rows[0];
}

async function updateSchedule(userId, scheduleId, input) {
  const configuration = Object.prototype.hasOwnProperty.call(input, 'configuration')
    ? normalizeConfiguration(input.configuration)
    : null;
  const result = await pool.query(
    `UPDATE schedules
        SET title = COALESCE($1, title),
            group_id = COALESCE($2, group_id),
            timezone = COALESCE($3, timezone),
            color = COALESCE($4, color)
      WHERE id = $5 AND owner_user_id = $6 AND deleted_at IS NULL
      RETURNING id, owner_user_id, group_id, title, timezone, color, created_at, updated_at`,
    [input.title || null, input.group_id || null, input.timezone || null, input.color || null, scheduleId, userId]
  );
  if (!result.rows.length) {
    const error = new Error('Schedule not found');
    error.status = 404;
    throw error;
  }
  if (configuration) {
    await pool.query(
      `INSERT INTO schedule_context (schedule_id, context)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (schedule_id)
       DO UPDATE SET context = EXCLUDED.context,
                     updated_at = CURRENT_TIMESTAMP,
                     deleted_at = NULL`,
      [scheduleId, JSON.stringify(configuration)]
    );
  }
  return result.rows[0];
}

async function deleteSchedule(userId, scheduleId) {
  const result = await pool.query(
    `UPDATE schedules SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL
      RETURNING id`,
    [scheduleId, userId]
  );
  if (!result.rows.length) {
    const error = new Error('Schedule not found');
    error.status = 404;
    throw error;
  }
}

async function createEvent(userId, scheduleId, input) {
  const event = getEventInput(input);
  validateEvent(event);
  const result = await pool.query(
    `WITH owned_schedule AS (
       SELECT id FROM schedules
        WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL
     )
     INSERT INTO events (
       schedule_id, owner_user_id, title, start_at, end_at, timezone,
       description, location, modality, category, color, priority, status,
       recurrence_rule, reminder_offset_minutes, notes
     )
     SELECT id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
       FROM owned_schedule
    RETURNING ${RETURNING_EVENT_COLUMNS}`,
    [
      scheduleId, userId, event.title, event.start_at, event.end_at, event.timezone,
      event.description, event.location, event.modality, event.category, event.color,
      event.priority, event.status, event.recurrence_rule,
      event.reminder_offset_minutes, event.notes
    ]
  );
  if (!result.rows.length) {
    const error = new Error('Schedule not found');
    error.status = 404;
    throw error;
  }
  return result.rows[0];
}

async function updateEvent(userId, eventId, input) {
  const event = getEventInput(input);
  validateEvent(event);
  const result = await pool.query(
    `UPDATE events e
        SET title = $1, start_at = $2, end_at = $3, timezone = $4,
            description = $5, location = $6, modality = $7, category = $8,
            color = $9, priority = $10, status = $11, recurrence_rule = $12,
            reminder_offset_minutes = $13, notes = $14
      WHERE e.id = $15 AND e.owner_user_id = $16 AND e.deleted_at IS NULL
      RETURNING ${RETURNING_EVENT_COLUMNS}`,
    [
      event.title, event.start_at, event.end_at, event.timezone, event.description,
      event.location, event.modality, event.category, event.color, event.priority,
      event.status, event.recurrence_rule, event.reminder_offset_minutes,
      event.notes, eventId, userId
    ]
  );
  if (!result.rows.length) {
    const error = new Error('Event not found');
    error.status = 404;
    throw error;
  }
  return result.rows[0];
}

async function deleteEvent(userId, eventId) {
  const result = await pool.query(
    `UPDATE events SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL
      RETURNING id`,
    [eventId, userId]
  );
  if (!result.rows.length) {
    const error = new Error('Event not found');
    error.status = 404;
    throw error;
  }
}

async function findConflicts(userId, eventId, startAt, endAt, scheduleId) {
  const result = await pool.query(
    `SELECT ${EVENT_COLUMNS}
       FROM events e
      WHERE e.owner_user_id = $1
        AND e.deleted_at IS NULL
        AND ($2::uuid IS NULL OR e.id <> $2::uuid)
        AND ($5::uuid IS NULL OR e.schedule_id = $5::uuid)
        AND e.event_window && tstzrange($3::timestamptz, $4::timestamptz, '[)')
      ORDER BY e.start_at`,
    [userId, eventId || null, startAt, endAt, scheduleId || null]
  );
  return result.rows;
}

module.exports = {
  normalizeConfiguration,
  normalizeBlockOverrides,
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  createEvent,
  updateEvent,
  deleteEvent,
  findConflicts
};
