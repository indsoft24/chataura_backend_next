-- GST place of supply + audit evidence for coin recharges
ALTER TABLE "coin_purchase_transactions" ADD COLUMN IF NOT EXISTS "state" VARCHAR(64);
ALTER TABLE "coin_purchase_transactions" ADD COLUMN IF NOT EXISTS "state_source" VARCHAR(16);
ALTER TABLE "coin_purchase_transactions" ADD COLUMN IF NOT EXISTS "client_ip" VARCHAR(64);

-- Razorpay payment details synced from the gateway
ALTER TABLE "coin_purchase_transactions" ADD COLUMN IF NOT EXISTS "gateway_status" VARCHAR(24);
ALTER TABLE "coin_purchase_transactions" ADD COLUMN IF NOT EXISTS "payment_method" VARCHAR(24);
ALTER TABLE "coin_purchase_transactions" ADD COLUMN IF NOT EXISTS "gateway_data" JSONB;
ALTER TABLE "coin_purchase_transactions" ADD COLUMN IF NOT EXISTS "gateway_synced_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "coin_purchase_transactions_created_at_idx" ON "coin_purchase_transactions"("created_at");
CREATE INDEX IF NOT EXISTS "coin_purchase_transactions_status_updated_at_idx" ON "coin_purchase_transactions"("status", "updated_at");
