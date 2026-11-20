const { pool } = require('../config/database');
const { sendResetPinEmail } = require('../utils/email');
const jwt = require('jsonwebtoken');
const nodeCrypto = require('crypto');
const { JWT_SECRET, JWT_REFRESH_SECRET } = require('../config/env');

function hashToken(token) {
  return nodeCrypto.createHash('sha256').update(token).digest('hex');
}

function issueTokens(userId) {
  const token = jwt.sign({ user_id: userId }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ user_id: userId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { token, refreshToken };
}

async function signup(email, password) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO users (email, password_hash)
       VALUES (LOWER($1), crypt($2, gen_salt('bf')))
       RETURNING id, email`,
      [email, password]
    );
    await client.query(
      'INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)',
      [result.rows[0].id, email]
    );
    await client.query('INSERT INTO preferences (user_id) VALUES ($1)', [result.rows[0].id]);
    await client.query('COMMIT');
    return { user_id: result.rows[0].id };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      const err = new Error('Email already registered');
      err.status = 409;
      throw err;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function login(email, password) {
  if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
    const error = new Error('Server misconfiguration');
    error.status = 500;
    throw error;
  }
  const result = await pool.query(
    `SELECT u.id, u.email, u.password_hash, u.platform_role, p.display_name
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
      WHERE LOWER(u.email::text) = LOWER($1)
        AND crypt($2, u.password_hash) = u.password_hash
        AND u.deleted_at IS NULL`,
    [email, password]
  );
  if (!result.rows.length) {
    const error = new Error('Invalid email or password');
    error.status = 400;
    throw error;
  }

  const user = result.rows[0];
  const { token, refreshToken } = issueTokens(user.id);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
    [user.id, hashToken(refreshToken)]
  );
  return {
    token,
    refreshToken,
    user: { user_id: user.id, name: user.display_name, email: user.email, access: user.platform_role }
  };
}

async function refresh(refreshToken) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  } catch (error) {
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hashToken(refreshToken)]);
    const err = new Error('Invalid or expired refresh token');
    err.status = 401;
    throw err;
  }

  const tokenResult = await pool.query(
    `SELECT user_id FROM refresh_tokens
      WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP AND deleted_at IS NULL`,
    [hashToken(refreshToken), decoded.user_id]
  );
  if (!tokenResult.rows.length) {
    const error = new Error('Refresh token not recognized or expired');
    error.status = 401;
    throw error;
  }

  const { token, refreshToken: newRefreshToken } = issueTokens(decoded.user_id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1', [hashToken(refreshToken)]);
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
      [decoded.user_id, hashToken(newRefreshToken)]
    );
    await client.query('COMMIT');
    return { token, refreshToken: newRefreshToken };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function logout(refreshToken) {
  if (refreshToken) {
    await pool.query('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1', [hashToken(refreshToken)]);
  }
}

async function forgotPassword(email) {
  const result = await pool.query(
    `SELECT id, email FROM users WHERE LOWER(email::text) = LOWER($1) AND deleted_at IS NULL`,
    [email]
  );
  if (!result.rows.length) {
    const error = new Error('This email address is not registered in our database.');
    error.status = 404;
    error.exists = false;
    throw error;
  }

  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
    [result.rows[0].id, hashToken(pin)]
  );
  await sendResetPinEmail(result.rows[0].email, pin);
}

async function resetPassword(resetPin, email, password) {
  const result = await pool.query(
    `SELECT prt.id, u.id AS user_id
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = $1 AND LOWER(u.email::text) = LOWER($2)
        AND prt.expires_at > CURRENT_TIMESTAMP AND prt.used_at IS NULL
        AND prt.deleted_at IS NULL`,
    [hashToken(resetPin), email]
  );
  if (!result.rows.length) {
    const error = new Error('Invalid reset PIN or email');
    error.status = 400;
    throw error;
  }
  await pool.query("UPDATE users SET password_hash = crypt($1, gen_salt('bf')) WHERE id = $2", [password, result.rows[0].user_id]);
  await pool.query('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [result.rows[0].id]);
}

module.exports = { signup, login, refresh, logout, forgotPassword, resetPassword };
