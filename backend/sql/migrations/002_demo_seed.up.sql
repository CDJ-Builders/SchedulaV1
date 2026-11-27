WITH demo_users(email, display_name, role) AS (
  VALUES
    ('alex@example.test'::citext, 'Alex Morgan', 'user'),
    ('sam@example.test'::citext, 'Sam Rivera', 'user'),
    ('owner@example.test'::citext, 'Team Owner', 'admin')
), inserted_users AS (
  INSERT INTO users (email, password_hash, platform_role)
  SELECT email, crypt('demo-password', gen_salt('bf')), role
  FROM demo_users
  ON CONFLICT (email) DO UPDATE SET deleted_at = NULL
  RETURNING id, email
)
INSERT INTO profiles (user_id, display_name, timezone, locale)
SELECT u.id, d.display_name, 'UTC', 'en-US'
FROM inserted_users u
JOIN demo_users d ON d.email = u.email
ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, deleted_at = NULL;

INSERT INTO preferences (user_id, preferred_modality)
SELECT id, 'no preference'
FROM users
WHERE email = 'alex@example.test'
ON CONFLICT (user_id) DO UPDATE SET preferred_modality = EXCLUDED.preferred_modality;

INSERT INTO groups (owner_user_id, name, description)
SELECT id, 'Demo Planning Team', 'Generic team schedule used for local development.'
FROM users
WHERE email = 'owner@example.test'
  AND NOT EXISTS (SELECT 1 FROM groups WHERE name = 'Demo Planning Team' AND deleted_at IS NULL);

INSERT INTO memberships (group_id, user_id, role)
SELECT g.id, u.id, CASE WHEN u.email = 'owner@example.test' THEN 'owner' ELSE 'member' END
FROM groups g
CROSS JOIN users u
WHERE g.name = 'Demo Planning Team'
  AND u.email IN ('owner@example.test', 'alex@example.test', 'sam@example.test')
ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role, deleted_at = NULL;

INSERT INTO schedules (owner_user_id, group_id, title, timezone, color)
SELECT u.id, g.id, 'Demo Week', 'UTC', '#2f6f68'
FROM users u
JOIN groups g ON g.name = 'Demo Planning Team' AND g.deleted_at IS NULL
WHERE u.email = 'owner@example.test'
  AND NOT EXISTS (SELECT 1 FROM schedules WHERE title = 'Demo Week' AND owner_user_id = u.id AND deleted_at IS NULL);

INSERT INTO schedule_context (schedule_id, context)
SELECT s.id, '{"goals": ["coordinate team work"], "constraints": ["protect focus time"], "tags": ["demo", "team"]}'::jsonb
FROM schedules s
WHERE s.title = 'Demo Week'
ON CONFLICT (schedule_id) DO UPDATE SET context = EXCLUDED.context, deleted_at = NULL;

INSERT INTO events (schedule_id, owner_user_id, title, start_at, end_at, timezone, modality, category, status, notes)
SELECT s.id, s.owner_user_id, 'Team planning', '2026-10-19 10:00:00+00', '2026-10-19 11:00:00+00', 'UTC', 'online', 'planning', 'confirmed', 'Demo event for conflict detection.'
FROM schedules s
WHERE s.title = 'Demo Week'
  AND NOT EXISTS (SELECT 1 FROM events WHERE schedule_id = s.id AND title = 'Team planning' AND deleted_at IS NULL);

INSERT INTO events (schedule_id, owner_user_id, title, start_at, end_at, timezone, modality, category, status)
SELECT s.id, s.owner_user_id, 'Deep work', '2026-10-19 13:00:00+00', '2026-10-19 14:30:00+00', 'UTC', 'in_person', 'focus', 'planned'
FROM schedules s
WHERE s.title = 'Demo Week'
  AND NOT EXISTS (SELECT 1 FROM events WHERE schedule_id = s.id AND title = 'Deep work' AND deleted_at IS NULL);
