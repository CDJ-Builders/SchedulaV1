const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const isPlausibleEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

module.exports = { isNonEmptyString, normalizeEmail, isPlausibleEmail };
