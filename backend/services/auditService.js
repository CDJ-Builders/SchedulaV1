const { pool } = require('../config/database');

const SECRET_KEY = /(password|token|secret|authorization|cookie|hash|credential|api.?key)/i;
const MAX_STRING_LENGTH = 4000;

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !SECRET_KEY.test(key))
      .map(([key, item]) => [key, redact(item)]));
  }
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return undefined;
}

async function record(client, req, { action, resource, resourceId = null, before = null, after = null }) {
  const queryable = client || pool;
  const user = req?.user || { user_id: null, role: 'system' };
  await queryable.query(
    `INSERT INTO admin_audit_log
      (actor_id, actor_role, action, resource, resource_id, "before", "after", ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
    [
      user.user_id,
      user.role,
      action,
      resource,
      resourceId == null ? null : String(resourceId).slice(0, 256),
      before == null ? null : JSON.stringify(redact(before)),
      after == null ? null : JSON.stringify(redact(after)),
      req?.ip ? String(req.ip).slice(0, 128) : null,
      req?.get?.('user-agent') ? String(req.get('user-agent')).slice(0, 512) : null
    ]
  );
}

async function list(filters = {}) {
  const conditions = [];
  const values = [];
  const add = (column, value, operator = '=') => {
    if (value === undefined || value === '') return;
    values.push(value);
    conditions.push(`${column} ${operator} $${values.length}`);
  };
  add('actor_id', filters.actor);
  add('resource', filters.resource);
  add('action', filters.action);
  add('created_at', filters.from, '>=');
  add('created_at', filters.to, '<=');
  values.push(filters.limit, filters.offset);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT id, actor_id, actor_role, action, resource, resource_id,
            "before", "after", ip, user_agent, created_at
       FROM admin_audit_log ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return result.rows;
}

module.exports = { record, list, redact };
