-- Migration: 20261021090000_single_session_device_cap
-- Purpose: one account = one active phone (a new login ends the old session), and a cap on
--          how many normal accounts one phone can create (stops signup-bonus farming).

ALTER TABLE "users" ADD COLUMN "current_session_id" VARCHAR(36);
ALTER TABLE "refresh_tokens" ADD COLUMN "session_id" VARCHAR(36);

CREATE TABLE "auth_devices" (
    "id" BIGSERIAL NOT NULL,
    "device_id" VARCHAR(128) NOT NULL,
    "user_id" BIGINT NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "auth_devices_device_id_user_id_key" ON "auth_devices"("device_id", "user_id");
CREATE INDEX "auth_devices_user_id_idx" ON "auth_devices"("user_id");
ALTER TABLE "auth_devices" ADD CONSTRAINT "auth_devices_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
