const express = require('express');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Load environment variables early (validates and warns on missing config)
const env = require('./config/env');
// Database and Graceful Shutdown initialization
const { initDB } = require('./config/database');
const requestId = require('./middleware/requestId');
const requestMetrics = require('./middleware/metrics');
const { startRetentionJob } = require('./services/retentionService');
const adminNetworkGuard = require('./middleware/adminNetworkGuard');
const adminPageHelmet = helmet({
  strictTransportSecurity: env.isProd ? undefined : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'", ...(env.ADMIN_API_ORIGIN ? [env.ADMIN_API_ORIGIN] : [])],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']
    }
  }
});

const app = express();
if (env.TRUST_PROXY !== false) app.set('trust proxy', env.TRUST_PROXY);

// --- Quick Wins Middleware ---
// 1. Response compression
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false,
  strictTransportSecurity: env.isProd ? undefined : false
}));

// 2. Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Assign IDs before rate limiting so throttled responses can be traced.
app.use(requestId);
app.use(requestMetrics);

// 3. Rate limiting (Global, per IP for /api)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.API_RATE_LIMIT,
  skip: req => req.method === 'OPTIONS',
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});
app.use('/api', limiter);

// --- Standard Middleware ---
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());
app.use(express.json());

// --- Routes ---
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const scheduleRoutes = require('./routes/schedules');
const teamRoutes = require('./routes/teams');
const adminRoutes = require('./routes/admin');
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many admin requests. Try again later.' }
});
app.use('/api/admin', adminNetworkGuard, adminLimiter);

app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', scheduleRoutes);
app.use('/api', teamRoutes);
app.use('/api/admin', adminRoutes);

// --- Static Assets Routing ---
const adminAssets = path.join(__dirname, '../admin');
app.use('/admin', adminNetworkGuard, express.static(adminAssets, {
  index: false,
  setHeaders: res => res.set('Cache-Control', 'no-store')
}));
app.use('/frontend/scripts', express.static(path.join(__dirname, '../frontend/scripts'), { index: false }));
app.use('/frontend/css', express.static(path.join(__dirname, '../frontend/css'), { index: false }));
app.use('/pages', express.static(path.join(__dirname, '../pages'), { index: false }));
app.use('/assets', express.static(path.join(__dirname, '../assets'), { index: false }));
app.get('/favicon.png', (req, res) => res.sendFile(path.join(__dirname, '../favicon.png')));
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, '../index.html')));
app.get('/admin', adminNetworkGuard, adminPageHelmet, (req, res) => {
  if (req.path === '/admin') return res.redirect(302, '/admin/');
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});
if (env.SERVE_STATIC) {
  app.use(express.static(path.join(__dirname, '../')));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(__dirname, '../index.html'));
  });
}

// --- Centralized Error Handling ---
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// --- Server Startup ---
initDB().then(() => {
  startRetentionJob();
  app.listen(env.PORT, () => console.log(`Server running on port ${env.PORT}`));
});
