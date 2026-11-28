/** Check whether a value is a non-empty trimmed string. @param {*} v @returns {boolean} */
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
/** Normalize an email address for consistent storage and lookup. @param {*} email @returns {string} */
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
/** Check whether an email has a basic address shape. @param {*} email @returns {boolean} */
const isPlausibleEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

module.exports = { isNonEmptyString, normalizeEmail, isPlausibleEmail };
