const readline = require('readline');
const { pool } = require('../config/database');
const { normalizeEmail, isPlausibleEmail } = require('../middleware/validation');
const auditService = require('../services/auditService');

function promptPassword() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Set ADMIN_BOOTSTRAP_PASSWORD or run this command in an interactive terminal.'));
  }
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write('Super admin password: ');
    let password = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = chunk => {
      const key = chunk.toString();
      if (key === '\r' || key === '\n') {
        process.stdin.removeListener('data', onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        rl.close();
        process.stdout.write('\n');
        if (!password) return reject(new Error('Password cannot be empty.'));
        return resolve(password);
      }
      if (key === '\u0003') {
        process.stdin.removeListener('data', onData);
        process.stdin.setRawMode(false);
        rl.close();
        return reject(new Error('Cancelled.'));
      }
      if (key === '\u007f' || key === '\b') password = password.slice(0, -1);
      else if (key >= ' ') password += key;
    };
    process.stdin.on('data', onData);
  });
}

async function main() {
  const email = normalizeEmail(process.argv[2]);
  if (!isPlausibleEmail(email)) throw new Error('Usage: npm run admin:create -- <email>');
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || await promptPassword();
  if (password.length < 12) throw new Error('Use a password with at least 12 characters.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
    const existing = await client.query("SELECT 1 FROM users WHERE role = 'super_admin' AND deleted_at IS NULL LIMIT 1");
    if (existing.rowCount) throw new Error('A super admin already exists; bootstrap is only for the first account.');
    const inserted = await client.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES (LOWER($1), crypt($2, gen_salt('bf')), 'super_admin')
       RETURNING id`,
      [email, password]
    );
    await client.query('INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)', [inserted.rows[0].id, email]);
    await client.query('INSERT INTO preferences (user_id) VALUES ($1)', [inserted.rows[0].id]);
    await auditService.record(client, { user: { user_id: inserted.rows[0].id, role: 'super_admin' } }, {
      action: 'security.bootstrap_super_admin', resource: 'user_access', resourceId: inserted.rows[0].id,
      after: { role: 'super_admin' }
    });
    await client.query('COMMIT');
    console.log(`Created the first super admin account for ${email}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main().catch(error => {
  console.error(`Super admin setup failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => pool.end());
