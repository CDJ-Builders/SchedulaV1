const { pool } = require('../config/database');
const createTeamsService = require('./teamsServiceCore');

module.exports = createTeamsService(pool);
