function isValidPassword(password) {
  return typeof password === 'string'
    && password.length >= 6
    && /\d/.test(password)
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password);
}

module.exports = { isValidPassword };
