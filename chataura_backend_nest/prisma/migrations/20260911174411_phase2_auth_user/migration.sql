-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "FollowStatus" AS ENUM ('accepted', 'pending');

-- CreateEnum
CREATE TYPE "FriendRequestStatus" AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'seller', 'admin', 'agency');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(32),
    "password" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "display_name" VARCHAR(255),
    "avatar_url" TEXT,
    "bio" TEXT,
    "gender" VARCHAR(16),
    "dob" DATE,
    "language" VARCHAR(16),
    "country" VARCHAR(8),
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "invite_code" VARCHAR(16),
    "invited_by" BIGINT,
    "email_verified_at" TIMESTAMPTZ(6),
    "fcm_token" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "exp" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "coin_balance" BIGINT NOT NULL DEFAULT 0,
    "wallet_balance" BIGINT NOT NULL DEFAULT 0,
    "referral_balance" BIGINT NOT NULL DEFAULT 0,
    "gems" BIGINT NOT NULL DEFAULT 0,
    "inr_earnings_balance" BIGINT NOT NULL DEFAULT 0,
    "usd_earnings_balance" BIGINT NOT NULL DEFAULT 0,
    "private_account" BOOLEAN NOT NULL DEFAULT false,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "show_online_status" BOOLEAN NOT NULL DEFAULT true,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMPTZ(6),
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspended_reason" TEXT,
    "suspended_until" TIMESTAMPTZ(6),
    "account_status" "AccountStatus" NOT NULL DEFAULT 'active',
    "deleted_at" TIMESTAMPTZ(6),
    "is_star_account" BOOLEAN NOT NULL DEFAULT false,
    "star_rank" INTEGER,
    "star_bio_tag" VARCHAR(255),
    "audio_call_rate" INTEGER,
    "video_call_rate" INTEGER,
    "selected_frame_id" BIGINT,
    "last_client_country" VARCHAR(8),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "device_id" VARCHAR(255),
    "platform" VARCHAR(32),
    "fcm_token" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_followers" (
    "id" BIGSERIAL NOT NULL,
    "follower_id" BIGINT NOT NULL,
    "following_id" BIGINT NOT NULL,
    "status" "FollowStatus" NOT NULL DEFAULT 'accepted',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_followers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "friend_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friend_requests" (
    "id" BIGSERIAL NOT NULL,
    "sender_id" BIGINT NOT NULL,
    "receiver_id" BIGINT NOT NULL,
    "status" "FriendRequestStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_users" (
    "id" BIGSERIAL NOT NULL,
    "blocker_id" BIGINT NOT NULL,
    "blocked_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reports" (
    "id" BIGSERIAL NOT NULL,
    "reporter_id" BIGINT NOT NULL,
    "reported_id" BIGINT NOT NULL,
    "reason" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_invite_code_key" ON "users"("invite_code");

-- CreateIndex
CREATE INDEX "users_account_status_idx" ON "users"("account_status");

-- CreateIndex
CREATE INDEX "users_is_star_account_star_rank_idx" ON "users"("is_star_account", "star_rank");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "user_devices_user_id_idx" ON "user_devices"("user_id");

-- CreateIndex
CREATE INDEX "user_followers_following_id_status_idx" ON "user_followers"("following_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_followers_follower_id_following_id_key" ON "user_followers"("follower_id", "following_id");

-- CreateIndex
CREATE INDEX "friendships_friend_id_idx" ON "friendships"("friend_id");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_user_id_friend_id_key" ON "friendships"("user_id", "friend_id");

-- CreateIndex
CREATE INDEX "friend_requests_receiver_id_status_idx" ON "friend_requests"("receiver_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "friend_requests_sender_id_receiver_id_key" ON "friend_requests"("sender_id", "receiver_id");

-- CreateIndex
CREATE INDEX "blocked_users_blocked_id_idx" ON "blocked_users"("blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_users_blocker_id_blocked_id_key" ON "blocked_users"("blocker_id", "blocked_id");

-- CreateIndex
CREATE INDEX "user_reports_reported_id_idx" ON "user_reports"("reported_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_followers" ADD CONSTRAINT "user_followers_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_followers" ADD CONSTRAINT "user_followers_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
