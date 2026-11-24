DELETE FROM team_proposals
WHERE title = 'Demo planning meeting'
  AND group_id IN (SELECT id FROM groups WHERE name = 'Demo Planning Team');

DELETE FROM groups WHERE name = 'Demo Design Team';
DELETE FROM users WHERE email IN ('mika@example.test', 'jun@example.test');
DELETE FROM schedules WHERE title = 'Demo Personal Week';
