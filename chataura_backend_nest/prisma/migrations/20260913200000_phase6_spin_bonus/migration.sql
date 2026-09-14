ALTER TABLE "admin_settings" ADD COLUMN "spin_cost" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "admin_settings" ADD COLUMN "bonus_config" JSONB;

ALTER TABLE "users" ADD COLUMN "streak_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "last_streak_at" TIMESTAMP(6) WITH TIME ZONE;

CREATE TABLE "bonus_claims" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bonus_claims_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bonus_claims_user_id_kind_created_at_idx" ON "bonus_claims"("user_id", "kind", "created_at");

ALTER TABLE "bonus_claims" ADD CONSTRAINT "bonus_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
