const path = require('path');
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
