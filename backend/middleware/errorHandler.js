// Centralized error handler
const errorHandler = (err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
};

module.exports = errorHandler;
