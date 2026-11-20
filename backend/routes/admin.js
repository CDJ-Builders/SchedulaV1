const express = require('express');
const adminService = require('../services/adminService');
const asyncHandler = require('../utils/asyncHandler');
const { authenticateToken, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, adminOnly);

router.get('/users', asyncHandler(async (req, res) => {
  res.json(await adminService.getUsers());
}));

router.post('/users', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const id = await adminService.createUser(req.body);
  res.status(201).json({ id });
}));

router.put('/users/:id', asyncHandler(async (req, res) => {
  await adminService.updateUser(req.params.id, req.body);
  res.json({ message: 'User updated successfully' });
}));

router.delete('/users/:id', asyncHandler(async (req, res) => {
  await adminService.deleteUser(req.params.id);
  res.status(204).send();
}));

router.get('/schedules', asyncHandler(async (req, res) => {
  res.json(await adminService.getSchedules());
}));

router.delete('/schedules/:id', asyncHandler(async (req, res) => {
  await adminService.deleteSchedule(req.params.id);
  res.status(204).send();
}));

module.exports = router;
