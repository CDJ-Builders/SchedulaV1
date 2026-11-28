const { Pool } = require('pg');
require('./env');
const logger = require('../utils/logger');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

async function initDB() {
  await pool.query('SELECT 1');
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Database connection verified. Apply migrations before starting the API.');
  }
}

// Graceful shutdown
const shutdown = () => {
  logger.info('Closing database pool...');
  pool.end(() => {
    logger.info('Database pool closed');
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { pool, initDB };
