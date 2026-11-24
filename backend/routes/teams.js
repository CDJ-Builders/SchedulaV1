const express = require('express');
const rateLimit = require('express-rate-limit');
const teamsService = require('../services/teamsService');
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

router.get('/teams', asyncHandler(async (req, res) => {
  res.json({ teams: await teamsService.listTeams(req.user.user_id) });
}));

router.post('/teams', asyncHandler(async (req, res) => {
  const team = await teamsService.createTeam(req.user.user_id, req.body || {});
  res.status(201).json({ team });
}));

router.post('/teams/join', joinLimiter, asyncHandler(async (req, res) => {
  const team = await teamsService.joinTeam(req.user.user_id, req.body?.code);
  res.json({ team });
}));

router.get('/teams/:teamId', asyncHandler(async (req, res) => {
  res.json({ team: await teamsService.getTeam(req.params.teamId, req.user.user_id) });
}));

router.get('/teams/:teamId/week', asyncHandler(async (req, res) => {
  res.json({ week: await teamsService.getTeam(req.params.teamId, req.user.user_id) });
}));

router.put('/teams/:teamId', asyncHandler(async (req, res) => {
  res.json({ team: await teamsService.renameTeam(req.params.teamId, req.user.user_id, req.body || {}) });
}));

router.post('/teams/:teamId/group-code', asyncHandler(async (req, res) => {
  const code = await teamsService.regenerateCode(req.params.teamId, req.user.user_id);
  res.json({ code });
}));

router.get('/teams/:teamId/preferences', asyncHandler(async (req, res) => {
  res.json({ members: await teamsService.listMemberPreferences(req.params.teamId, req.user.user_id) });
}));

router.put('/teams/:teamId/members/:userId', asyncHandler(async (req, res) => {
  const team = await teamsService.changeMemberRole(
    req.params.teamId,
    req.user.user_id,
    req.params.userId,
    req.body?.role
  );
  res.json({ team });
}));

router.delete('/teams/:teamId/members/:userId', asyncHandler(async (req, res) => {
  res.json(await teamsService.removeMember(req.params.teamId, req.user.user_id, req.params.userId));
}));

router.post('/teams/:teamId/leave', asyncHandler(async (req, res) => {
  res.json(await teamsService.leaveTeam(req.params.teamId, req.user.user_id));
}));

router.post('/teams/:teamId/proposals', asyncHandler(async (req, res) => {
  res.status(201).json(await teamsService.createProposal(req.params.teamId, req.user.user_id, req.body || {}));
}));

router.post('/teams/:teamId/proposals/:proposalId/responses', asyncHandler(async (req, res) => {
  res.json(await teamsService.respondToProposal(
    req.params.teamId,
    req.user.user_id,
    req.params.proposalId,
    req.body?.response
  ));
}));

module.exports = router;
