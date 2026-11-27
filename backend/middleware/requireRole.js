const { pool } = require('../config/database');

function requireRole(allowedRoles, query = pool.query.bind(pool)) {
  const roles = new Set(Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]);
  return async function roleGuard(req, res, next) {
    if (!req.user?.user_id) return res.status(401).json({ error: 'Authentication required' });
    try {
      const result = await query(
        'SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL',
        [req.user.user_id]
      );
      if (!result.rowCount || !roles.has(result.rows[0].role)) {
        if (result.rowCount) {
          query(
            `INSERT INTO admin_audit_log (actor_id, actor_role, action, resource, ip, user_agent)
             VALUES ($1, $2, 'authorization.denied', 'admin_api', $3, $4)`,
            [req.user.user_id, result.rows[0].role, String(req.ip || '').slice(0, 128), String(req.get?.('user-agent') || '').slice(0, 512)]
          ).catch(error => console.error('Could not audit denied admin access:', error.message));
        }
        return res.status(403).json({ error: 'Access denied: insufficient role' });
      }
      req.user.role = result.rows[0].role;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = requireRole;
