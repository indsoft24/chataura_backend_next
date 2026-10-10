-- Host-imposed mic mute is remembered per room member (not per seat), so leaving the seat or
-- the room and sitting again cannot clear it. Cleared only by an authorised unmute.
ALTER TABLE "room_members" ADD COLUMN IF NOT EXISTS "host_muted_by_user_id" BIGINT;
