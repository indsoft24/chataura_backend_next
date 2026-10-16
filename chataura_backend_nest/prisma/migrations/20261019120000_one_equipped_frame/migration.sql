-- One-frame rule: users.selected_frame_id is the only equipped frame (any source).
-- selected_role_frame_id now only mirrors it when the equipped frame is a role frame.

-- 1. Staff currently show their chosen role ring (it beat any normal frame): keep that look.
UPDATE "users" SET "selected_frame_id" = "selected_role_frame_id"
WHERE "role"::text IN ('admin', 'seller', 'agency') AND "selected_role_frame_id" IS NOT NULL;

-- 2. Staff with no chosen role ring showed their role's default ring: equip it.
UPDATE "users" u SET "selected_frame_id" = d."id", "selected_role_frame_id" = d."id"
FROM (
  SELECT DISTINCT ON ("animation_key") "id", "animation_key"
  FROM "frames" WHERE "category" = 'role' AND "is_active" = true
  ORDER BY "animation_key", "id"
) d
WHERE u."role"::text IN ('admin', 'seller', 'agency')
  AND u."selected_role_frame_id" IS NULL
  AND d."animation_key" = CASE u."role"::text
    WHEN 'agency' THEN 'agency'
    WHEN 'seller' THEN 'coin_seller'
    ELSE lower(coalesce(nullif(trim(u."staff_badge_type"), ''), 'admin'))
  END;

-- 3. Mirror rule for everyone else: no role frame unless a role frame is equipped.
UPDATE "users" u SET "selected_role_frame_id" = NULL
WHERE u."selected_role_frame_id" IS NOT NULL
  AND (u."selected_frame_id" IS DISTINCT FROM u."selected_role_frame_id"
       OR u."role"::text NOT IN ('admin', 'seller', 'agency'));

-- Support frame must never be auto-unlocked as a free level frame.
UPDATE "frames" SET "is_premium" = true WHERE "slug" = 'support_frame_official';

