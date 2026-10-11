-- Lucky 77: client request id per bet — a retried request (timeout / double tap) is applied once.
ALTER TABLE "lucky77_bets" ADD COLUMN IF NOT EXISTS "client_uuid" VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS "lucky77_bets_user_id_client_uuid_key" ON "lucky77_bets"("user_id", "client_uuid");
