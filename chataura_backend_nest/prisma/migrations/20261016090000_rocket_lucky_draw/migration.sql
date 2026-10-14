-- Rocket lucky draw: a % of people present in the room win random coins on launch.
-- Defaults are 0 (off) so existing payouts do not change until an admin sets them.

ALTER TABLE "rocket_level_configs"
  ADD COLUMN IF NOT EXISTS "lucky_audience_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lucky_pool_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "rocket_launches"
  ADD COLUMN IF NOT EXISTS "lucky_pool" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lucky_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "audience_count" INTEGER NOT NULL DEFAULT 0;

-- TOP = ranked contributor reward; LUCKY = random audience reward. rank is null for LUCKY.
ALTER TABLE "rocket_rewards"
  ADD COLUMN IF NOT EXISTS "kind" VARCHAR(8) NOT NULL DEFAULT 'TOP',
  ADD COLUMN IF NOT EXISTS "rank" INTEGER;
