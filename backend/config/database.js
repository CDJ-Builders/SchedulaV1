const { Pool } = require('pg');
require('./env');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

async function initDB() {
  await pool.query('SELECT 1');
  if (process.env.NODE_ENV !== 'production') {
    console.log('Database connection verified. Apply migrations before starting the API.');
  }
}

// Graceful shutdown
const shutdown = () => {
  console.log('Closing database pool...');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { pool, initDB };
