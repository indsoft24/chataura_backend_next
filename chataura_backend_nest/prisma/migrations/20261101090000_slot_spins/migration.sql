-- Lucky Slots: one row per spin; id = client request id (idempotent retries).
CREATE TABLE "slot_spins" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "bet" BIGINT NOT NULL,
    "payout" BIGINT NOT NULL,
    "grid" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slot_spins_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "slot_spins_user_id_created_at_idx" ON "slot_spins"("user_id", "created_at" DESC);
