-- Room Reward Levels: lifetime room gifting milestones (no reset), unlimited admin-editable levels.

-- AlterTable
ALTER TABLE "room_members" ADD COLUMN     "stay_started_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "room_reward_levels" (
    "id" BIGSERIAL NOT NULL,
    "level" INTEGER NOT NULL,
    "min_visitors" INTEGER NOT NULL,
    "min_room_coins" BIGINT NOT NULL,
    "owner_reward" BIGINT NOT NULL,
    "partner_reward" BIGINT NOT NULL,
    "partner_count" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "room_reward_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_reward_progress" (
    "room_id" UUID NOT NULL,
    "lifetime_coins" BIGINT NOT NULL DEFAULT 0,
    "last_level" INTEGER NOT NULL DEFAULT 0,
    "last_level_at" TIMESTAMPTZ(6),
    "pending_level" INTEGER,
    "pending_since" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "room_reward_progress_pkey" PRIMARY KEY ("room_id")
);

-- CreateTable
CREATE TABLE "room_reward_gifting" (
    "room_id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "lifetime_coins" BIGINT NOT NULL DEFAULT 0,
    "level_coins" BIGINT NOT NULL DEFAULT 0,
    "last_gift_at" TIMESTAMPTZ(6),

    CONSTRAINT "room_reward_gifting_pkey" PRIMARY KEY ("room_id","user_id")
);

-- CreateTable
CREATE TABLE "room_reward_payouts" (
    "id" BIGSERIAL NOT NULL,
    "room_id" UUID NOT NULL,
    "room_display_id" VARCHAR(8),
    "room_title" VARCHAR(255),
    "level" INTEGER NOT NULL,
    "owner_id" BIGINT NOT NULL,
    "owner_reward" BIGINT NOT NULL,
    "partner_reward" BIGINT NOT NULL,
    "partner_slots" INTEGER NOT NULL,
    "partners_paid" INTEGER NOT NULL,
    "total_paid" BIGINT NOT NULL,
    "room_coins_at" BIGINT NOT NULL,
    "qualified_visitors" INTEGER NOT NULL,
    "level_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_reward_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_reward_recipients" (
    "id" BIGSERIAL NOT NULL,
    "payout_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "rank" INTEGER,
    "amount" BIGINT NOT NULL,
    "gifted_coins" BIGINT NOT NULL DEFAULT 0,
    "stay_seconds" INTEGER NOT NULL DEFAULT 0,
    "stay_started_at" TIMESTAMPTZ(6),
    "ledger_ref" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_reward_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_reward_levels_level_key" ON "room_reward_levels"("level");

-- CreateIndex
CREATE INDEX "room_reward_progress_pending_level_idx" ON "room_reward_progress"("pending_level");

-- CreateIndex
CREATE INDEX "room_reward_gifting_room_id_level_coins_idx" ON "room_reward_gifting"("room_id", "level_coins");

-- CreateIndex
CREATE INDEX "room_reward_payouts_created_at_idx" ON "room_reward_payouts"("created_at");

-- CreateIndex
CREATE INDEX "room_reward_payouts_owner_id_created_at_idx" ON "room_reward_payouts"("owner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "room_reward_payouts_room_id_level_key" ON "room_reward_payouts"("room_id", "level");

-- CreateIndex
CREATE INDEX "room_reward_recipients_user_id_created_at_idx" ON "room_reward_recipients"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "room_reward_recipients_payout_id_user_id_key" ON "room_reward_recipients"("payout_id", "user_id");

-- AddForeignKey
ALTER TABLE "room_reward_progress" ADD CONSTRAINT "room_reward_progress_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_reward_gifting" ADD CONSTRAINT "room_reward_gifting_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_reward_gifting" ADD CONSTRAINT "room_reward_gifting_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_reward_recipients" ADD CONSTRAINT "room_reward_recipients_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "room_reward_payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Guard rails the app relies on (a bad admin edit or bug can never store nonsense).
ALTER TABLE "room_reward_levels"
    ADD CONSTRAINT "room_reward_levels_values_check" CHECK (
        "level" >= 1 AND "min_visitors" >= 0 AND "min_room_coins" > 0
        AND "owner_reward" >= 0 AND "partner_reward" >= 0 AND "partner_count" >= 0
    );
ALTER TABLE "room_reward_progress"
    ADD CONSTRAINT "room_reward_progress_values_check" CHECK ("lifetime_coins" >= 0 AND "last_level" >= 0);
ALTER TABLE "room_reward_gifting"
    ADD CONSTRAINT "room_reward_gifting_values_check" CHECK ("lifetime_coins" >= 0 AND "level_coins" >= 0);
ALTER TABLE "room_reward_recipients"
    ADD CONSTRAINT "room_reward_recipients_role_check" CHECK ("role" IN ('owner', 'partner') AND "amount" >= 0);

-- Members already in a room start their continuous stay now (rooms start from 0 at launch).
UPDATE "room_members" SET "stay_started_at" = NOW() WHERE "is_active" = true AND "stay_started_at" IS NULL;

-- Initial level table (published Room Reward Policy). Total = owner + partner_reward x partner_count.
INSERT INTO "room_reward_levels"
    ("level", "min_visitors", "min_room_coins", "owner_reward", "partner_reward", "partner_count", "is_active", "updated_at")
VALUES
    (1,   5,    10000000,   1100000,   200000,  1, true, NOW()),
    (2,   5,    20000000,   2200000,   600000,  1, true, NOW()),
    (3,  10,    40000000,   4400000,   800000,  2, true, NOW()),
    (4,  10,    60000000,   6510000,   830000,  3, true, NOW()),
    (5,  20,    90000000,   9510000,  1230000,  3, true, NOW()),
    (6,  30,   120000000,  12000000,  1300000,  4, true, NOW()),
    (7,  40,   150000000,  15000000,  1500000,  4, true, NOW()),
    (8,  50,   200000000,  19000000,  1680000,  5, true, NOW()),
    (9,  50,   400000000,  37500000,  2900000,  5, true, NOW()),
    (10, 50,   800000000,  73600000,  4800000,  6, true, NOW()),
    (11, 50,  1200000000, 107800000,  6700000,  6, true, NOW()),
    (12, 50,  1600000000, 136000000,  8000000,  7, true, NOW()),
    (13, 50,  2000000000, 168000000, 10000000,  7, true, NOW()),
    (14, 100, 2500000000, 207500000, 12500000,  7, true, NOW()),
    (15, 100, 3000000000, 235000000, 14750000,  8, true, NOW()),
    (16, 100, 6000000000, 420000000, 30000000,  9, true, NOW()),
    (17, 100, 9000000000, 595000000, 42500000, 10, true, NOW()),
    (18, 100, 12000000000, 723000000, 57000000, 11, true, NOW()),
    (19, 100, 15000000000, 867000000, 65250000, 12, true, NOW())
ON CONFLICT ("level") DO NOTHING;
