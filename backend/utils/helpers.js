const { isProd } = require('../config/env');

const logDebug = (...args) => {
  if (!isProd) require('./logger').info(...args);
};
module.exports = { logDebug };
