-- Migration: 20261020090000_cs_frame_cleanup_silver_glow
-- Purpose: C.S (frame 280, support_frame_official) was briefly public, so some users got a
--          'level' unlock for it. C.S is only for star accounts an admin grants it to.
--          Users who got it that way and still wear it, or were left with no frame after the
--          sweep removed it, get the free Silver Glow frame (free_silver_glow) instead.

WITH affected AS (
  SELECT u.id
  FROM users u
  JOIN user_unlocked_frames x ON x.user_id = u.id AND x.frame_id = 280
  WHERE x.unlock_type IS DISTINCT FROM 'admin'
    AND (u.selected_frame_id IS NULL OR u.selected_frame_id = 280)
), silver AS (
  SELECT id FROM frames WHERE slug = 'free_silver_glow' AND is_active = true
), granted AS (
  INSERT INTO user_unlocked_frames (user_id, frame_id, coins_paid, unlock_type)
  SELECT a.id, s.id, 0, 'level' FROM affected a CROSS JOIN silver s
  ON CONFLICT (user_id, frame_id) DO NOTHING
  RETURNING user_id
)
UPDATE users u
SET selected_frame_id = s.id, selected_role_frame_id = NULL
FROM affected a, silver s
WHERE u.id = a.id;

-- Drop the unlock rows C.S picked up while it was public (admin grants stay).
DELETE FROM user_unlocked_frames
WHERE frame_id = 280 AND unlock_type IS DISTINCT FROM 'admin';
