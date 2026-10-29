-- SVIP games: room dice (skin + re-roll) and Gold Mine with Daily Treasure.

-- Per-level game perks (SVIP 1: 2 dice re-rolls, +2 daily Gold Mine draws).
ALTER TABLE "svip_level_configs" ADD COLUMN "dice_refreshes" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "svip_level_configs" ADD COLUMN "gold_mine_bonus_draws" INTEGER NOT NULL DEFAULT 2;

-- Every room dice roll (audit + cooldown + re-roll window). The server picks the value.
CREATE TABLE "dice_rolls" (
    "id" BIGSERIAL NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "value" INTEGER NOT NULL,
    "svip_level" INTEGER NOT NULL DEFAULT 0,
    "refresh_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dice_rolls_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dice_rolls_user_id_created_at_idx" ON "dice_rolls"("user_id", "created_at");
CREATE INDEX "dice_rolls_room_id_created_at_idx" ON "dice_rolls"("room_id", "created_at");
ALTER TABLE "dice_rolls" ADD CONSTRAINT "dice_rolls_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dice_rolls" ADD CONSTRAINT "dice_rolls_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mines a user can activate with coins. Prices are set in the super admin panel.
CREATE TABLE "gold_mine_plans" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "price" BIGINT NOT NULL,
    "duration_days" INTEGER NOT NULL DEFAULT 30,
    "daily_draws" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gold_mine_plans_pkey" PRIMARY KEY ("id")
);
INSERT INTO "gold_mine_plans" ("id", "name", "price", "duration_days", "daily_draws") VALUES
    (1, 'Mine 1', 300000, 30, 3),
    (2, 'Mine 2', 1000000, 30, 7);

-- A user's mine. Buying the same mine again while it runs extends it.
CREATE TABLE "user_gold_mines" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_gold_mines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_gold_mines_user_id_plan_id_key" ON "user_gold_mines"("user_id", "plan_id");
ALTER TABLE "user_gold_mines" ADD CONSTRAINT "user_gold_mines_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_gold_mines" ADD CONSTRAINT "user_gold_mines_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "gold_mine_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Weighted prize pool for daily draws (admin-defined). kind: coins | frame.
CREATE TABLE "gold_mine_prizes" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "coins" BIGINT NOT NULL DEFAULT 0,
    "frame_id" BIGINT,
    "days" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gold_mine_prizes_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "gold_mine_prizes" ADD CONSTRAINT "gold_mine_prizes_frame_id_fkey"
    FOREIGN KEY ("frame_id") REFERENCES "frames"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One row per draw; `prize` is a snapshot of what was won. `day` = IST date (draws reset at 00:00 IST).
CREATE TABLE "gold_mine_draws" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "prize_id" BIGINT,
    "day" VARCHAR(10) NOT NULL,
    "prize" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gold_mine_draws_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "gold_mine_draws_user_id_day_idx" ON "gold_mine_draws"("user_id", "day");
ALTER TABLE "gold_mine_draws" ADD CONSTRAINT "gold_mine_draws_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gold_mine_draws" ADD CONSTRAINT "gold_mine_draws_prize_id_fkey"
    FOREIGN KEY ("prize_id") REFERENCES "gold_mine_prizes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
