-- Room gifting battle: one live battle per room, payouts recorded once per (battle, user, role).
CREATE TABLE "room_battles" (
    "id" BIGSERIAL NOT NULL,
    "room_id" UUID NOT NULL,
    "initiator_id" BIGINT NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'live',
    "winner_side" VARCHAR(4),
    "red_total" BIGINT NOT NULL DEFAULT 0,
    "blue_total" BIGINT NOT NULL DEFAULT 0,
    "winner_pct" DOUBLE PRECISION NOT NULL,
    "initiator_pct" DOUBLE PRECISION NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),

    CONSTRAINT "room_battles_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "room_battles_room_id_idx" ON "room_battles"("room_id");
CREATE INDEX "room_battles_status_ends_at_idx" ON "room_battles"("status", "ends_at");
CREATE UNIQUE INDEX "room_battles_one_live_per_room" ON "room_battles"("room_id") WHERE "status" = 'live';
ALTER TABLE "room_battles" ADD CONSTRAINT "room_battles_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "battle_payouts" (
    "id" BIGSERIAL NOT NULL,
    "battle_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "role" VARCHAR(10) NOT NULL,
    "amount" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_payouts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "battle_payouts_battle_id_user_id_role_key" ON "battle_payouts"("battle_id", "user_id", "role");
ALTER TABLE "battle_payouts" ADD CONSTRAINT "battle_payouts_battle_id_fkey"
    FOREIGN KEY ("battle_id") REFERENCES "room_battles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
