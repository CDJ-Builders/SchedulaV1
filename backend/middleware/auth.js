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
    req.user = user;
    next();
  });
};

/**
 * Express Middleware to restrict access to Super Admins.
 * Queries the database to verify the user's platform role is 'admin'.
 */
const adminOnly = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT platform_role FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.user.user_id]
    );
    if (result.rows.length === 0 || result.rows[0].platform_role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }
    next();
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { authenticateToken, adminOnly };
