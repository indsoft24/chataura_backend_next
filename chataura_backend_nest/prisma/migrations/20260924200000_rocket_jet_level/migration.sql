-- Jet skin level + top contributor for identical room-wide Rockit FX
ALTER TABLE "rocket_launches" ADD COLUMN IF NOT EXISTS "jet_level" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "rocket_launches" ADD COLUMN IF NOT EXISTS "top_contributor_id" BIGINT;
