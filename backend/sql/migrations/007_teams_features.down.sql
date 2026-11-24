DROP TABLE IF EXISTS proposal_responses;
DROP TABLE IF EXISTS team_proposals;
DROP TABLE IF EXISTS team_events;

DROP INDEX IF EXISTS groups_group_code_unique;
ALTER TABLE groups
  DROP CONSTRAINT IF EXISTS groups_group_code_format_check,
  DROP COLUMN IF EXISTS group_code;
