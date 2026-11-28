const express = require('express');
const rateLimit = require('express-rate-limit');
const teamsService = require('../services/teamsService');
const recommendationService = require('../services/recommendationService');
const asyncHandler = require('../utils/asyncHandler');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many team-code attempts. Try again later.' }
});
const teamRecommendationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many recommendation requests. Please try again later.' }
});

router.use(authenticateToken);

function validateUuidParam(name) {
  return (req, res, next, value) => {
    if (!uuidPattern.test(value)) return res.status(400).json({ error: name + ' must be a valid UUID.' });
    next();
  };
}

router.param('teamId', validateUuidParam('teamId'));
router.param('userId', validateUuidParam('userId'));
router.param('proposalId', validateUuidParam('proposalId'));

/**
 * GET /api/teams
 * Auth: Authenticated user.
 * Body: None.
 */
router.get('/teams', asyncHandler(async (req, res) => {
  res.json({ teams: await teamsService.listTeams(req.user.user_id) });
}));

/**
 * POST /api/teams
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.post('/teams', asyncHandler(async (req, res) => {
  const team = await teamsService.createTeam(req.user.user_id, req.body || {});
  res.status(201).json({ team });
}));

/**
 * POST /api/teams/join
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.post('/teams/join', joinLimiter, asyncHandler(async (req, res) => {
  const team = await teamsService.joinTeam(req.user.user_id, req.body?.code, req.body?.schedule_id);
  res.json({ team });
}));

/**
 * GET /api/teams/:teamId
 * Auth: Authenticated user.
 * Body: None.
 */
router.get('/teams/:teamId', asyncHandler(async (req, res) => {
  res.json({ team: await teamsService.getTeam(req.params.teamId, req.user.user_id) });
}));

/**
 * GET /api/teams/:teamId/week
 * Auth: Authenticated user.
 * Body: None.
 */
router.get('/teams/:teamId/week', asyncHandler(async (req, res) => {
  res.json({ week: await teamsService.getTeam(req.params.teamId, req.user.user_id) });
}));

/**
 * POST /api/teams/:teamId/recommendations
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.post('/teams/:teamId/recommendations', teamRecommendationLimiter, asyncHandler(async (req, res) => {
  res.json(await recommendationService.recommendForTeam(req.user.user_id, req.params.teamId, req.body));
}));

/**
 * PUT /api/teams/:teamId/shared-schedule
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.put('/teams/:teamId/shared-schedule', asyncHandler(async (req, res) => {
  const team = await teamsService.setSharedSchedule(req.params.teamId, req.user.user_id, req.body?.schedule_id);
  res.json({ team });
}));

/**
 * PUT /api/teams/:teamId/shared-schedule/details
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.put('/teams/:teamId/shared-schedule/details', asyncHandler(async (req, res) => {
  const team = await teamsService.setSharedScheduleDetails(req.params.teamId, req.user.user_id, req.body?.show_details);
  res.json({ team });
}));

/**
 * PUT /api/teams/:teamId
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.put('/teams/:teamId', asyncHandler(async (req, res) => {
  res.json({ team: await teamsService.renameTeam(req.params.teamId, req.user.user_id, req.body || {}) });
}));

/**
 * POST /api/teams/:teamId/group-code
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.post('/teams/:teamId/group-code', asyncHandler(async (req, res) => {
  const code = await teamsService.regenerateCode(req.params.teamId, req.user.user_id);
  res.json({ code });
}));

/**
 * GET /api/teams/:teamId/preferences
 * Auth: Authenticated user.
 * Body: None.
 */
router.get('/teams/:teamId/preferences', asyncHandler(async (req, res) => {
  res.json({ members: await teamsService.listMemberPreferences(req.params.teamId, req.user.user_id) });
}));

/**
 * PUT /api/teams/:teamId/members/:userId
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.put('/teams/:teamId/members/:userId', asyncHandler(async (req, res) => {
  const team = await teamsService.changeMemberRole(
    req.params.teamId,
    req.user.user_id,
    req.params.userId,
    req.body?.role
  );
  res.json({ team });
}));

/**
 * DELETE /api/teams/:teamId/members/:userId
 * Auth: Authenticated user.
 * Body: None.
 */
router.delete('/teams/:teamId/members/:userId', asyncHandler(async (req, res) => {
  res.json(await teamsService.removeMember(req.params.teamId, req.user.user_id, req.params.userId));
}));

/**
 * POST /api/teams/:teamId/leave
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.post('/teams/:teamId/leave', asyncHandler(async (req, res) => {
  res.json(await teamsService.leaveTeam(req.params.teamId, req.user.user_id));
}));

/**
 * DELETE /api/teams/:teamId
 * Auth: Authenticated user.
 * Body: None.
 */
router.delete('/teams/:teamId', asyncHandler(async (req, res) => {
  res.json(await teamsService.deleteTeam(req.params.teamId, req.user.user_id));
}));

/**
 * POST /api/teams/:teamId/proposals
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.post('/teams/:teamId/proposals', asyncHandler(async (req, res) => {
  res.status(201).json(await teamsService.createProposal(req.params.teamId, req.user.user_id, req.body || {}));
}));

/**
 * POST /api/teams/:teamId/proposals/:proposalId/responses
 * Auth: Authenticated user.
 * Body: JSON request fields are validated by the handler.
 */
router.post('/teams/:teamId/proposals/:proposalId/responses', asyncHandler(async (req, res) => {
  res.json(await teamsService.respondToProposal(
    req.params.teamId,
    req.user.user_id,
    req.params.proposalId,
    req.body?.response
  ));
}));

module.exports = router;
