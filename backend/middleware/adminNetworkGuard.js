const env = require('../config/env');

function normalizeAddress(address) {
  return String(address || '').replace(/^::ffff:/i, '');
}

function adminNetworkGuard(req, res, next) {
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  if (env.ADMIN_IP_ALLOWLIST.length) {
    const address = normalizeAddress(req.ip);
    if (!env.ADMIN_IP_ALLOWLIST.some(allowed => normalizeAddress(allowed) === address)) {
      console.warn(`Admin IP allowlist denied ${req.method} ${req.path}`);
      return res.status(403).json({ error: 'Admin access is not available from this network' });
    }
  }
  const origin = req.get('origin');
  const allowedOrigins = env.ADMIN_ORIGIN.split(',').map(value => value.trim()).filter(Boolean);
  const sameOrigin = `${req.protocol}://${req.get('host')}`;
  const localFileOrigin = origin === 'null' && process.env.NODE_ENV !== 'production';
  const originAllowed = !origin || localFileOrigin || (allowedOrigins.length
    ? allowedOrigins.includes(origin)
    : process.env.NODE_ENV !== 'production' && (
      origin === sameOrigin || ['http://localhost', 'http://127.0.0.1'].some(prefix => origin === prefix || origin.startsWith(`${prefix}:`))
    ));
  if (origin && !originAllowed) {
    console.warn(`Admin origin denied ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'Admin origin is not allowed' });
  }
  next();
}

module.exports = adminNetworkGuard;
