-- Hub config, levels, rings, optional gift_id on ledger

ALTER TABLE "relationship_types"
    ADD COLUMN IF NOT EXISTS "max_partners" INTEGER,
    ADD COLUMN IF NOT EXISTS "formation_cost_coins" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "unbind_cost_coins" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "mic_exp_per_tick" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "mic_exp_daily_cap" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "relationship_score_ledger"
    ALTER COLUMN "gift_id" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "relationship_rings" (
    "id" UUID NOT NULL,
    "relationship_type_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "min_level" INTEGER NOT NULL,
    "image_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "relationship_rings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "relationship_rings_type_code_key"
    ON "relationship_rings" ("relationship_type_id", "code");

CREATE INDEX IF NOT EXISTS "relationship_rings_type_level_idx"
    ON "relationship_rings" ("relationship_type_id", "min_level");

ALTER TABLE "relationship_rings"
    ADD CONSTRAINT "relationship_rings_type_fkey"
    FOREIGN KEY ("relationship_type_id") REFERENCES "relationship_types"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "user_relationship_rings" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "ring_id" UUID NOT NULL,
    "relationship_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_relationship_rings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_relationship_rings_user_ring_key"
    ON "user_relationship_rings" ("user_id", "ring_id");

CREATE INDEX IF NOT EXISTS "user_relationship_rings_user_idx"
    ON "user_relationship_rings" ("user_id");

ALTER TABLE "user_relationship_rings"
    ADD CONSTRAINT "user_relationship_rings_ring_fkey"
    FOREIGN KEY ("ring_id") REFERENCES "relationship_rings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
