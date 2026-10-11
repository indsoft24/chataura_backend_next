-- Rocket ladder: admin-configured levels LV1..N with daily reset (default 04:00 Asia/Kolkata).

ALTER TABLE "rocket_campaign_configs"
  ADD COLUMN IF NOT EXISTS "daily_reset_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "reset_timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS "reset_hour" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS "expiry_mode" VARCHAR(16) NOT NULL DEFAULT 'RESET_PROGRESS',
  ADD COLUMN IF NOT EXISTS "carry_overflow" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "rocket_events"
  ADD COLUMN IF NOT EXISTS "level" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "cycle_key" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "config_snapshot" JSONB;

CREATE INDEX IF NOT EXISTS "rocket_events_room_id_cycle_key_created_at_idx"
  ON "rocket_events" ("room_id", "cycle_key", "created_at");

ALTER TABLE "rocket_launches"
  ADD COLUMN IF NOT EXISTS "rocket_level" INTEGER,
  ADD COLUMN IF NOT EXISTS "level_name" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "launch_video_url" TEXT,
  ADD COLUMN IF NOT EXISTS "theme_color" VARCHAR(16);

CREATE TABLE IF NOT EXISTS "rocket_level_configs" (
  "id" BIGSERIAL NOT NULL,
  "campaign_id" BIGINT NOT NULL,
  "level" INTEGER NOT NULL,
  "name" VARCHAR(64) NOT NULL,
  "threshold_coins" INTEGER NOT NULL,
  "reward_pool_percentage" DOUBLE PRECISION NOT NULL,
  "max_winners_count" INTEGER NOT NULL,
  "reward_distribution_rules" JSONB NOT NULL,
  "frame_id" BIGINT,
  "frame_winners" INTEGER NOT NULL DEFAULT 3,
  "frame_days" INTEGER NOT NULL DEFAULT 3,
  "xp_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
  "min_xp" INTEGER NOT NULL DEFAULT 20,
  "duration_seconds" INTEGER NOT NULL DEFAULT 0,
  "theme_color" VARCHAR(16) NOT NULL DEFAULT '#22C55E',
  "visual_tier" INTEGER NOT NULL DEFAULT 1,
  "launch_asset_key" VARCHAR(128),
  "station_asset_key" VARCHAR(128),
  "badge_asset_key" VARCHAR(128),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rocket_level_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rocket_level_configs_campaign_id_level_key"
  ON "rocket_level_configs" ("campaign_id", "level");

DO $$ BEGIN
  ALTER TABLE "rocket_level_configs"
    ADD CONSTRAINT "rocket_level_configs_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "rocket_campaign_configs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "rocket_config_audits" (
  "id" BIGSERIAL NOT NULL,
  "actor_id" BIGINT,
  "action" VARCHAR(32) NOT NULL,
  "campaign_id" BIGINT,
  "before" JSONB,
  "after" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rocket_config_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "rocket_config_audits_campaign_id_created_at_idx"
  ON "rocket_config_audits" ("campaign_id", "created_at");

-- Default ladder for every existing campaign; reuses the five GCS jet videos (rocket.launch_lv1..5).
INSERT INTO "rocket_level_configs"
  ("campaign_id", "level", "name", "threshold_coins", "reward_pool_percentage", "max_winners_count",
   "reward_distribution_rules", "frame_days", "theme_color", "visual_tier", "launch_asset_key")
SELECT c."id", l."level", l."name", l."threshold", l."pool", l."winners", l."rules"::jsonb,
       l."frame_days", l."theme", l."level", 'rocket.launch_lv' || l."level"
FROM "rocket_campaign_configs" c
CROSS JOIN (VALUES
  (1, 'Emerald',     10000000, 12.0,  5, '[40,25,15,12,8]',                1, '#10B981'),
  (2, 'Amethyst',    30000000, 13.0,  7, '[35,22,15,10,8,6,4]',            2, '#A855F7'),
  (3, 'Crimson',     60000000, 14.0,  7, '[35,22,15,10,8,6,4]',            3, '#EF4444'),
  (4, 'Solar Gold', 100000000, 15.0, 10, '[30,18,12,10,8,6,5,4,4,3]',      5, '#F59E0B'),
  (5, 'Cosmic',     150000000, 16.0, 10, '[30,18,12,10,8,6,5,4,4,3]',      7, '#6366F1')
) AS l("level", "name", "threshold", "pool", "winners", "rules", "frame_days", "theme")
ON CONFLICT ("campaign_id", "level") DO NOTHING;
