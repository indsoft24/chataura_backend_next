-- SVIP identity items: per-item switches (My Items), SVIP entry bars, and the SVIP 1 frame + entry bar.

ALTER TABLE "user_svips"
    ADD COLUMN "bubble_on" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "room_card_on" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "mic_wave_on" BOOLEAN NOT NULL DEFAULT true;

-- 0 = normal entry bar. N = only SVIP N or higher may select it.
ALTER TABLE "entry_bars" ADD COLUMN "svip_level" INTEGER NOT NULL DEFAULT 0;

-- Images are served from the backend's public/svip folder.
INSERT INTO "frames" (
  "name", "slug", "category", "level_required", "coin_cost", "is_premium", "is_active",
  "image_url", "animation_url", "animation_key", "composite_mode", "avatar_scale", "avatar_offset_y"
)
SELECT 'SVIP 1', 'svip1_frame', 'svip', 1, NULL, true, true,
       'https://chataura.in/svip/svip1_frame.png?v=1', NULL, NULL, 'alpha', 0.53, 0
WHERE NOT EXISTS (SELECT 1 FROM "frames" WHERE "slug" = 'svip1_frame');

INSERT INTO "entry_bars" ("name", "level_required", "image_url", "animation_url", "is_active", "svip_level")
SELECT 'SVIP 1', 1, 'https://chataura.in/svip/svip1_entrance.png?v=1', NULL, true, 1
WHERE NOT EXISTS (SELECT 1 FROM "entry_bars" WHERE "svip_level" = 1);
