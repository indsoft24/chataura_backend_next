BEGIN;

SET LOCAL lock_timeout = '5s';

-- Moderation workflow columns expected by admin reports
ALTER TABLE "user_reports" ADD COLUMN IF NOT EXISTS "notes" TEXT,
ADD COLUMN IF NOT EXISTS "status" VARCHAR(32) NOT NULL DEFAULT 'pending';

-- XP is BigInt in the Prisma schema
ALTER TABLE "levels" ALTER COLUMN "min_xp" SET DATA TYPE BIGINT,
ALTER COLUMN "max_xp" SET DATA TYPE BIGINT;
ALTER TABLE "users" ALTER COLUMN "xp" SET DATA TYPE BIGINT;

CREATE INDEX IF NOT EXISTS "greedy_bets_status_created_at_idx" ON "greedy_bets"("status", "created_at");
CREATE INDEX IF NOT EXISTS "users_invited_by_idx" ON "users"("invited_by");

ALTER TABLE "relationship_rings" RENAME CONSTRAINT "relationship_rings_type_fkey" TO "relationship_rings_relationship_type_id_fkey";
ALTER TABLE "user_relationship_rings" RENAME CONSTRAINT "user_relationship_rings_ring_fkey" TO "user_relationship_rings_ring_id_fkey";

ALTER INDEX "agency_weekly_distributions_period_id_agency_user_id_room_owner" RENAME TO "agency_weekly_distributions_period_id_agency_user_id_room_o_key";
ALTER INDEX "relationship_period_scores_period_type_period_key_room_key_scor" RENAME TO "relationship_period_scores_period_type_period_key_room_key__idx";
ALTER INDEX "relationship_period_scores_relationship_id_period_type_period_k" RENAME TO "relationship_period_scores_relationship_id_period_type_peri_key";
ALTER INDEX "relationship_rings_type_code_key" RENAME TO "relationship_rings_relationship_type_id_code_key";
ALTER INDEX "relationship_rings_type_level_idx" RENAME TO "relationship_rings_relationship_type_id_min_level_idx";
ALTER INDEX "user_relationship_rings_user_idx" RENAME TO "user_relationship_rings_user_id_idx";
ALTER INDEX "user_relationship_rings_user_ring_key" RENAME TO "user_relationship_rings_user_id_ring_id_key";

COMMIT;
