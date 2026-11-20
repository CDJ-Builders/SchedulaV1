const express = require('express');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Load environment variables early (validates and warns on missing config)
const env = require('./config/env');
// Database and Graceful Shutdown initialization
const { initDB } = require('./config/database');

const app = express();

// --- Quick Wins Middleware ---
// 1. Response compression
app.use(compression());

// 2. Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());
app.use(express.json());

// --- Routes ---
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const scheduleRoutes = require('./routes/schedules');
const adminRoutes = require('./routes/admin');

app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', scheduleRoutes);
app.use('/api/admin', adminRoutes);

// --- Static Assets Routing ---
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
  app.listen(env.PORT, () => console.log(`Server running on port ${env.PORT}`));
});