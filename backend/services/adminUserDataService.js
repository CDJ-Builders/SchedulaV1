const { pool } = require('../config/database');
const auditService = require('./auditService');

const secretAssignment = /\b(password|passphrase|token|secret|authorization|api[_-]?key|credential)(\s*[:=]\s*)([^,\s;]+)/gi;
const bearerValue = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const sensitiveQueryValue = /([?&](?:access_)?(?:token|secret|key|signature|password|credential|authorization))=([^&#\s]*)/gi;

function sanitizeStrings(value) {
  if (Array.isArray(value)) return value.map(sanitizeStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeStrings(item)]));
  }
  if (typeof value !== 'string') return value;
  return value
    .replace(bearerValue, 'Bearer [REDACTED]')
    .replace(secretAssignment, '$1$2[REDACTED]')
    .replace(sensitiveQueryValue, '$1=[REDACTED]');
}

function redactConfiguredData(value) {
  return sanitizeStrings(auditService.redact(value));
}

async function withAuditTransaction(req, action, resourceId, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await auditService.record(client, req, {
      action,
      resource: 'user_configuration',
      resourceId,
      after: result.audit
    });
    await client.query('COMMIT');
    return result.value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function listUsers(req, { q, limit, offset, page }) {
  const search = q ? `%${q}%` : null;
  return withAuditTransaction(req, 'user.directory.view', null, async client => {
    const total = await client.query(
      `SELECT COUNT(*)::integer AS total
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
        WHERE $1::text IS NULL
           OR u.id::text ILIKE $1
           OR u.email::text ILIKE $1
           OR COALESCE(p.display_name, '') ILIKE $1`,
      [search]
    );
    const rows = await client.query(
      `SELECT u.id, u.email, u.role, u.created_at, u.updated_at, u.deleted_at,
              p.display_name,
              COALESCE(s.schedule_count, 0)::integer AS schedules_count,
              (pref.user_id IS NOT NULL) AS has_preferences
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN preferences pref ON pref.user_id = u.id
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS schedule_count
             FROM schedules s
            WHERE s.owner_user_id = u.id AND s.group_id IS NULL
         ) s ON TRUE
        WHERE $1::text IS NULL
           OR u.id::text ILIKE $1
           OR u.email::text ILIKE $1
           OR COALESCE(p.display_name, '') ILIKE $1
        ORDER BY u.created_at DESC, u.id ASC
        LIMIT $2 OFFSET $3`,
      [search, limit, offset]
    );
    return {
      value: { rows: rows.rows, total: total.rows[0].total, page, limit },
      audit: { page, limit, result_count: rows.rowCount }
    };
  });
}

async function getUserConfiguration(req, userId) {
  return withAuditTransaction(req, 'user.configuration.view', userId, async client => {
    const accountResult = await client.query(
      `SELECT id, email, role, created_at, updated_at, deleted_at
         FROM users WHERE id = $1`,
      [userId]
    );
    if (!accountResult.rowCount) return { value: null, audit: { not_found: true } };

    const profileResult = await client.query(
      `SELECT id, display_name, timezone, locale, avatar_url, working_hours,
              created_at, updated_at, deleted_at
         FROM profiles WHERE user_id = $1`,
      [userId]
    );
    const preferencesResult = await client.query(
      `SELECT pref_time_0708, pref_time_0810, pref_time_1012, pref_time_1214,
              pref_time_1416, pref_time_1618, pref_time_1820, pref_time_2022, pref_time_2224,
              "PrefMon", "PrefTue", "PrefWed", "PrefThurs", "PrefFri", "PrefSat",
              avoid_time_0708, avoid_time_0810, avoid_time_1012, avoid_time_1214,
              avoid_time_1416, avoid_time_1618, avoid_time_1820, avoid_time_2022, avoid_time_2224,
              "AvoidMon", "AvoidTue", "AvoidWed", "AvoidThurs", "AvoidFri", "AvoidSat",
              max_back_to_back, commute_time, preferred_modality
         FROM preferences WHERE user_id = $1`,
      [userId]
    );
    const schedulesResult = await client.query(
      `SELECT s.id, s.title, s.timezone, s.color, s.created_at, s.updated_at, s.deleted_at,
              sc.context
         FROM schedules s
         LEFT JOIN schedule_context sc ON sc.schedule_id = s.id
        WHERE s.owner_user_id = $1 AND s.group_id IS NULL
        ORDER BY s.created_at DESC, s.id ASC`,
      [userId]
    );
    const configuration = redactConfiguredData({
      account: accountResult.rows[0],
      profile: profileResult.rows[0] || null,
      preferences: preferencesResult.rows[0] || null,
      schedules: schedulesResult.rows
    });
    return {
      value: configuration,
      audit: {
        schedules_count: schedulesResult.rowCount,
        has_profile: Boolean(profileResult.rowCount),
        has_preferences: Boolean(preferencesResult.rowCount)
      }
    };
  });
}

module.exports = { listUsers, getUserConfiguration, redactConfiguredData };
