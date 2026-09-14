-- CreateEnum
CREATE TYPE "RoomMemberRole" AS ENUM ('host', 'co_host', 'speaker', 'listener');

-- CreateEnum
CREATE TYPE "GameRoundPhase" AS ENUM ('betting', 'drawing', 'completed');

-- CreateEnum
CREATE TYPE "GameBetStatus" AS ENUM ('placed', 'won', 'lost');

-- CreateEnum
CREATE TYPE "StarChatStatus" AS ENUM ('active', 'ended');

-- AlterTable
ALTER TABLE "admin_settings" ADD COLUMN     "star_chat_commission_pct" DECIMAL(8,2) NOT NULL DEFAULT 30,
ADD COLUMN     "star_chat_heartbeat_seconds" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "star_chat_price_per_min" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "gifts" ADD COLUMN     "animation_url" TEXT;

-- CreateTable
CREATE TABLE "room_themes" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "image_url" TEXT,
    "coin_cost" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "display_id" VARCHAR(8) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "owner_id" BIGINT NOT NULL,
    "host_id" BIGINT,
    "co_host_id" BIGINT,
    "agora_channel_name" VARCHAR(128) NOT NULL,
    "max_seats" INTEGER NOT NULL DEFAULT 8,
    "is_live" BOOLEAN NOT NULL DEFAULT true,
    "is_permanent" BOOLEAN NOT NULL DEFAULT false,
    "cover_image_url" TEXT,
    "description" TEXT,
    "tags" JSONB,
    "settings" JSONB,
    "theme_id" BIGINT,
    "country_code" VARCHAR(8),
    "allowed_country" VARCHAR(8),
    "allowed_gender" VARCHAR(16),
    "min_age" INTEGER,
    "max_age" INTEGER,
    "last_activity_at" TIMESTAMPTZ(6),
    "host_last_heartbeat_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_members" (
    "id" BIGSERIAL NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "role" "RoomMemberRole" NOT NULL DEFAULT 'listener',
    "seat_index" INTEGER,
    "agora_uid" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seats" (
    "id" BIGSERIAL NOT NULL,
    "room_id" UUID NOT NULL,
    "seat_index" INTEGER NOT NULL,
    "user_id" BIGINT,
    "is_muted" BOOLEAN NOT NULL DEFAULT false,
    "muted_by_user_id" BIGINT,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "last_heartbeat_at" TIMESTAMPTZ(6),

    CONSTRAINT "seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_blocks" (
    "id" BIGSERIAL NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "reason" VARCHAR(255),
    "kind" VARCHAR(16) NOT NULL DEFAULT 'block',
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stickers" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "coin_cost" INTEGER NOT NULL DEFAULT 0,
    "image_url" TEXT,
    "animation_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stickers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_unlocked_stickers" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "sticker_id" BIGINT NOT NULL,
    "coins_paid" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_unlocked_stickers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "greedy_rounds" (
    "id" BIGSERIAL NOT NULL,
    "phase" "GameRoundPhase" NOT NULL DEFAULT 'betting',
    "betting_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "winning_item" VARCHAR(32),
    "winning_multiplier" INTEGER,
    "settled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "greedy_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "greedy_bets" (
    "id" BIGSERIAL NOT NULL,
    "round_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "item" VARCHAR(32) NOT NULL,
    "chip_amount" BIGINT NOT NULL,
    "multiplier" INTEGER NOT NULL,
    "potential_payout" BIGINT NOT NULL,
    "actual_payout" BIGINT NOT NULL DEFAULT 0,
    "status" "GameBetStatus" NOT NULL DEFAULT 'placed',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "greedy_bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lucky77_rounds" (
    "id" BIGSERIAL NOT NULL,
    "phase" "GameRoundPhase" NOT NULL DEFAULT 'betting',
    "betting_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "winning_item" VARCHAR(32),
    "winning_multiplier" INTEGER,
    "settled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lucky77_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lucky77_bets" (
    "id" BIGSERIAL NOT NULL,
    "round_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "option" VARCHAR(32) NOT NULL,
    "chip_amount" BIGINT NOT NULL,
    "multiplier" INTEGER NOT NULL,
    "potential_payout" BIGINT NOT NULL,
    "actual_payout" BIGINT NOT NULL DEFAULT 0,
    "status" "GameBetStatus" NOT NULL DEFAULT 'placed',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lucky77_bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" BIGSERIAL NOT NULL,
    "type" VARCHAR(16) NOT NULL DEFAULT 'private',
    "name" VARCHAR(255),
    "image_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" BIGSERIAL NOT NULL,
    "conversation_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "last_read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" BIGSERIAL NOT NULL,
    "conversation_id" BIGINT NOT NULL,
    "sender_id" BIGINT NOT NULL,
    "message_type" VARCHAR(32) NOT NULL DEFAULT 'text',
    "message_text" TEXT,
    "message_media" TEXT,
    "gift_id" BIGINT,
    "sticker_id" BIGINT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'sent',
    "client_uuid" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "star_chat_sessions" (
    "id" BIGSERIAL NOT NULL,
    "conversation_id" BIGINT NOT NULL,
    "payer_id" BIGINT NOT NULL,
    "star_user_id" BIGINT NOT NULL,
    "status" "StarChatStatus" NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "payer_heartbeat_at" TIMESTAMPTZ(6),
    "price_per_min" INTEGER NOT NULL,
    "commission_percent" DECIMAL(8,2) NOT NULL,
    "coins_charged" BIGINT NOT NULL DEFAULT 0,
    "gems_credited" BIGINT NOT NULL DEFAULT 0,
    "end_reason" VARCHAR(64),

    CONSTRAINT "star_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_display_id_key" ON "rooms"("display_id");

-- CreateIndex
CREATE INDEX "rooms_is_live_last_activity_at_idx" ON "rooms"("is_live", "last_activity_at");

-- CreateIndex
CREATE INDEX "rooms_owner_id_idx" ON "rooms"("owner_id");

-- CreateIndex
CREATE INDEX "room_members_room_id_is_active_idx" ON "room_members"("room_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "room_members_room_id_user_id_key" ON "room_members"("room_id", "user_id");

-- CreateIndex
CREATE INDEX "seats_user_id_idx" ON "seats"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "seats_room_id_seat_index_key" ON "seats"("room_id", "seat_index");

-- CreateIndex
CREATE INDEX "room_blocks_room_id_user_id_idx" ON "room_blocks"("room_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_unlocked_stickers_user_id_sticker_id_key" ON "user_unlocked_stickers"("user_id", "sticker_id");

-- CreateIndex
CREATE INDEX "greedy_rounds_phase_betting_ends_at_idx" ON "greedy_rounds"("phase", "betting_ends_at");

-- CreateIndex
CREATE INDEX "greedy_bets_round_id_user_id_idx" ON "greedy_bets"("round_id", "user_id");

-- CreateIndex
CREATE INDEX "lucky77_rounds_phase_betting_ends_at_idx" ON "lucky77_rounds"("phase", "betting_ends_at");

-- CreateIndex
CREATE INDEX "lucky77_bets_round_id_user_id_idx" ON "lucky77_bets"("round_id", "user_id");

-- CreateIndex
CREATE INDEX "conversation_participants_user_id_idx" ON "conversation_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_user_id_key" ON "conversation_participants"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "star_chat_sessions_payer_id_status_idx" ON "star_chat_sessions"("payer_id", "status");

-- CreateIndex
CREATE INDEX "star_chat_sessions_conversation_id_status_idx" ON "star_chat_sessions"("conversation_id", "status");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_co_host_id_fkey" FOREIGN KEY ("co_host_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "room_themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_blocks" ADD CONSTRAINT "room_blocks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_blocks" ADD CONSTRAINT "room_blocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_unlocked_stickers" ADD CONSTRAINT "user_unlocked_stickers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_unlocked_stickers" ADD CONSTRAINT "user_unlocked_stickers_sticker_id_fkey" FOREIGN KEY ("sticker_id") REFERENCES "stickers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "greedy_bets" ADD CONSTRAINT "greedy_bets_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "greedy_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "greedy_bets" ADD CONSTRAINT "greedy_bets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lucky77_bets" ADD CONSTRAINT "lucky77_bets_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "lucky77_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lucky77_bets" ADD CONSTRAINT "lucky77_bets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "star_chat_sessions" ADD CONSTRAINT "star_chat_sessions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "star_chat_sessions" ADD CONSTRAINT "star_chat_sessions_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "star_chat_sessions" ADD CONSTRAINT "star_chat_sessions_star_user_id_fkey" FOREIGN KEY ("star_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

