const express = require('express');
const userService = require('../services/userService');
const asyncHandler = require('../utils/asyncHandler');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/user-session', asyncHandler(async (req, res) => {
  res.json(await userService.getSession(req.user.user_id));
}));

router.put('/user/profile', asyncHandler(async (req, res) => {
  await userService.updateProfile(req.user.user_id, req.body);
  res.json({ message: 'Profile updated successfully' });
}));

router.delete('/user/profile', asyncHandler(async (req, res) => {
  await userService.deleteProfile(req.user.user_id);
  res.json({ message: 'Account deleted successfully' });
}));

router.get('/preferences', asyncHandler(async (req, res) => {
  res.json(await userService.getPreferences(req.user.user_id));
}));

router.put('/preferences', asyncHandler(async (req, res) => {
  try {
    res.json(await userService.updatePreferences(req.user.user_id, req.body));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to update preferences' });
  }
}));

router.get('/availability', asyncHandler(async (req, res) => {
  res.json(await userService.listAvailability(req.user.user_id));
}));

router.post('/availability', asyncHandler(async (req, res) => {
  res.status(201).json(await userService.createAvailability(req.user.user_id, req.body));
}));

router.delete('/availability/:id', asyncHandler(async (req, res) => {
  await userService.deleteAvailability(req.user.user_id, req.params.id);
  res.status(204).send();
}));

module.exports = router;
