const { isProd } = require('../config/env');
const logger = require('./logger');

/** Log debug details only outside production. @param {...*} args @returns {void} */
const logDebug = (...args) => {
  if (!isProd) logger.info(...args);
};
module.exports = { logDebug };
