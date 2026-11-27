const path = require('path');
const packageVersion = require('../package.json').version;
// This should be the very first thing required in db-server.js
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not set. Authenticated routes will fail in production.');
}
if (isProd && !process.env.ENCRYPTION_KEY) {
  console.warn('WARNING: ENCRYPTION_KEY is not set. Password encryption uses JWT_SECRET fallback.');
}

module.exports = {
  isProd,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET + '_refresh'),
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || process.env.JWT_SECRET,
  PORT: process.env.PORT || 3000,
  API_RATE_LIMIT: parseInt(process.env.API_RATE_LIMIT, 10) || (isProd ? 100 : 1000),
  SCHEDULAML_URL: process.env.SCHEDULAML_URL || 'http://127.0.0.1:8001',
  SCHEDULAML_API_KEY: process.env.SCHEDULAML_API_KEY || '',
  SCHEDULAML_TIMEOUT_MS: Math.min(Math.max(parseInt(process.env.SCHEDULAML_TIMEOUT_MS, 10) || 5000, 250), 15000),
  SMART_SCHEDULE_ENABLED: process.env.SMART_SCHEDULE_ENABLED === 'true',
  APP_VERSION: process.env.APP_VERSION || process.env.npm_package_version || packageVersion || 'unknown',
  APP_COMMIT: process.env.APP_COMMIT || process.env.GIT_COMMIT || 'unknown',
  ADMIN_ORIGIN: process.env.ADMIN_ORIGIN || '',
  ADMIN_API_ORIGIN: process.env.ADMIN_API_ORIGIN || '',
  ADMIN_IP_ALLOWLIST: (process.env.ADMIN_IP_ALLOWLIST || '').split(',').map(value => value.trim()).filter(Boolean),
  TRUST_PROXY: process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY === 'false' || !process.env.TRUST_PROXY ? false : process.env.TRUST_PROXY,
  SERVE_STATIC: process.env.SERVE_STATIC === 'true',
  SMTP: {
    HOST: process.env.SMTP_HOST,
    PORT: parseInt(process.env.SMTP_PORT, 10),
    USER: process.env.SMTP_USER,
    PASS: process.env.SMTP_PASS,
    SECURE: process.env.SMTP_SECURE === 'true',
    FROM: process.env.FROM_EMAIL
  }
};
