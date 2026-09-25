-- Private rooms: password gate + discovery/ranking exclusion + seat join mode.
-- Schema already declared these fields; production was missing the SQL migration
-- (Prisma queries against rooms.is_private caused SERVER_ERROR on list/create/rankings).

ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "is_private" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "password_hash" VARCHAR(255);
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "seat_mode" VARCHAR(16) NOT NULL DEFAULT 'request';

CREATE INDEX IF NOT EXISTS "rooms_owner_id_is_permanent_is_private_idx"
  ON "rooms"("owner_id", "is_permanent", "is_private");
