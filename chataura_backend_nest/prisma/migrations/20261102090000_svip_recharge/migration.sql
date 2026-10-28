-- SVIP is earned by real-money recharge (rupees per level, inside a rolling window), not bought with coins.
ALTER TABLE "svip_level_configs" ADD COLUMN "recharge_inr" DECIMAL(12,2) NOT NULL DEFAULT 0;
-- SVIP 1 starts at Rs 500; the super admin can change it (and set the other levels) in the panel.
UPDATE "svip_level_configs" SET "recharge_inr" = 500 WHERE "level" = 1;

CREATE TABLE "svip_recharge_spends" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "purchase_id" BIGINT NOT NULL,
    "amount_inr" DECIMAL(12,2) NOT NULL,
    "level" INTEGER NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "svip_recharge_spends_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "svip_recharge_spends_purchase_id_idx" ON "svip_recharge_spends"("purchase_id");
CREATE INDEX "svip_recharge_spends_user_id_created_at_idx" ON "svip_recharge_spends"("user_id", "created_at");
