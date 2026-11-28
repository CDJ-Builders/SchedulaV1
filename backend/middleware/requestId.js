const crypto = require('crypto');

/** Attach a unique request ID and return it in the response headers. @param {object} req @param {object} res @param {Function} next @returns {void} */
function requestId(req, res, next) {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

module.exports = requestId;
