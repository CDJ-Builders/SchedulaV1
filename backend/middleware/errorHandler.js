// Centralized error handler
const errorLogService = require('../services/errorLogService');

/** Convert route failures to safe JSON responses and persist server diagnostics. @param {Error} err @param {object} req @param {object} res @param {Function} next @returns {void} */
const errorHandler = (err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  if (status >= 500 && req.requestId) {
    errorLogService.record(err, req).catch(logError => console.error('Could not persist error record:', logError.message));
  }
  res.status(status).json({ error: err.message || 'Server error', request_id: req.requestId });
};

module.exports = errorHandler;
