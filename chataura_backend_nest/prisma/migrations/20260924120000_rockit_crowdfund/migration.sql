-- Rockit crowdfund campaign + events + contributions

CREATE TABLE IF NOT EXISTS "rocket_campaign_configs" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(128) NOT NULL DEFAULT 'Rockit',
    "launch_threshold_coins" INTEGER NOT NULL,
    "reward_pool_percentage" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "max_winners_count" INTEGER NOT NULL DEFAULT 7,
    "reward_distribution_rules" JSONB NOT NULL,
    "minimum_contribution_required" INTEGER NOT NULL DEFAULT 1,
    "eligible_room_types" JSONB NOT NULL DEFAULT '["all"]',
    "rockit_duration_seconds" INTEGER NOT NULL DEFAULT 3600,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rocket_campaign_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "rocket_events" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "config_id" BIGINT NOT NULL,
    "accumulated_coins" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "launch_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rocket_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "rocket_contributions" (
    "id" BIGSERIAL NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "coins" INTEGER NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "tx_id" VARCHAR(191) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rocket_contributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rocket_contributions_tx_id_key" ON "rocket_contributions"("tx_id");
CREATE INDEX IF NOT EXISTS "rocket_events_room_id_status_idx" ON "rocket_events"("room_id", "status");
CREATE INDEX IF NOT EXISTS "rocket_events_expires_at_idx" ON "rocket_events"("expires_at");
CREATE INDEX IF NOT EXISTS "rocket_contributions_event_id_user_id_idx" ON "rocket_contributions"("event_id", "user_id");

ALTER TABLE "rocket_events" ADD CONSTRAINT "rocket_events_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rocket_events" ADD CONSTRAINT "rocket_events_config_id_fkey"
  FOREIGN KEY ("config_id") REFERENCES "rocket_campaign_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rocket_contributions" ADD CONSTRAINT "rocket_contributions_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "rocket_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rocket_contributions" ADD CONSTRAINT "rocket_contributions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed a default active campaign (Top-7 distribution)
INSERT INTO "rocket_campaign_configs" (
  "name", "launch_threshold_coins", "reward_pool_percentage", "max_winners_count",
  "reward_distribution_rules", "minimum_contribution_required", "eligible_room_types",
  "rockit_duration_seconds", "status"
) VALUES (
  'Rockit Default',
  100000,
  50,
  7,
  '[40,25,15,10,5,3,2]'::jsonb,
  1,
  '["all"]'::jsonb,
  3600,
  true
) ON CONFLICT DO NOTHING;
