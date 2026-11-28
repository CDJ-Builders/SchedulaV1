const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticateToken } = require('../middleware/auth');
const scheduleService = require('../services/scheduleService');
const recommendationService = require('../services/recommendationService');
const rateLimit = require('express-rate-limit');

const router = express.Router();
router.use(authenticateToken);

const recommendationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many recommendation requests. Please try again later.' }
});

/**
 * GET /api/schedules
 * Auth: Authenticated user.
 * Body: None.
 */
router.get('/schedules', asyncHandler(async (req, res) => {
  res.json(await scheduleService.listSchedules(req.user.user_id));
}));

/**
 * POST /api/schedules/:scheduleId/recommendations
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.post('/schedules/:scheduleId/recommendations', recommendationLimiter, asyncHandler(async (req, res) => {
  res.json(await recommendationService.recommend(req.user.user_id, req.params.scheduleId, req.body));
}));

/**
 * POST /api/schedules
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.post('/schedules', asyncHandler(async (req, res) => {
  res.status(201).json(await scheduleService.createSchedule(req.user.user_id, req.body));
}));

/**
 * PUT /api/schedules/:scheduleId
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.put('/schedules/:scheduleId', asyncHandler(async (req, res) => {
  res.json(await scheduleService.updateSchedule(req.user.user_id, req.params.scheduleId, req.body));
}));

/**
 * DELETE /api/schedules/:scheduleId
 * Auth: Authenticated user.
 * Body: None.
 */
router.delete('/schedules/:scheduleId', asyncHandler(async (req, res) => {
  await scheduleService.deleteSchedule(req.user.user_id, req.params.scheduleId);
  res.status(204).send();
}));

/**
 * GET /api/schedules/:scheduleId/events
 * Auth: Authenticated user.
 * Body: None.
 */
router.get('/schedules/:scheduleId/events', asyncHandler(async (req, res) => {
  const schedules = await scheduleService.listSchedules(req.user.user_id);
  const schedule = schedules.find(item => item.id === req.params.scheduleId);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  res.json(schedule.events || []);
}));

/**
 * POST /api/schedules/:scheduleId/events
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.post('/schedules/:scheduleId/events', asyncHandler(async (req, res) => {
  res.status(201).json(await scheduleService.createEvent(req.user.user_id, req.params.scheduleId, req.body));
}));

/**
 * PUT /api/events/:eventId
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.put('/events/:eventId', asyncHandler(async (req, res) => {
  res.json(await scheduleService.updateEvent(req.user.user_id, req.params.eventId, req.body));
}));

/**
 * DELETE /api/events/:eventId
 * Auth: Authenticated user.
 * Body: None.
 */
router.delete('/events/:eventId', asyncHandler(async (req, res) => {
  await scheduleService.deleteEvent(req.user.user_id, req.params.eventId);
  res.status(204).send();
}));

/**
 * GET /api/events/conflicts
 * Auth: Authenticated user.
 * Body: None.
 */
router.get('/events/conflicts', asyncHandler(async (req, res) => {
  const { start_at: startAt, end_at: endAt, schedule_id: scheduleId, event_id: eventId } = req.query;
  if (!startAt || !endAt) return res.status(400).json({ error: 'start_at and end_at are required' });
  res.json(await scheduleService.findConflicts(req.user.user_id, eventId, startAt, endAt, scheduleId));
}));

module.exports = router;
