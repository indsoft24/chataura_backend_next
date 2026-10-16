-- Support frame is given by admin to star accounts, not tied to a staff role.
UPDATE "frames" SET "category" = 'special' WHERE "slug" = 'support_frame_official';

-- Rocket winners keep their level frame for 5 days.
UPDATE "rocket_level_configs" SET "frame_days" = 5
WHERE "frame_id" IN (SELECT "id" FROM "frames" WHERE "category" = 'rocket');

-- Reward-only frames were briefly claimable for 0 coins in the shop; drop those claims.
UPDATE "users" u SET "selected_frame_id" = NULL
WHERE u."selected_frame_id" IN (SELECT "id" FROM "frames" WHERE "category" IN ('rocket', 'rank', 'special'))
  AND NOT EXISTS (
    SELECT 1 FROM "user_unlocked_frames" uf
    WHERE uf."user_id" = u."id" AND uf."frame_id" = u."selected_frame_id"
      AND uf."unlock_type" IN ('rocket', 'rank', 'admin')
  );

DELETE FROM "user_unlocked_frames"
WHERE "frame_id" IN (SELECT "id" FROM "frames" WHERE "category" IN ('rocket', 'rank', 'special'))
  AND ("unlock_type" IS NULL OR "unlock_type" NOT IN ('rocket', 'rank', 'admin'));
