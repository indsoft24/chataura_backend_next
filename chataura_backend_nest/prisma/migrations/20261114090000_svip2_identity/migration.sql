-- SVIP 2 (Amethyst Snow Leopard): GCS art, frame, medal and two entrance bars. Every file lives under an immutable GCS path
-- (https://storage.googleapis.com/chataura/svip/v1/svip2_*, entry-bars/svip/v1/svip2_*), so staging and production use the same URLs.
-- The level itself stays off (svip_level_configs.is_active) until price / recharge amount are set in the admin panel.

UPDATE "svip_level_configs"
SET "art" = jsonb_build_object(
  'medal',     'https://storage.googleapis.com/chataura/svip/v1/svip2_medal.webp',
  'frame',     'https://storage.googleapis.com/chataura/svip/v1/svip2_frame.webp',
  'room_card', 'https://storage.googleapis.com/chataura/svip/v1/svip2_room_card.webp',
  'bubble',    'https://storage.googleapis.com/chataura/svip/v1/svip2_bubble.webp',
  'title',     'https://storage.googleapis.com/chataura/svip/v1/svip2_title.webp',
  'vehicle',   'https://storage.googleapis.com/chataura/svip/v1/svip2_vehicle.webp'
)
WHERE "level" = 2;

-- Hole radius is 0.444 of the image (measured from the art: 8% transparent margin for the glow).
INSERT INTO "frames" (
  "name", "slug", "category", "level_required", "coin_cost", "is_premium", "is_active",
  "image_url", "animation_url", "animation_key", "composite_mode", "avatar_scale", "avatar_offset_y"
)
SELECT 'SVIP 2', 'svip2_frame', 'svip', 2, NULL, true, true,
       'https://storage.googleapis.com/chataura/svip/v1/svip2_frame.png',
       'https://storage.googleapis.com/chataura/svip/v1/svip2_frame.webp', NULL, 'alpha', 0.444, 0
WHERE NOT EXISTS (SELECT 1 FROM "frames" WHERE "slug" = 'svip2_frame');

INSERT INTO "medals" ("slug", "name", "description", "image_url", "svip_level", "sort_order")
VALUES ('svip2_medal', 'SVIP 2', 'Worn by SVIP 2 members.', 'https://storage.googleapis.com/chataura/svip/v1/svip2_medal.webp', 2, 20)
ON CONFLICT ("slug") DO NOTHING;

-- Two entrance bars (the banner is the same; the video differs). Banner art has the avatar hole at x120 y121 r82 of 900x240.
INSERT INTO "entry_bars" ("name", "level_required", "image_url", "animation_url", "is_active", "svip_level", "slug", "composite_mode", "sort_order")
SELECT v.n, 1, 'https://storage.googleapis.com/chataura/svip/v1/svip2_banner.webp',
       'https://storage.googleapis.com/chataura/entry-bars/svip/v1/svip2_' || v.s || '.mp4', true, 2, 'svip2_' || v.s, 'screen', v.o
FROM (VALUES ('Winged Leopard', 'winged_leopard', 0), ('Armored Leopard', 'armored_leopard', 1)) AS v(n, s, o)
WHERE NOT EXISTS (SELECT 1 FROM "entry_bars" e WHERE e."slug" = 'svip2_' || v.s);
