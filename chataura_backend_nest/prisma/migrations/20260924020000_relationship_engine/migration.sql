-- Relationship Engine (generic types: CP, BCP, future)

CREATE TABLE "relationship_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "exclusivity_mode" VARCHAR(32) NOT NULL DEFAULT 'none',
    "formation_rule" VARCHAR(48) NOT NULL DEFAULT 'first_qualifying_gift',
    "requires_accept" BOOLEAN NOT NULL DEFAULT false,
    "bidirectional_scoring" BOOLEAN NOT NULL DEFAULT true,
    "quantity_multiplies_points" BOOLEAN NOT NULL DEFAULT true,
    "levels_enabled" BOOLEAN NOT NULL DEFAULT false,
    "dm_gifts_count" BOOLEAN NOT NULL DEFAULT true,
    "room_gifts_count" BOOLEAN NOT NULL DEFAULT true,
    "visual" JSONB,
    "leaderboard" JSONB,
    "rank1_rewards" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "relationship_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "relationship_types_code_key" ON "relationship_types"("code");
CREATE INDEX "relationship_types_enabled_sort_order_idx" ON "relationship_types"("enabled", "sort_order");

CREATE TABLE "relationship_gift_rules" (
    "id" UUID NOT NULL,
    "gift_id" BIGINT NOT NULL,
    "relationship_type_id" UUID NOT NULL,
    "point_value" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "relationship_gift_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "relationship_gift_rules_gift_id_relationship_type_id_key"
  ON "relationship_gift_rules"("gift_id", "relationship_type_id");
CREATE INDEX "relationship_gift_rules_gift_id_enabled_idx"
  ON "relationship_gift_rules"("gift_id", "enabled");

CREATE TABLE "user_relationships" (
    "id" UUID NOT NULL,
    "relationship_type_id" UUID NOT NULL,
    "user_low_id" BIGINT NOT NULL,
    "user_high_id" BIGINT NOT NULL,
    "initiator_id" BIGINT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "total_score" BIGINT NOT NULL DEFAULT 0,
    "level" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_relationships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_relationships_relationship_type_id_user_low_id_user_high_id_key"
  ON "user_relationships"("relationship_type_id", "user_low_id", "user_high_id");
CREATE INDEX "user_relationships_user_low_id_idx" ON "user_relationships"("user_low_id");
CREATE INDEX "user_relationships_user_high_id_idx" ON "user_relationships"("user_high_id");
CREATE INDEX "user_relationships_relationship_type_id_total_score_idx"
  ON "user_relationships"("relationship_type_id", "total_score");

CREATE TABLE "relationship_score_ledger" (
    "id" UUID NOT NULL,
    "relationship_id" UUID NOT NULL,
    "gift_transaction_id" VARCHAR(191) NOT NULL,
    "sender_id" BIGINT NOT NULL,
    "receiver_id" BIGINT NOT NULL,
    "gift_id" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "point_value" INTEGER NOT NULL,
    "contribution" BIGINT NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "room_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationship_score_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "relationship_score_ledger_gift_transaction_id_key"
  ON "relationship_score_ledger"("gift_transaction_id");
CREATE INDEX "relationship_score_ledger_relationship_id_created_at_idx"
  ON "relationship_score_ledger"("relationship_id", "created_at");

CREATE TABLE "relationship_period_scores" (
    "id" UUID NOT NULL,
    "relationship_id" UUID NOT NULL,
    "period_type" VARCHAR(16) NOT NULL,
    "period_key" VARCHAR(32) NOT NULL,
    "room_key" VARCHAR(64) NOT NULL DEFAULT '',
    "score" BIGINT NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "relationship_period_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "relationship_period_scores_relationship_id_period_type_period_key_room_key_key"
  ON "relationship_period_scores"("relationship_id", "period_type", "period_key", "room_key");
CREATE INDEX "relationship_period_scores_period_type_period_key_room_key_score_idx"
  ON "relationship_period_scores"("period_type", "period_key", "room_key", "score");

CREATE TABLE "relationship_level_thresholds" (
    "id" UUID NOT NULL,
    "relationship_type_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "min_score" BIGINT NOT NULL,
    "rewards" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationship_level_thresholds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "relationship_level_thresholds_relationship_type_id_level_key"
  ON "relationship_level_thresholds"("relationship_type_id", "level");

ALTER TABLE "relationship_gift_rules"
  ADD CONSTRAINT "relationship_gift_rules_relationship_type_id_fkey"
  FOREIGN KEY ("relationship_type_id") REFERENCES "relationship_types"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_relationships"
  ADD CONSTRAINT "user_relationships_relationship_type_id_fkey"
  FOREIGN KEY ("relationship_type_id") REFERENCES "relationship_types"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "relationship_score_ledger"
  ADD CONSTRAINT "relationship_score_ledger_relationship_id_fkey"
  FOREIGN KEY ("relationship_id") REFERENCES "user_relationships"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "relationship_period_scores"
  ADD CONSTRAINT "relationship_period_scores_relationship_id_fkey"
  FOREIGN KEY ("relationship_id") REFERENCES "user_relationships"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "relationship_level_thresholds"
  ADD CONSTRAINT "relationship_level_thresholds_relationship_type_id_fkey"
  FOREIGN KEY ("relationship_type_id") REFERENCES "relationship_types"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
