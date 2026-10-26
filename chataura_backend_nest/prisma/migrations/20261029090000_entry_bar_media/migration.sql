-- Entry bars can carry a full-screen entrance video, and one SVIP level can offer several bars.

ALTER TABLE "entry_bars"
    ADD COLUMN "slug" VARCHAR(64),
    ADD COLUMN "composite_mode" VARCHAR(16) NOT NULL DEFAULT 'alpha',
    ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "entry_bars_slug_key" ON "entry_bars"("slug");
CREATE INDEX "entry_bars_svip_level_is_active_sort_order_idx" ON "entry_bars"("svip_level", "is_active", "sort_order");

-- SVIP 1 bar from 20261026090000_svip_identity becomes the first of two choices.
UPDATE "entry_bars"
SET "slug" = 'svip1_winged_wolf', "name" = 'Winged Wolf', "composite_mode" = 'screen', "sort_order" = 0
WHERE "slug" IS NULL
  AND "id" = (SELECT MIN("id") FROM "entry_bars" WHERE "svip_level" = 1);

-- Second choice. Off until admin uploads its video (Admin → Entry Bars), so users never see an empty option.
INSERT INTO "entry_bars" ("name", "level_required", "image_url", "animation_url", "is_active", "svip_level", "slug", "composite_mode", "sort_order")
SELECT 'Armored Wolf', 1, 'https://chataura.in/svip/svip1_entrance.png?v=1', NULL, false, 1, 'svip1_armored_wolf', 'screen', 1
WHERE NOT EXISTS (SELECT 1 FROM "entry_bars" WHERE "slug" = 'svip1_armored_wolf');
