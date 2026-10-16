-- Luxury C.S (Customer Support) Frame Suite
-- 1. Rename and upgrade primary C.S frame (slug: support_frame_official)
UPDATE "frames"
SET 
  "name" = 'C.S',
  "category" = 'special',
  "image_url" = 'https://storage.googleapis.com/chataura/avatar-frames/support/support_frame_official.png?v=3',
  "animation_url" = 'https://storage.googleapis.com/chataura/avatar-frames/support/support_frame_official.webp?v=3',
  "avatar_scale" = 0.58,
  "avatar_offset_y" = 0.0,
  "is_active" = true,
  "is_premium" = true
WHERE "slug" = 'support_frame_official';

-- 2. Add 3 additional luxury C.S variations
INSERT INTO "frames" (
  "name", "slug", "category", "level_required", "coin_cost", "is_premium", "is_active",
  "image_url", "animation_url", "animation_key", "composite_mode", "avatar_scale", "avatar_offset_y"
) VALUES 
(
  'C.S Royal',
  'cs_frame_royal_gold',
  'special',
  1,
  NULL,
  true,
  true,
  'https://storage.googleapis.com/chataura/avatar-frames/support/cs_frame_royal_gold.png?v=1',
  'https://storage.googleapis.com/chataura/avatar-frames/support/cs_frame_royal_gold.webp?v=1',
  'cs_royal',
  'alpha',
  0.58,
  0.0
),
(
  'C.S Neon Wave',
  'cs_frame_neon_audio',
  'special',
  1,
  NULL,
  true,
  true,
  'https://storage.googleapis.com/chataura/avatar-frames/support/cs_frame_neon_audio.png?v=1',
  'https://storage.googleapis.com/chataura/avatar-frames/support/cs_frame_neon_audio.webp?v=1',
  'cs_neon',
  'alpha',
  0.58,
  0.0
),
(
  'C.S Divine',
  'cs_frame_divine_angel',
  'special',
  1,
  NULL,
  true,
  true,
  'https://storage.googleapis.com/chataura/avatar-frames/support/cs_frame_divine_angel.png?v=1',
  'https://storage.googleapis.com/chataura/avatar-frames/support/cs_frame_divine_angel.webp?v=1',
  'cs_divine',
  'alpha',
  0.58,
  0.0
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "category" = EXCLUDED."category",
  "image_url" = EXCLUDED."image_url",
  "animation_url" = EXCLUDED."animation_url",
  "animation_key" = EXCLUDED."animation_key",
  "composite_mode" = EXCLUDED."composite_mode",
  "avatar_scale" = EXCLUDED."avatar_scale",
  "avatar_offset_y" = EXCLUDED."avatar_offset_y",
  "is_active" = EXCLUDED."is_active",
  "is_premium" = EXCLUDED."is_premium";
