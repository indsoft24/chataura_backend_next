-- Per-frame avatar fit so the photo sits inside each frame's hole.
-- Nullable: frames without values keep the app's default fit.

ALTER TABLE "frames"
  ADD COLUMN IF NOT EXISTS "avatar_scale" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "avatar_offset_y" DOUBLE PRECISION;
