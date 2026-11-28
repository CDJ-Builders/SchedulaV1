const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');
const { isNonEmptyString, normalizeEmail, isPlausibleEmail } = require('../middleware/validation');
const { isValidPassword } = require('../utils/passwordPolicy');

router.post('/signup', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);
  if (!isPlausibleEmail(normalizedEmail) || !isNonEmptyString(password)) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }
  if (!isValidPassword(password)) return res.status(400).json({ error: 'Password must be at least 6 characters and include a number, an uppercase letter, and a lowercase letter.' });

  try {
    await authService.signup(normalizedEmail, password);
    res.status(200).json({ message: 'A 6-digit verification PIN has been sent to your email address.' });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Server error' });
  }
}));

router.post('/verify-signup', asyncHandler(async (req, res) => {
  const { email, pin } = req.body;
  const normalizedEmail = normalizeEmail(email);
  if (!isPlausibleEmail(normalizedEmail) || !/^\d{6}$/.test(String(pin || ''))) {
    return res.status(400).json({ error: 'A valid email and 6-digit PIN are required.' });
  }
  try {
    const result = await authService.verifySignup(normalizedEmail, String(pin));
    res.status(201).json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Server error' });
  }
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);
  if (!isPlausibleEmail(normalizedEmail) || !isNonEmptyString(password)) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }

  try {
    const result = await authService.login(normalizedEmail, password);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Server error' });
  }
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const result = await authService.refresh(refreshToken);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Server error' });
  }
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  await authService.logout(refreshToken);
  res.json({ message: 'Successfully logged out' });
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);
  if (!isPlausibleEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    await authService.forgotPassword(normalizedEmail);
    res.json({ message: 'If that email address exists in our database, we will send a password reset PIN.' });
  } catch (error) {
    if (error.exists === false) {
      return res.status(404).json({ error: error.message, exists: false });
    }
    res.status(error.status || 500).json({ error: error.message || 'Server error' });
  }
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, pin, email, password } = req.body;
  const resetPin = pin || token;
  const normalizedEmail = normalizeEmail(email);
  
  if (!resetPin || !isNonEmptyString(password) || !isPlausibleEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Email, PIN, and new password are required' });
  }
  if (!isValidPassword(password)) return res.status(400).json({ error: 'Password must be at least 6 characters and include a number, an uppercase letter, and a lowercase letter.' });

  try {
    await authService.resetPassword(resetPin, normalizedEmail, password);
    res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Server error' });
  }
}));

module.exports = router;
