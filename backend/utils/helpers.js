const { isProd } = require('../config/env');

const logDebug = (...args) => {
  if (!isProd) console.log(...args);
};

/**
 * Converts a 24-hour time string ("HH:MM" or "HH:MM:SS") into integer minutes since midnight.
 * @param {string} str - Time string to parse
 * @returns {number|null} Number of minutes, or null if invalid format
 */
const parseTimeToMins = (str) => {
  if (!str) return null;
  const parts = str.split(':');
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

module.exports = { logDebug, parseTimeToMins };
