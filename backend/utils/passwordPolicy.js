/** Check whether a password meets the application's minimum complexity rules. @param {string} password @returns {boolean} */
function isValidPassword(password) {
  return typeof password === 'string'
    && password.length >= 6
    && /\d/.test(password)
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password);
}

module.exports = { isValidPassword };
