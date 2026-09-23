-- AlterTable
ALTER TABLE "gifts" ADD COLUMN IF NOT EXISTS "category" VARCHAR(32) NOT NULL DEFAULT 'standard';

-- Backfill any nulls (defensive)
UPDATE "gifts" SET "category" = 'standard' WHERE "category" IS NULL OR "category" = '';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "gifts_is_active_category_idx" ON "gifts"("is_active", "category");
