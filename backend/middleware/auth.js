const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { pool } = require('../config/database');

/**
 * Express Middleware to verify JWT authentication token from request headers.
 * Populates req.user with decoded token data (e.g. user_id) on success.
 */
const authenticateToken = (req, res, next) => {
  if (!JWT_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(401).json({ error: 'Invalid or expired token' });
    if (!user.session_id) return res.status(401).json({ error: 'Session expired' });

    // Touch the specific login session on every authenticated API request.
    // The conditional update makes the 30-minute timeout authoritative even
    // when two requests race at the edge of the inactivity window.
    pool.query(
      `UPDATE refresh_tokens
          SET last_activity_at = CURRENT_TIMESTAMP
        WHERE session_id = $1 AND user_id = $2 AND revoked_at IS NULL
          AND deleted_at IS NULL AND expires_at > CURRENT_TIMESTAMP
          AND last_activity_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'`,
      [user.session_id, user.user_id]
    ).then(result => {
      if (!result.rowCount) return res.status(401).json({ error: 'Session expired' });
      req.user = user;
      next();
    }).catch(() => res.status(500).json({ error: 'Unable to verify session' }));
  });
};

module.exports = { authenticateToken };
