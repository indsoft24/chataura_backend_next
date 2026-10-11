-- Acting host: who holds the host's powers while the host is away from the room.
-- Null whenever the host is present. Written only by RoomService.syncRoomAuthority.
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "acting_host_id" BIGINT;
