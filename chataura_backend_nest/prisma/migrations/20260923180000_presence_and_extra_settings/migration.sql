-- Admin settings used by room video + bonus config readers
ALTER TABLE "admin_settings" ADD COLUMN IF NOT EXISTS "extra_settings" JSONB;

-- Room join presence tracking (party-room bonuses depend on this)
CREATE TABLE IF NOT EXISTS "user_room_presence_sessions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "room_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "accumulated_seconds" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "closed_at" TIMESTAMPTZ(6),
    "close_reason" VARCHAR(64),
    "final_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_room_presence_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_room_presence_sessions_user_id_is_active_idx"
  ON "user_room_presence_sessions"("user_id", "is_active");

CREATE INDEX IF NOT EXISTS "user_room_presence_sessions_room_id_is_active_idx"
  ON "user_room_presence_sessions"("room_id", "is_active");

DO $$ BEGIN
  ALTER TABLE "user_room_presence_sessions"
    ADD CONSTRAINT "user_room_presence_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_room_presence_sessions"
    ADD CONSTRAINT "user_room_presence_sessions_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
