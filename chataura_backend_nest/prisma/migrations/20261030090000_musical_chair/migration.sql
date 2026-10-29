-- Room Musical Chair: one running session per room.
CREATE TABLE "musical_chair_sessions" (
    "id" BIGSERIAL NOT NULL,
    "room_id" UUID NOT NULL,
    "starter_id" BIGINT NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'idle',
    "paused_seat" INTEGER,
    "paused_user_id" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_action_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "musical_chair_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "musical_chair_sessions_room_id_idx" ON "musical_chair_sessions"("room_id");
-- Two people starting at once: the second insert fails instead of making a second session.
CREATE UNIQUE INDEX "musical_chair_sessions_one_running_per_room" ON "musical_chair_sessions"("room_id") WHERE "ended_at" IS NULL;
ALTER TABLE "musical_chair_sessions" ADD CONSTRAINT "musical_chair_sessions_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
