const { pool } = require('../config/database');

async function getUsers() {
  const result = await pool.query(
    `SELECT u.id, u.email, u.platform_role, u.created_at,
            p.display_name, p.timezone, p.locale
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC`
  );
  return result.rows;
}

async function createUser({ email, password, display_name, platform_role }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO users (email, password_hash, platform_role)
       VALUES (LOWER($1), crypt($2, gen_salt('bf')), COALESCE($3, 'user'))
       RETURNING id`,
      [email, password, platform_role || 'user']
    );
    await client.query(
      'INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)',
      [result.rows[0].id, display_name || email]
    );
    await client.query('INSERT INTO preferences (user_id) VALUES ($1)', [result.rows[0].id]);
    await client.query('COMMIT');
    return result.rows[0].id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateUser(userId, { email, password, display_name, platform_role }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (email || password || platform_role) {
      await client.query(
        `UPDATE users
            SET email = COALESCE(LOWER($1), email),
                password_hash = COALESCE(crypt($2, gen_salt('bf')), password_hash),
                platform_role = COALESCE($3, platform_role)
          WHERE id = $4 AND deleted_at IS NULL`,
        [email || null, password || null, platform_role || null, userId]
      );
    }
    if (display_name !== undefined) {
      await client.query(
        `UPDATE profiles SET display_name = $1, deleted_at = NULL
          WHERE user_id = $2`,
        [display_name, userId]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteUser(userId) {
  const result = await pool.query(
    `DELETE FROM users
      WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [userId]
  );
  if (!result.rows.length) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
}

async function getSchedules() {
  const result = await pool.query(
    `SELECT s.id, s.owner_user_id, s.group_id, s.title, s.timezone, s.color,
            s.created_at, s.updated_at, u.email AS owner_email,
            COUNT(e.id)::integer AS event_count
       FROM schedules s
       JOIN users u ON u.id = s.owner_user_id
       LEFT JOIN events e ON e.schedule_id = s.id AND e.deleted_at IS NULL
      WHERE s.deleted_at IS NULL
      GROUP BY s.id, u.email
      ORDER BY s.updated_at DESC`
  );
  return result.rows;
}

async function deleteSchedule(scheduleId) {
  const result = await pool.query(
    `UPDATE schedules SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [scheduleId]
  );
  if (!result.rows.length) {
    const error = new Error('Schedule not found');
    error.status = 404;
    throw error;
  }
}

module.exports = { getUsers, createUser, updateUser, deleteUser, getSchedules, deleteSchedule };
