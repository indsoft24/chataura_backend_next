-- Coin sellers (and the super admin) can give SVIP. Sellers pay `seller_price` coins from their balance.
ALTER TABLE "svip_level_configs" ADD COLUMN "seller_price" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "svip_gifts" (
    "id" BIGSERIAL NOT NULL,
    "giver_id" BIGINT NOT NULL,
    "giver_role" VARCHAR(8) NOT NULL,
    "user_id" BIGINT NOT NULL,
    "level" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "price_coins" BIGINT NOT NULL DEFAULT 0,
    "recharge_coins" BIGINT NOT NULL DEFAULT 0,
    "request_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "svip_gifts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "svip_gifts_giver_id_request_id_key" ON "svip_gifts"("giver_id", "request_id");
CREATE INDEX "svip_gifts_giver_id_created_at_idx" ON "svip_gifts"("giver_id", "created_at" DESC);
CREATE INDEX "svip_gifts_user_id_created_at_idx" ON "svip_gifts"("user_id", "created_at" DESC);
