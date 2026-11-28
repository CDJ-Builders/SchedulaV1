const express = require('express');
const userService = require('../services/userService');
const asyncHandler = require('../utils/asyncHandler');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/user-session
 * Auth: Authenticated user.
 * Body: None.
 */
router.get('/user-session', asyncHandler(async (req, res) => {
  res.json(await userService.getSession(req.user.user_id));
}));

/**
 * PUT /api/user/profile
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.put('/user/profile', asyncHandler(async (req, res) => {
  await userService.updateProfile(req.user.user_id, req.body);
  res.json({ message: 'Profile updated successfully' });
}));

/**
 * DELETE /api/user/profile
 * Auth: Authenticated user.
 * Body: None.
 */
router.delete('/user/profile', asyncHandler(async (req, res) => {
  await userService.deleteProfile(req.user.user_id);
  res.json({ message: 'Account deleted successfully' });
}));

/**
 * GET /api/preferences
 * Auth: Authenticated user.
 * Body: None.
 */
router.get('/preferences', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json(await userService.getPreferences(req.user.user_id));
}));

/**
 * PUT /api/preferences
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.put('/preferences', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    res.json(await userService.updatePreferences(req.user.user_id, req.body));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to update preferences' });
  }
}));

module.exports = router;
