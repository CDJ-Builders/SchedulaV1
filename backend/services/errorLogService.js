const { pool } = require('../config/database');
const { normalizeRoute } = require('../middleware/metrics');

/** Remove credentials and personal identifiers from stored error text. @param {*} value @returns {string} */
function sanitizeMessage(value) {
  return String(value || 'Internal server error')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\bBearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/\b(password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .slice(0, 2000);
}

/** Persist a sanitized request error for operational review. @param {Error} error @param {object} req @returns {Promise<void>} @throws {Error} */
async function record(error, req) {
  const message = sanitizeMessage(error?.message);
  const stack = sanitizeMessage(error?.stack || '').slice(0, 8000);
  await pool.query(
    `INSERT INTO error_log (message, stack, route, request_id)
     VALUES ($1, $2, $3, $4)`,
    [message, stack, normalizeRoute(req), req.requestId]
  );
}

/** List stored errors using validated route, date, and paging filters. @param {object} filters @returns {Promise<object>} @throws {Error} */
async function list({ route, from, to, limit, offset }) {
  const conditions = [];
  const values = [];
  const add = (column, value, operator = '=') => {
    if (value === undefined || value === '') return;
    values.push(value);
    conditions.push(`${column} ${operator} $${values.length}`);
  };
  add('route', route);
  add('created_at', from, '>=');
  add('created_at', to, '<=');
  values.push(limit, offset);
  const result = await pool.query(
    `SELECT id, message, stack, route, request_id, created_at FROM error_log
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY created_at DESC, id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return result.rows;
}

module.exports = { record, list, sanitizeMessage };
