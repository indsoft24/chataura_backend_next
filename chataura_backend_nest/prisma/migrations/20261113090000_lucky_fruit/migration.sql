-- Lucky Fruit (additive only)
CREATE TABLE "lucky_fruit_rounds" (
    "id" BIGSERIAL NOT NULL,
    "phase" "GameRoundPhase" NOT NULL DEFAULT 'betting',
    "opens_at" TIMESTAMPTZ(6) NOT NULL,
    "closes_at" TIMESTAMPTZ(6) NOT NULL,
    "winning_item" VARCHAR(16),
    "bonus_items" JSONB,
    "settled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lucky_fruit_rounds_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lucky_fruit_rounds_phase_closes_at_idx" ON "lucky_fruit_rounds"("phase", "closes_at");

CREATE TABLE "lucky_fruit_bets" (
    "id" BIGSERIAL NOT NULL,
    "round_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "item" VARCHAR(16) NOT NULL,
    "amount" BIGINT NOT NULL,
    "payout" BIGINT NOT NULL DEFAULT 0,
    "status" "GameBetStatus" NOT NULL DEFAULT 'placed',
    "client_uuid" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lucky_fruit_bets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lucky_fruit_bets_user_id_client_uuid_key" ON "lucky_fruit_bets"("user_id", "client_uuid");
CREATE INDEX "lucky_fruit_bets_round_id_user_id_idx" ON "lucky_fruit_bets"("round_id", "user_id");
CREATE INDEX "lucky_fruit_bets_user_id_created_at_idx" ON "lucky_fruit_bets"("user_id", "created_at" DESC);
ALTER TABLE "lucky_fruit_bets" ADD CONSTRAINT "lucky_fruit_bets_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "lucky_fruit_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lucky_fruit_bets" ADD CONSTRAINT "lucky_fruit_bets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "lucky_fruit_chest_claims" (
    "user_id" BIGINT NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "tier" INTEGER NOT NULL,
    "reward" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lucky_fruit_chest_claims_pkey" PRIMARY KEY ("user_id","day","tier")
);
