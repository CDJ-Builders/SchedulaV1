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
    `SELECT pref_time_0708, pref_time_0810, pref_time_1012, pref_time_1214,
            pref_time_1416, pref_time_1618, pref_time_1820, pref_time_2022, pref_time_2224,
            "PrefMon", "PrefTue", "PrefWed", "PrefThurs", "PrefFri", "PrefSat",
            avoid_time_0708, avoid_time_0810, avoid_time_1012, avoid_time_1214,
            avoid_time_1416, avoid_time_1618, avoid_time_1820, avoid_time_2022, avoid_time_2224,
            "AvoidMon", "AvoidTue", "AvoidWed", "AvoidThurs", "AvoidFri", "AvoidSat",
            max_back_to_back, commute_time, preferred_modality
       FROM preferences
      WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length) return result.rows[0];

  await pool.query(
    'INSERT INTO preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );
  const defaults = await pool.query(
    `SELECT pref_time_0708, pref_time_0810, pref_time_1012, pref_time_1214,
            pref_time_1416, pref_time_1618, pref_time_1820, pref_time_2022, pref_time_2224,
            "PrefMon", "PrefTue", "PrefWed", "PrefThurs", "PrefFri", "PrefSat",
            avoid_time_0708, avoid_time_0810, avoid_time_1012, avoid_time_1214,
            avoid_time_1416, avoid_time_1618, avoid_time_1820, avoid_time_2022, avoid_time_2224,
            "AvoidMon", "AvoidTue", "AvoidWed", "AvoidThurs", "AvoidFri", "AvoidSat",
            max_back_to_back, commute_time, preferred_modality
       FROM preferences
      WHERE user_id = $1`,
    [userId]
  );
  return defaults.rows[0];
}

async function updatePreferences(userId, input) {
  const preferenceKeys = [
    'pref_time_0708', 'pref_time_0810', 'pref_time_1012', 'pref_time_1214',
    'pref_time_1416', 'pref_time_1618', 'pref_time_1820', 'pref_time_2022', 'pref_time_2224',
    'PrefMon', 'PrefTue', 'PrefWed', 'PrefThurs', 'PrefFri', 'PrefSat',
    'avoid_time_0708', 'avoid_time_0810', 'avoid_time_1012', 'avoid_time_1214',
    'avoid_time_1416', 'avoid_time_1618', 'avoid_time_1820', 'avoid_time_2022', 'avoid_time_2224',
    'AvoidMon', 'AvoidTue', 'AvoidWed', 'AvoidThurs', 'AvoidFri', 'AvoidSat'
  ];

  for (const key of preferenceKeys) {
    if (typeof input[key] !== 'boolean') {
      const error = new Error(`${key} must be a boolean`);
      error.status = 400;
      throw error;
    }
  }

  for (const key of [
    'max_back_to_back',
    'commute_time'
  ]) {
    if (!Number.isInteger(input[key]) || input[key] < 0) {
      const error = new Error(`${key} must be an integer greater than or equal to 0`);
      error.status = 400;
      throw error;
    }
  }

  if (!['onsite', 'online', 'no preference'].includes(input.preferred_modality)) {
    const error = new Error("preferred_modality must be 'onsite', 'online', or 'no preference'");
    error.status = 400;
    throw error;
  }

  const timeKeys = [
    'pref_time_0708', 'pref_time_0810', 'pref_time_1012', 'pref_time_1214',
    'pref_time_1416', 'pref_time_1618', 'pref_time_1820', 'pref_time_2022', 'pref_time_2224'
  ];
  const avoidTimeKeys = [
    'avoid_time_0708', 'avoid_time_0810', 'avoid_time_1012', 'avoid_time_1214',
    'avoid_time_1416', 'avoid_time_1618', 'avoid_time_1820', 'avoid_time_2022', 'avoid_time_2224'
  ];
  const preferredDayKeys = ['PrefMon', 'PrefTue', 'PrefWed', 'PrefThurs', 'PrefFri', 'PrefSat'];
  const avoidedDayKeys = ['AvoidMon', 'AvoidTue', 'AvoidWed', 'AvoidThurs', 'AvoidFri', 'AvoidSat'];

  for (let index = 0; index < timeKeys.length; index += 1) {
    if (input[timeKeys[index]] && input[avoidTimeKeys[index]]) {
      const error = new Error('The same time range cannot be both preferred and avoided');
      error.status = 400;
      throw error;
    }
  }
  for (let index = 0; index < preferredDayKeys.length; index += 1) {
    if (input[preferredDayKeys[index]] && input[avoidedDayKeys[index]]) {
      const error = new Error('The same day cannot be both preferred and avoided');
      error.status = 400;
      throw error;
    }
  }

  const result = await pool.query(
    `INSERT INTO preferences (
       user_id,
       pref_time_0708, pref_time_0810, pref_time_1012, pref_time_1214,
       pref_time_1416, pref_time_1618, pref_time_1820, pref_time_2022, pref_time_2224,
       "PrefMon", "PrefTue", "PrefWed", "PrefThurs", "PrefFri", "PrefSat",
       avoid_time_0708, avoid_time_0810, avoid_time_1012, avoid_time_1214,
       avoid_time_1416, avoid_time_1618, avoid_time_1820, avoid_time_2022, avoid_time_2224,
       "AvoidMon", "AvoidTue", "AvoidWed", "AvoidThurs", "AvoidFri", "AvoidSat",
       max_back_to_back, commute_time, preferred_modality
     ) VALUES (
       $1,
       $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16,
       $17, $18, $19, $20, $21, $22, $23, $24, $25,
       $26, $27, $28, $29, $30, $31,
       $32, $33, $34
     )
     ON CONFLICT (user_id) DO UPDATE SET
       pref_time_0708 = EXCLUDED.pref_time_0708,
       pref_time_0810 = EXCLUDED.pref_time_0810,
       pref_time_1012 = EXCLUDED.pref_time_1012,
       pref_time_1214 = EXCLUDED.pref_time_1214,
       pref_time_1416 = EXCLUDED.pref_time_1416,
       pref_time_1618 = EXCLUDED.pref_time_1618,
       pref_time_1820 = EXCLUDED.pref_time_1820,
       pref_time_2022 = EXCLUDED.pref_time_2022,
       pref_time_2224 = EXCLUDED.pref_time_2224,
       "PrefMon" = EXCLUDED."PrefMon",
       "PrefTue" = EXCLUDED."PrefTue",
       "PrefWed" = EXCLUDED."PrefWed",
       "PrefThurs" = EXCLUDED."PrefThurs",
       "PrefFri" = EXCLUDED."PrefFri",
       "PrefSat" = EXCLUDED."PrefSat",
       avoid_time_0708 = EXCLUDED.avoid_time_0708,
       avoid_time_0810 = EXCLUDED.avoid_time_0810,
       avoid_time_1012 = EXCLUDED.avoid_time_1012,
       avoid_time_1214 = EXCLUDED.avoid_time_1214,
       avoid_time_1416 = EXCLUDED.avoid_time_1416,
       avoid_time_1618 = EXCLUDED.avoid_time_1618,
       avoid_time_1820 = EXCLUDED.avoid_time_1820,
       avoid_time_2022 = EXCLUDED.avoid_time_2022,
       avoid_time_2224 = EXCLUDED.avoid_time_2224,
       "AvoidMon" = EXCLUDED."AvoidMon",
       "AvoidTue" = EXCLUDED."AvoidTue",
       "AvoidWed" = EXCLUDED."AvoidWed",
       "AvoidThurs" = EXCLUDED."AvoidThurs",
       "AvoidFri" = EXCLUDED."AvoidFri",
       "AvoidSat" = EXCLUDED."AvoidSat",
       max_back_to_back = EXCLUDED.max_back_to_back,
       commute_time = EXCLUDED.commute_time,
       preferred_modality = EXCLUDED.preferred_modality
     RETURNING pref_time_0708, pref_time_0810, pref_time_1012, pref_time_1214,
       pref_time_1416, pref_time_1618, pref_time_1820, pref_time_2022, pref_time_2224,
       "PrefMon", "PrefTue", "PrefWed", "PrefThurs", "PrefFri", "PrefSat",
       avoid_time_0708, avoid_time_0810, avoid_time_1012, avoid_time_1214,
       avoid_time_1416, avoid_time_1618, avoid_time_1820, avoid_time_2022, avoid_time_2224,
       "AvoidMon", "AvoidTue", "AvoidWed", "AvoidThurs", "AvoidFri", "AvoidSat",
       max_back_to_back, commute_time, preferred_modality`,
    [
      userId,
      input.pref_time_0708, input.pref_time_0810, input.pref_time_1012, input.pref_time_1214,
      input.pref_time_1416, input.pref_time_1618, input.pref_time_1820, input.pref_time_2022, input.pref_time_2224,
      input.PrefMon, input.PrefTue, input.PrefWed, input.PrefThurs, input.PrefFri, input.PrefSat,
      input.avoid_time_0708, input.avoid_time_0810, input.avoid_time_1012, input.avoid_time_1214,
      input.avoid_time_1416, input.avoid_time_1618, input.avoid_time_1820, input.avoid_time_2022, input.avoid_time_2224,
      input.AvoidMon, input.AvoidTue, input.AvoidWed, input.AvoidThurs, input.AvoidFri, input.AvoidSat,
      input.max_back_to_back, input.commute_time, input.preferred_modality
    ]
  );
  return result.rows[0];
}

module.exports = {
  getSession,
  updateProfile,
  deleteProfile,
  getPreferences,
  updatePreferences
};
