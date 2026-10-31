-- Level entry bars you can buy: a price per bar, what each user bought (30 days, renewable), the 9 level videos.
-- The old pill/Lottie bars are switched off (kept in admin); users wearing one are moved off it.
-- The files must already be in the bucket: entry-bars/levels/v1/<slug>.mp4 and .jpg.
ALTER TABLE "entry_bars" ADD COLUMN "coin_cost" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "selected_entry_bar_paid_until" TIMESTAMPTZ(6);

CREATE TABLE "user_entry_bars" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "entry_bar_id" BIGINT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "coins_paid" BIGINT NOT NULL DEFAULT 0,
    "renew_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_entry_bars_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_entry_bars_user_id_entry_bar_id_key" ON "user_entry_bars"("user_id", "entry_bar_id");
CREATE INDEX "user_entry_bars_expires_at_idx" ON "user_entry_bars"("expires_at");
ALTER TABLE "user_entry_bars" ADD CONSTRAINT "user_entry_bars_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_entry_bars" ADD CONSTRAINT "user_entry_bars_entry_bar_id_fkey"
    FOREIGN KEY ("entry_bar_id") REFERENCES "entry_bars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Old level bars off (SVIP bars have svip_level > 0 and a slug; the new ones are inserted below).
WITH old AS (
    UPDATE "entry_bars" SET "is_active" = false
    WHERE "svip_level" = 0 AND "slug" IS NULL AND "is_active" = true
    RETURNING "id"
)
UPDATE "users" SET "selected_entry_bar_id" = NULL
WHERE "selected_entry_bar_id" IN (SELECT "id" FROM old);

-- Level bar = unlocked at that user level for good, or bought for coins (level x 1,000,000).
INSERT INTO "entry_bars" ("name", "level_required", "image_url", "animation_url", "is_active", "svip_level", "slug", "composite_mode", "sort_order", "coin_cost")
SELECT v.n, v.lvl, 'https://storage.googleapis.com/chataura/entry-bars/levels/v1/' || v.s || '.jpg',
       'https://storage.googleapis.com/chataura/entry-bars/levels/v1/' || v.s || '.mp4',
       true, 0, v.s, 'screen', v.lvl, v.lvl::bigint * 1000000
FROM (VALUES
    ('Golden Thunder',    10,  'motorcycle'),
    ('Inferno Tiger',      20,  'fire_tiger'),
    ('Rose Kingdom',       30,  'rose_castle'),
    ('Midas GT',           50,  'hypercar'),
    ('Storm Sovereign',   60,  'gold_eagle'),
    ('Ember Knight',       70,  'warhorse'),
    ('Royal Lion',         80,  'gold_lion'),
    ('Dragon Emperor',     90,  'gold_dragon'),
    ('Celestial Archangel', 100, 'archangel')
) AS v(n, lvl, s)
WHERE NOT EXISTS (SELECT 1 FROM "entry_bars" e WHERE e."slug" = v.s);
