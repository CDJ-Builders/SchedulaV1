const { pool } = require('../config/database');

/** Require and verify the current password before a sensitive admin action. @param {object} req @param {object} res @param {Function} next @param {Function} [query] @returns {Promise<void>} */
async function requireStepUp(req, res, next, query = pool.query.bind(pool)) {
  const password = req.body?.password;
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Password confirmation is required' });
  }
  try {
    const result = await query(
      `SELECT 1 FROM users
        WHERE id = $1 AND deleted_at IS NULL
          AND crypt($2, password_hash) = password_hash`,
      [req.user.user_id, password]
    );
    if (!result.rowCount) {
      await query(
        `INSERT INTO admin_audit_log (actor_id, actor_role, action, resource, ip, user_agent)
         VALUES ($1, $2, 'security.step_up_failed', 'admin_api', $3, $4)`,
        [req.user.user_id, req.user.role, String(req.ip || '').slice(0, 128), String(req.get?.('user-agent') || '').slice(0, 512)]
      ).catch(error => console.error('Could not audit failed admin step-up:', error.message));
      return res.status(403).json({ error: 'Password confirmation failed' });
    }
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = requireStepUp;
