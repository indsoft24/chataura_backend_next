-- Offline recharge: coin sellers listed in the app with a WhatsApp contact number.

CREATE TABLE IF NOT EXISTS "coin_seller_contacts" (
  "id" BIGSERIAL NOT NULL,
  "user_id" BIGINT NOT NULL,
  "whatsapp_e164" VARCHAR(16) NOT NULL,
  "countries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "coin_seller_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "coin_seller_contacts_user_id_key" ON "coin_seller_contacts"("user_id");
CREATE INDEX IF NOT EXISTS "coin_seller_contacts_is_active_sort_order_idx" ON "coin_seller_contacts"("is_active", "sort_order");

DO $$ BEGIN
  ALTER TABLE "coin_seller_contacts"
    ADD CONSTRAINT "coin_seller_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
