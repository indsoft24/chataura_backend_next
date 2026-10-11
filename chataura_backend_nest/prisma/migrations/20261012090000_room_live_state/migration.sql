-- Server-authoritative live room state: the version of each room's published state document
-- (Firestore rooms/{id}/live/state). Strictly increasing and floored to wall-clock ms so it is
-- always above any seats_version a released app already holds.
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "state_version" BIGINT NOT NULL DEFAULT 0;
UPDATE "rooms" SET "state_version" = (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint WHERE "state_version" = 0;

