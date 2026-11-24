WITH demo_users(email, display_name) AS (
  VALUES
    ('mika@example.test'::citext, 'Mika Santos'),
    ('jun@example.test'::citext, 'Jun Park')
), inserted_users AS (
  INSERT INTO users (email, password_hash, platform_role)
  SELECT email, crypt('demo-password', gen_salt('bf')), 'user'
  FROM demo_users
  ON CONFLICT (email) DO UPDATE SET deleted_at = NULL
  RETURNING id, email
)
INSERT INTO profiles (user_id, display_name, timezone, locale)
SELECT u.id, d.display_name, 'Asia/Manila', 'en-PH'
FROM inserted_users u
JOIN demo_users d ON d.email = u.email
ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name, timezone = EXCLUDED.timezone, deleted_at = NULL;

INSERT INTO preferences (
  user_id, preferred_modality, preferred_break_minutes, max_back_to_back, commute_time,
  pref_time_0810, pref_time_1012, pref_time_1416, "PrefMon", "PrefWed", "PrefFri"
)
SELECT u.id,
       CASE WHEN u.email = 'jun@example.test' THEN 'online' ELSE 'onsite' END,
       60,
       3,
       CASE WHEN u.email = 'jun@example.test' THEN 0 ELSE 30 END,
       TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
FROM users u
WHERE u.email IN (
  'alex@example.test', 'sam@example.test', 'owner@example.test',
  'mika@example.test', 'jun@example.test'
)
ON CONFLICT (user_id) DO UPDATE SET
  preferred_modality = EXCLUDED.preferred_modality,
  preferred_break_minutes = EXCLUDED.preferred_break_minutes,
  max_back_to_back = EXCLUDED.max_back_to_back,
  commute_time = EXCLUDED.commute_time,
  pref_time_0810 = EXCLUDED.pref_time_0810,
  pref_time_1012 = EXCLUDED.pref_time_1012,
  pref_time_1416 = EXCLUDED.pref_time_1416,
  "PrefMon" = EXCLUDED."PrefMon",
  "PrefWed" = EXCLUDED."PrefWed",
  "PrefFri" = EXCLUDED."PrefFri";

DO $$
DECLARE
  team_owner UUID;
  candidate TEXT;
BEGIN
  SELECT id INTO team_owner FROM users WHERE email = 'mika@example.test' AND deleted_at IS NULL;
  IF NOT EXISTS (SELECT 1 FROM groups WHERE name = 'Demo Design Team' AND deleted_at IS NULL) THEN
    LOOP
      candidate := 'SCH-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 4));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM groups WHERE group_code = candidate);
    END LOOP;
    INSERT INTO groups (owner_user_id, name, description, group_code)
    VALUES (team_owner, 'Demo Design Team', 'Local development fixture.', candidate);
  END IF;
END;
$$;

INSERT INTO memberships (group_id, user_id, role)
SELECT g.id, u.id,
       CASE WHEN u.email IN ('owner@example.test', 'mika@example.test') THEN 'owner' ELSE 'member' END
FROM groups g
CROSS JOIN users u
WHERE (g.name = 'Demo Planning Team' AND u.email IN ('owner@example.test', 'alex@example.test', 'sam@example.test'))
   OR (g.name = 'Demo Design Team' AND u.email IN ('mika@example.test', 'jun@example.test', 'sam@example.test'))
ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role, deleted_at = NULL;

INSERT INTO schedules (owner_user_id, title, timezone, color)
SELECT u.id, 'Demo Personal Week', COALESCE(p.timezone, 'UTC'), '#62298a'
FROM users u
LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
WHERE u.email IN (
  'alex@example.test', 'sam@example.test', 'owner@example.test',
  'mika@example.test', 'jun@example.test'
)
AND NOT EXISTS (
  SELECT 1 FROM schedules s
  WHERE s.owner_user_id = u.id AND s.title = 'Demo Personal Week' AND s.deleted_at IS NULL
);

INSERT INTO schedule_context (schedule_id, context)
SELECT s.id,
  jsonb_build_array(
    jsonb_build_object(
      'title', 'Busy', 'weekdays', ARRAY['Monday','Wednesday','Friday'],
      'start_time', CASE WHEN u.email = 'mika@example.test' THEN '09:00' ELSE '08:00' END,
      'end_time', CASE WHEN u.email = 'mika@example.test' THEN '10:30' ELSE '09:30' END,
      'modality', 'onsite'
    ),
    jsonb_build_object(
      'title', 'Busy', 'weekdays', ARRAY['Tuesday','Thursday'],
      'start_time', '13:00', 'end_time', '14:30', 'modality', 'online'
    )
  )
FROM schedules s
JOIN users u ON u.id = s.owner_user_id
WHERE s.title = 'Demo Personal Week'
ON CONFLICT (schedule_id) DO UPDATE
  SET context = EXCLUDED.context, deleted_at = NULL;

INSERT INTO team_proposals (group_id, proposed_by_user_id, title, weekday, start_time, end_time, modality)
SELECT g.id, u.id, 'Demo planning meeting', 'Tuesday', '11:00', '12:00', 'online'
FROM groups g
JOIN users u ON u.email = 'owner@example.test'
WHERE g.name = 'Demo Planning Team'
  AND NOT EXISTS (
    SELECT 1 FROM team_proposals p
    WHERE p.group_id = g.id AND p.title = 'Demo planning meeting'
      AND p.status = 'pending'
  );
