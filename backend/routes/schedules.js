const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticateToken } = require('../middleware/auth');
const scheduleService = require('../services/scheduleService');

const router = express.Router();
router.use(authenticateToken);

router.get('/schedules', asyncHandler(async (req, res) => {
  res.json(await scheduleService.listSchedules(req.user.user_id));
}));

router.post('/schedules', asyncHandler(async (req, res) => {
  res.status(201).json(await scheduleService.createSchedule(req.user.user_id, req.body));
}));

router.put('/schedules/:scheduleId', asyncHandler(async (req, res) => {
  res.json(await scheduleService.updateSchedule(req.user.user_id, req.params.scheduleId, req.body));
}));

router.delete('/schedules/:scheduleId', asyncHandler(async (req, res) => {
  await scheduleService.deleteSchedule(req.user.user_id, req.params.scheduleId);
  res.status(204).send();
}));

router.get('/schedules/:scheduleId/events', asyncHandler(async (req, res) => {
  const schedules = await scheduleService.listSchedules(req.user.user_id);
  const schedule = schedules.find(item => item.id === req.params.scheduleId);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  res.json(schedule.events || []);
}));

router.post('/schedules/:scheduleId/events', asyncHandler(async (req, res) => {
  res.status(201).json(await scheduleService.createEvent(req.user.user_id, req.params.scheduleId, req.body));
}));

router.put('/events/:eventId', asyncHandler(async (req, res) => {
  res.json(await scheduleService.updateEvent(req.user.user_id, req.params.eventId, req.body));
}));

router.delete('/events/:eventId', asyncHandler(async (req, res) => {
  await scheduleService.deleteEvent(req.user.user_id, req.params.eventId);
  res.status(204).send();
}));

router.get('/events/conflicts', asyncHandler(async (req, res) => {
  const { start_at: startAt, end_at: endAt, schedule_id: scheduleId, event_id: eventId } = req.query;
  if (!startAt || !endAt) return res.status(400).json({ error: 'start_at and end_at are required' });
  res.json(await scheduleService.findConflicts(req.user.user_id, eventId, startAt, endAt, scheduleId));
}));

module.exports = router;
