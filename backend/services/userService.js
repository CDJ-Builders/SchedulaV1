const { pool } = require('../config/database');

async function getSession(userId) {
  const result = await pool.query(
    `SELECT u.id AS user_id, u.email, u.platform_role AS access,
            p.display_name AS name, p.timezone, p.locale, p.avatar_url, p.working_hours
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId]
  );
  if (!result.rows.length) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
  return result.rows[0];
}

async function updateProfile(userId, { display_name, timezone, locale, avatar_url, working_hours, email, password }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (email) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        const error = new Error('Invalid email format. Enter an address like name@example.com.');
        error.status = 400;
        throw error;
      }

      const duplicate = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2 AND deleted_at IS NULL',
        [normalizedEmail, userId]
      );
      if (duplicate.rows.length) {
        const error = new Error('This email address already exists on another account.');
        error.status = 409;
        throw error;
      }

      await client.query('UPDATE users SET email = LOWER($1) WHERE id = $2 AND deleted_at IS NULL', [normalizedEmail, userId]);
    }
    if (password && password.trim()) {
      await client.query("UPDATE users SET password_hash = crypt($1, gen_salt('bf')) WHERE id = $2 AND deleted_at IS NULL", [password, userId]);
    }
    await client.query(
      `INSERT INTO profiles (user_id, display_name, timezone, locale, avatar_url, working_hours)
       VALUES ($1, $2, COALESCE($3, 'UTC'), COALESCE($4, 'en-US'), $5, COALESCE($6, '{}'::jsonb))
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
         timezone = COALESCE(EXCLUDED.timezone, profiles.timezone),
         locale = COALESCE(EXCLUDED.locale, profiles.locale),
         avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
         working_hours = COALESCE(EXCLUDED.working_hours, profiles.working_hours),
         deleted_at = NULL`,
      [userId, display_name || null, timezone || null, locale || null, avatar_url || null, working_hours ? JSON.stringify(working_hours) : null]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      error.status = 400;
      error.message = 'This email address already exists on another account.';
    }
    throw error;
  } finally {
    client.release();
  }
}

async function deleteProfile(userId) {
  const result = await pool.query(
    'UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING id',
    [userId]
  );
  if (!result.rows.length) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
}

async function getPreferences(userId) {
  const result = await pool.query(
    `SELECT preferred_time_start, preferred_time_end, preferred_days, buffer_minutes,
            modality_preference, default_view, notification_settings,
            time_of_day_preferences, conflict_tolerance
       FROM preferences WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return result.rows[0] || {};
}

async function updatePreferences(userId, input) {
  const result = await pool.query(
    `INSERT INTO preferences (
       user_id, preferred_time_start, preferred_time_end, preferred_days,
       buffer_minutes, modality_preference, default_view, notification_settings,
       time_of_day_preferences, conflict_tolerance
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
     ON CONFLICT (user_id) DO UPDATE SET
       preferred_time_start = EXCLUDED.preferred_time_start,
       preferred_time_end = EXCLUDED.preferred_time_end,
       preferred_days = EXCLUDED.preferred_days,
       buffer_minutes = EXCLUDED.buffer_minutes,
       modality_preference = EXCLUDED.modality_preference,
       default_view = EXCLUDED.default_view,
       notification_settings = EXCLUDED.notification_settings,
       time_of_day_preferences = EXCLUDED.time_of_day_preferences,
       conflict_tolerance = EXCLUDED.conflict_tolerance,
       deleted_at = NULL
     RETURNING *`,
    [
      userId, input.preferred_time_start || null, input.preferred_time_end || null,
      input.preferred_days || null, input.buffer_minutes ?? null,
      input.modality_preference || null, input.default_view || null,
      JSON.stringify(input.notification_settings || {}),
      JSON.stringify(input.time_of_day_preferences || {}), input.conflict_tolerance || null
    ]
  );
  return result.rows[0];
}

async function listAvailability(userId) {
  const result = await pool.query(
    `SELECT id, start_at, end_at, timezone, availability_type, label
       FROM availability_blocks
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY start_at`,
    [userId]
  );
  return result.rows;
}

async function createAvailability(userId, input) {
  if (!input.start_at || !input.end_at || !input.availability_type) {
    const error = new Error('start_at, end_at, and availability_type are required');
    error.status = 400;
    throw error;
  }
  const result = await pool.query(
    `INSERT INTO availability_blocks (user_id, start_at, end_at, timezone, availability_type, label)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, start_at, end_at, timezone, availability_type, label`,
    [userId, input.start_at, input.end_at, input.timezone || 'UTC', input.availability_type, input.label || null]
  );
  return result.rows[0];
}

async function deleteAvailability(userId, blockId) {
  const result = await pool.query(
    `UPDATE availability_blocks SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
    [blockId, userId]
  );
  if (!result.rows.length) {
    const error = new Error('Availability block not found');
    error.status = 404;
    throw error;
  }
}

module.exports = {
  getSession,
  updateProfile,
  deleteProfile,
  getPreferences,
  updatePreferences,
  listAvailability,
  createAvailability,
  deleteAvailability
};
