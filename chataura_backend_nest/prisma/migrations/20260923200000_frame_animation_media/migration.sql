-- Playable frame assets live beside the still preview, matching gifts and stickers.
ALTER TABLE "frames" ADD COLUMN IF NOT EXISTS "animation_url" TEXT;
ALTER TABLE "frames" ADD COLUMN IF NOT EXISTS "composite_mode" VARCHAR(16) NOT NULL DEFAULT 'alpha';

-- Assets that were stored only on image_url become the animation.
-- GIF stays as the preview. MP4 glow rings default to screen composite.
UPDATE "frames"
SET
  "animation_url" = "image_url",
  "composite_mode" = CASE
    WHEN "image_url" ~* '\.mp4(\?|#|$)' THEN 'screen'
    ELSE "composite_mode"
  END
WHERE "animation_url" IS NULL
  AND "image_url" ~* '\.(svga|json|gif|mp4|webm)(\?|#|$)';
