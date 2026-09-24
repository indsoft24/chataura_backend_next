-- Staff badge + role-frame selection on users (points at frames, not legacy role_frames).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "staff_badge_type" VARCHAR(32);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "selected_role_frame_id" BIGINT;

-- Drop legacy FK to role_frames if present from 20260919070000_add_role_frames.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_selected_role_frame_id_fkey";

-- Clear IDs that are not valid frames rows (legacy role_frames ids).
UPDATE "users"
SET "selected_role_frame_id" = NULL
WHERE "selected_role_frame_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "frames" WHERE "frames"."id" = "users"."selected_role_frame_id"
  );

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_selected_role_frame_id_fkey"
    FOREIGN KEY ("selected_role_frame_id") REFERENCES "frames"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
