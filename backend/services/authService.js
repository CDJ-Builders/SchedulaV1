const { pool } = require('../config/database');
const { sendResetPinEmail, sendSignupPinEmail } = require('../utils/email');
const jwt = require('jsonwebtoken');
const nodeCrypto = require('crypto');
const { JWT_SECRET, JWT_REFRESH_SECRET } = require('../config/env');
const { isValidPassword } = require('../utils/passwordPolicy');

function hashToken(token) {
  return nodeCrypto.createHash('sha256').update(token).digest('hex');
}

function issueTokens(userId, sessionId) {
  const token = jwt.sign({ user_id: userId, session_id: sessionId }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ user_id: userId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { token, refreshToken };
}

async function signup(email, password) {
  if (!isValidPassword(password)) {
    const error = new Error('Password must be at least 6 characters and include a number, an uppercase letter, and a lowercase letter.');
    error.status = 400;
    throw error;
  }
  const existing = await pool.query('SELECT 1 FROM users WHERE LOWER(email::text) = LOWER($1) AND deleted_at IS NULL', [email]);
  if (existing.rows.length) {
    const error = new Error('Email already registered'); error.status = 409; throw error;
  }
  const pin = nodeCrypto.randomInt(100000, 1000000).toString();
  const pendingSignup = await pool.query(
    `INSERT INTO pending_signups (email, password_hash, pin_hash, expires_at)
     VALUES (LOWER($1), crypt($2, gen_salt('bf')), $3, CURRENT_TIMESTAMP + INTERVAL '15 minutes')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
       pin_hash = EXCLUDED.pin_hash, expires_at = EXCLUDED.expires_at, created_at = CURRENT_TIMESTAMP
     WHERE pending_signups.expires_at <= CURRENT_TIMESTAMP
     RETURNING email`,
    [email, password, hashToken(pin)]
  );
  if (!pendingSignup.rowCount) return { alreadySent: true };
  try {
    await sendSignupPinEmail(email, pin);
  } catch (error) {
    await pool.query('DELETE FROM pending_signups WHERE email = LOWER($1) AND pin_hash = $2', [email, hashToken(pin)]);
    throw error;
  }
  return { alreadySent: false };
}

async function verifySignup(email, pin) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pending = await client.query(
      `SELECT email, password_hash FROM pending_signups
        WHERE email = LOWER($1) AND pin_hash = $2 AND expires_at > CURRENT_TIMESTAMP
        FOR UPDATE`, [email, hashToken(pin)]
    );
    if (!pending.rows.length) { const error = new Error('Invalid or expired signup PIN.'); error.status = 400; throw error; }
    const result = await client.query('INSERT INTO users (email, password_hash) VALUES (LOWER($1), $2) RETURNING id, email', [email, pending.rows[0].password_hash]);
    await client.query(
      'INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)',
      [result.rows[0].id, email]
    );
    await client.query('INSERT INTO preferences (user_id) VALUES ($1)', [result.rows[0].id]);
    await client.query('DELETE FROM pending_signups WHERE email = LOWER($1)', [email]);
    await client.query('COMMIT');
    return { user_id: result.rows[0].id };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      const err = new Error('Email already registered');
      err.status = 409;
      throw err;
    }
    if (error.status) throw error;
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
    `SELECT u.id, u.email, u.password_hash, u.role, p.display_name
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
  const sessionId = nodeCrypto.randomUUID();
  const { token, refreshToken } = issueTokens(user.id, sessionId);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, session_id, token_hash, expires_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
    [user.id, sessionId, hashToken(refreshToken)]
  );
  return {
    token,
    refreshToken,
    user: { user_id: user.id, name: user.display_name, email: user.email, access: user.role, role: user.role }
  };
}

/** Rotate a refresh token and issue a fresh access token. @param {string} refreshToken @returns {Promise<object>} @throws {Error} */
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
    `SELECT user_id, session_id FROM refresh_tokens
      WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP AND deleted_at IS NULL
        AND last_activity_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'`,
    [hashToken(refreshToken), decoded.user_id]
  );
  if (!tokenResult.rows.length) {
    const error = new Error('Refresh token not recognized or expired');
    error.status = 401;
    throw error;
  }

  const { token, refreshToken: newRefreshToken } = issueTokens(decoded.user_id, tokenResult.rows[0].session_id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rotation = await client.query(
      `UPDATE refresh_tokens SET token_hash = $2, revoked_at = NULL,
              expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days',
              last_activity_at = CURRENT_TIMESTAMP
        WHERE session_id = $1 AND token_hash = $3 AND revoked_at IS NULL
          AND last_activity_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'`,
      [tokenResult.rows[0].session_id, hashToken(newRefreshToken), hashToken(refreshToken)]
    );
    if (!rotation.rowCount) {
      const error = new Error('Refresh token already used');
      error.status = 401;
      throw error;
    }
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

/** Start a password reset flow for an account. @param {string} email @returns {Promise<object>} @throws {Error} */
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

/** Replace a password after validating its reset PIN. @param {string} resetPin @param {string} email @param {string} password @returns {Promise<object>} @throws {Error} */
async function resetPassword(resetPin, email, password) {
  if (!isValidPassword(password)) {
    const error = new Error('Password must be at least 6 characters and include a number, an uppercase letter, and a lowercase letter.');
    error.status = 400;
    throw error;
  }
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

module.exports = { signup, verifySignup, login, refresh, logout, forgotPassword, resetPassword };
