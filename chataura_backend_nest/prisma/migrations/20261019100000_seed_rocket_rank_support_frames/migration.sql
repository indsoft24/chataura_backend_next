-- Seed Rocket Launch, Ranking (Top 1-3), and Official Support avatar frames with GCS URLs
INSERT INTO "frames" (
  "name", "slug", "category", "level_required", "coin_cost", "is_premium", "is_active",
  "image_url", "animation_url", "animation_key", "composite_mode", "avatar_scale", "avatar_offset_y"
) VALUES
(
  'Rocket LV1 Emerald',
  'rocket_frame_lv1_emerald',
  'rocket',
  1,
  NULL,
  true,
  true,
  'https://storage.googleapis.com/chataura/avatar-frames/rocket/rocket_frame_lv1_emerald.png?v=2',
  'https://storage.googleapis.com/chataura/avatar-frames/rocket/rocket_frame_lv1_emerald.webp?v=2',
  'rocket_lv1',
  'alpha',
  0.58,
  0.0
),
(
  'Rocket LV2 Amethyst',
  'rocket_frame_lv2_amethyst',
  'rocket',
  1,
  NULL,
  true,
  true,
  'https://storage.googleapis.com/chataura/avatar-frames/rocket/rocket_frame_lv2_amethyst.png?v=2',
  'https://storage.googleapis.com/chataura/avatar-frames/rocket/rocket_frame_lv2_amethyst.webp?v=2',
  'rocket_lv2',
  'alpha',
  0.58,
  0.0
),
(
  'Rocket LV3 Crimson',
  'rocket_frame_lv3_crimson',
  'rocket',
  1,
  NULL,
  true,
  true,
  'https://storage.googleapis.com/chataura/avatar-frames/rocket/rocket_frame_lv3_crimson.png?v=2',
  'https://storage.googleapis.com/chataura/avatar-frames/rocket/rocket_frame_lv3_crimson.webp?v=2',
  'rocket_lv3',
  'alpha',
  0.58,
  0.0
),
(
  'Rocket LV4 Solar Gold',
  'rocket_frame_lv4_solar_gold',
  'rocket',
  1,
  NULL,
  true,
  true,
  'https://storage.googleapis.com/chataura/avatar-frames/rocket/rocket_frame_lv4_solar_gold.png?v=2',
  'https://storage.googleapis.com/chataura/avatar-frames/rocket/rocket_frame_lv4_solar_gold.webp?v=2',
  'rocket_lv4',
  'alpha',
  0.58,
  0.0
),
(
  'Rocket LV5 Cosmic',
  'rocket_frame_lv5_cosmic',
  'rocket',
  1,
  NULL,
  true,
  true,
  'https://storage.googleapis.com/chataura/avatar-frames/rocket/rocket_frame_lv5_cosmic.png?v=2',
  'https://storage.googleapis.com/chataura/avatar-frames/rocket/rocket_frame_lv5_cosmic.webp?v=2',
  'rocket_lv5',
  'alpha',
  0.58,
  0.0
),
(
  'Champion Crown (Top 1)',
  'rank_frame_top1',
  'rank',
  1,
  NULL,
  true,
  true,
  'https://storage.googleapis.com/chataura/avatar-frames/rank/rank_frame_top1.png?v=2',
  'https://storage.googleapis.com/chataura/avatar-frames/rank/rank_frame_top1.webp?v=2',
  'rank_top1',
  'alpha',
  0.58,
  0.01
),
(
  'Silver Royal (Top 2)',
  'rank_frame_top2',
  'rank',
  1,
  NULL,
  true,
  true,
  'https://storage.googleapis.com/chataura/avatar-frames/rank/rank_frame_top2.png?v=2',
  'https://storage.googleapis.com/chataura/avatar-frames/rank/rank_frame_top2.webp?v=2',
  'rank_top2',
  'alpha',
  0.58,
  0.0
),
(
  'Bronze Laurels (Top 3)',
  'rank_frame_top3',
  'rank',
  1,
  NULL,
  true,
  true,
  'https://storage.googleapis.com/chataura/avatar-frames/rank/rank_frame_top3.png?v=2',
  'https://storage.googleapis.com/chataura/avatar-frames/rank/rank_frame_top3.webp?v=2',
  'rank_top3',
  'alpha',
  0.58,
  0.01
),
(
  'Official Support',
  'support_frame_official',
  'role',
  1,
  0,
  false,
  true,
  'https://storage.googleapis.com/chataura/avatar-frames/support/support_frame_official.png?v=2',
  'https://storage.googleapis.com/chataura/avatar-frames/support/support_frame_official.webp?v=2',
  'support',
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
  "avatar_offset_y" = EXCLUDED."avatar_offset_y";

-- Link Rocket Level Configs to the newly seeded frames
UPDATE "rocket_level_configs"
SET "frame_id" = (SELECT "id" FROM "frames" WHERE "slug" = 'rocket_frame_lv1_emerald')
WHERE "level" = 1;

UPDATE "rocket_level_configs"
SET "frame_id" = (SELECT "id" FROM "frames" WHERE "slug" = 'rocket_frame_lv2_amethyst')
WHERE "level" = 2;

UPDATE "rocket_level_configs"
SET "frame_id" = (SELECT "id" FROM "frames" WHERE "slug" = 'rocket_frame_lv3_crimson')
WHERE "level" = 3;

UPDATE "rocket_level_configs"
SET "frame_id" = (SELECT "id" FROM "frames" WHERE "slug" = 'rocket_frame_lv4_solar_gold')
WHERE "level" = 4;

UPDATE "rocket_level_configs"
SET "frame_id" = (SELECT "id" FROM "frames" WHERE "slug" = 'rocket_frame_lv5_cosmic')
WHERE "level" = 5;
