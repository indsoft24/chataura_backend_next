-- SVIP is earned by coins received (Razorpay recharge or from a coin seller) inside the recharge window,
-- not by rupees. One tracker for direct buyers and seller customers.
ALTER TABLE "svip_level_configs" ADD COLUMN "recharge_coins" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "svip_level_configs" ADD COLUMN "renew_coins" BIGINT NOT NULL DEFAULT 0;

UPDATE "svip_level_configs" c SET "recharge_coins" = v.buy, "renew_coins" = v.renew
FROM (VALUES
  (1, 35750000::bigint,   25000000::bigint),
  (2, 112500000::bigint,  82500000::bigint),
  (3, 375000000::bigint,  275000000::bigint),
  (4, 875000000::bigint,  625000000::bigint),
  (5, 1750000000::bigint, 1250000000::bigint)
) AS v(level, buy, renew)
WHERE c."level" = v.level;

-- Credit used so far, per received-coin lot. lot_key: 'p:<coin purchase id>' (Razorpay) or 't:<coin transaction id>' (seller transfer).
CREATE TABLE "svip_coin_spends" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "lot_key" VARCHAR(32) NOT NULL,
    "coins" BIGINT NOT NULL,
    "level" INTEGER NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "svip_coin_spends_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "svip_coin_spends_lot_key_idx" ON "svip_coin_spends"("lot_key");
CREATE INDEX "svip_coin_spends_user_id_created_at_idx" ON "svip_coin_spends"("user_id", "created_at");
